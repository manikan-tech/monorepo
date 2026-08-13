import type { ChartType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  commitBodyFitVariants,
  commitGarmentConfig,
} from "../commit-measurements";
import { targetFieldsFor } from "../measurement-fields";
import { validateRows } from "./parse-chart";
import type { ParsedRow, RowError, RowWarning } from "./types";

// The whole ingestion pipeline behind a single id.
//
// It takes only a job id and reads everything else from the row, so it is
// completely independent of whatever dispatches it. Today the upload route
// awaits it inline; putting a real queue in front later means calling this
// same function from a worker and changes nothing here, in the schema, or in
// the commit functions.

const MISSING_MATCH_WARNING: RowWarning = {
  code: "MISSING_MATCH_FIELDS",
  message:
    "Missing chest/waist/hip. This size still saved, but size recommendations for it will be less accurate.",
};

type ResolvedProduct = { id: string; category: string };

export async function processIngestionJob(jobId: string): Promise<void> {
  const job = await prisma.sizeChartIngestion.findUnique({ where: { id: jobId } });
  if (!job) return;

  await prisma.sizeChartIngestion.update({
    where: { id: jobId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  try {
    const rawRows = (job.rows as unknown as Record<string, unknown>[]) ?? [];
    const outcome = await runPipeline(job.retailerId, job.chartType, rawRows);

    await prisma.sizeChartIngestion.update({
      where: { id: jobId },
      data: {
        status: outcome.errors.length > 0 ? "ACTION_REQUIRED" : "COMPLETE",
        rows: outcome.rows as unknown as Prisma.InputJsonValue,
        errors: outcome.errors as unknown as Prisma.InputJsonValue,
        rowCount: rawRows.length,
        committedRows: outcome.committedRows,
        // Warnings never gate status -- only errors do. A job can be COMPLETE
        // and still carry caveats, which is exactly why this is surfaced.
        hasWarnings: outcome.rows.some((r) => (r.warnings?.length ?? 0) > 0),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.sizeChartIngestion.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        failureReason:
          error instanceof Error ? error.message : "Ingestion failed unexpectedly",
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Resolve products, validate, then commit one product at a time.
 *
 * Exported so the PATCH resubmit path runs the identical logic over the
 * retailer's corrected rows rather than reimplementing validation.
 */
export async function runPipeline(
  retailerId: string,
  chartType: ChartType,
  rawRows: Record<string, unknown>[],
): Promise<{ rows: ParsedRow[]; errors: RowError[]; committedRows: number }> {
  const errors: RowError[] = [];

  // ── Resolve every referenced product_code, scoped to this retailer ──
  // The (retailerId, productCode) unique constraint does the tenant isolation:
  // another retailer's code simply does not resolve, so a CSV can never write
  // across tenants regardless of what it names.
  const codes = [
    ...new Set(
      rawRows
        .map((r) => readCell(r, "product_code"))
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  const products = codes.length
    ? await prisma.product.findMany({
        where: { retailerId, productCode: { in: codes } },
        select: { id: true, productCode: true, category: true },
      })
    : [];
  const productByCode = new Map<string, ResolvedProduct>(
    products.map((p) => [p.productCode, { id: p.id, category: p.category }]),
  );

  // Per-code resolution failures, recorded once each but reported per row.
  const unresolved = new Map<string, { code: RowError["code"]; message: string }>();
  for (const code of codes) {
    const product = productByCode.get(code);
    if (!product) {
      unresolved.set(code, {
        code: "UNKNOWN_PRODUCT_CODE",
        message: `No product with code "${code}" in your catalog`,
      });
      continue;
    }
    if (targetFieldsFor(chartType, product.category).length === 0) {
      unresolved.set(code, {
        code: "UNSUPPORTED_CATEGORY",
        message: `Unsupported category "${product.category}" -- no garment fields defined for it`,
      });
    }
  }

  const { rows, errors: rowErrors } = validateRows(chartType, rawRows, (code) => {
    if (unresolved.has(code)) return null;
    const product = productByCode.get(code);
    return product ? targetFieldsFor(chartType, product.category) : null;
  });
  errors.push(...rowErrors);

  // Emit an error per row for every unresolved product, so the retailer sees
  // the row they need to fix rather than a summary.
  rawRows.forEach((raw, index) => {
    const code = readCell(raw, "product_code");
    if (!code) return;
    const problem = unresolved.get(code);
    if (!problem) return;
    errors.push({
      rowNumber: index + 1,
      productCode: code,
      sizeLabel: readCell(raw, "size_label"),
      code: problem.code,
      message: problem.message,
    });
  });

  // ── Commit, grouped by product ──
  const byProduct = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productCode) ?? [];
    list.push(row);
    byProduct.set(row.productCode, list);
  }

  let committedRows = 0;

  for (const [code, group] of byProduct) {
    const product = productByCode.get(code)!;

    if (chartType === "GARMENT_TECHPACK") {
      // Colour is product-level; require the group to agree on it rather than
      // silently letting the last row win.
      const colours = [...new Set(group.map((r) => r.garmentColorHex))];
      if (colours.length > 1) {
        for (const row of group) {
          errors.push({
            rowNumber: row.rowNumber,
            productCode: code,
            sizeLabel: row.sizeLabel,
            code: "INCONSISTENT_COLOR",
            message: `garment_color_hex must be the same for every row of "${code}" (found ${colours.join(", ")})`,
            field: "garmentColorHex",
          });
        }
        continue;
      }

      const result = await commitGarmentConfig({
        productId: product.id,
        retailerId,
        garmentColorHex: colours[0],
        variants: group.map((r) => ({ sizeLabel: r.sizeLabel, ...r.values })),
      });
      if (!result.ok) {
        pushCommitFailure(errors, group, code, result);
        continue;
      }
      committedRows += group.length;
    } else {
      const result = await commitBodyFitVariants({
        productId: product.id,
        retailerId,
        variants: group.map((r) => ({ sizeLabel: r.sizeLabel, ...r.values })),
      });
      if (!result.ok) {
        pushCommitFailure(errors, group, code, result);
        continue;
      }
      committedRows += group.length;

      // Attach the quality caveat to the specific rows it applies to.
      const warned = new Set(result.warnedSizeLabels);
      for (const row of group) {
        if (warned.has(row.sizeLabel)) row.warnings = [MISSING_MATCH_WARNING];
      }
    }
  }

  // Drop rows that failed to commit from the committed set, but keep them in
  // `rows` so the fix screen can still render and edit them.
  return { rows, errors, committedRows };
}

function pushCommitFailure(
  errors: RowError[],
  group: ParsedRow[],
  productCode: string,
  result: { code: RowError["code"]; message: string; sizeLabel?: string },
) {
  // A committer rejects the whole product atomically. If it named a specific
  // size, flag that row; otherwise flag every row of the group, since any of
  // them could be the cause.
  const targets = result.sizeLabel
    ? group.filter((r) => r.sizeLabel === result.sizeLabel)
    : group;
  for (const row of targets.length ? targets : group) {
    errors.push({
      rowNumber: row.rowNumber,
      productCode,
      sizeLabel: row.sizeLabel,
      code: result.code,
      message: result.message,
    });
  }
}

function readCell(raw: Record<string, unknown>, column: string): string | null {
  const direct = raw[column];
  const value =
    direct !== undefined
      ? direct
      : raw[
          Object.keys(raw).find((k) => k.trim().toLowerCase() === column) ?? ""
        ];
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}
