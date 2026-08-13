import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { runPipeline } from "../../../../lib/ingestion/process-job";
import { parseRows, type ParsedRow } from "../../../../lib/ingestion/types";
import { csvColumnFor } from "../../../../lib/measurement-fields";

// ─── /api/retailer/size-charts/[id] ─────────────────────────────────────
// Job detail, and the human-in-the-loop resubmit for rows that failed
// validation. Tenant isolation matches the rest of the dashboard: a job
// belonging to another retailer is a 404, never a 403.

/** Corrections the retailer submits. Everything except rowNumber is optional
 *  -- an absent field keeps whatever was parsed originally. */
type RowPatch = {
  rowNumber?: unknown;
  productCode?: unknown;
  sizeLabel?: unknown;
  values?: unknown;
  garmentColorHex?: unknown;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await prisma.sizeChartIngestion.findUnique({ where: { id } });
  if (!job || job.retailerId !== user.sub) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

// ─── PATCH: resubmit corrected rows ───
//
// Rows are matched back by rowNumber, NOT by (productCode, sizeLabel). The
// correction may be to those very fields -- a typo'd size label is one of the
// things that produces UNKNOWN_SIZE in the first place -- so matching on them
// would make exactly the rows most likely to need fixing impossible to match.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await prisma.sizeChartIngestion.findUnique({ where: { id } });
  if (!job || job.retailerId !== user.sub) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "ACTION_REQUIRED") {
    return NextResponse.json(
      { error: `Only a job awaiting fixes can be resubmitted (this one is ${job.status})` },
      { status: 409 }
    );
  }

  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json(
      { error: "rows must be a non-empty array" },
      { status: 400 }
    );
  }

  const stored = parseRows(job.rows);
  const storedByNumber = new Map(stored.map((r) => [r.rowNumber, r]));

  // Rows the original parse rejected outright never made it into `rows`, so
  // allow a correction to reintroduce them by rowNumber from the error list.
  const erroredNumbers = new Set(
    (Array.isArray(job.errors) ? (job.errors as unknown as { rowNumber: number }[]) : []).map(
      (e) => e.rowNumber
    )
  );

  const merged = new Map<number, ParsedRow>(storedByNumber);

  for (const patch of body.rows as RowPatch[]) {
    if (typeof patch?.rowNumber !== "number") {
      return NextResponse.json(
        { error: "each row needs a numeric rowNumber" },
        { status: 400 }
      );
    }
    const rowNumber = patch.rowNumber;
    const existing = storedByNumber.get(rowNumber);

    if (!existing && !erroredNumbers.has(rowNumber)) {
      return NextResponse.json(
        { error: `row ${rowNumber} is not part of this job` },
        { status: 400 }
      );
    }

    merged.set(rowNumber, {
      rowNumber,
      productCode:
        typeof patch.productCode === "string"
          ? patch.productCode
          : (existing?.productCode ?? ""),
      sizeLabel:
        typeof patch.sizeLabel === "string"
          ? patch.sizeLabel
          : (existing?.sizeLabel ?? ""),
      values:
        patch.values && typeof patch.values === "object"
          ? (patch.values as Record<string, number | null>)
          : (existing?.values ?? {}),
      ...(typeof patch.garmentColorHex === "string"
        ? { garmentColorHex: patch.garmentColorHex }
        : existing?.garmentColorHex
          ? { garmentColorHex: existing.garmentColorHex }
          : {}),
    });
  }

  // Re-run the identical pipeline over the merged set rather than
  // reimplementing validation for the fix path. runPipeline expects raw
  // CSV-shaped records, so convert back to snake_case columns.
  const rawRows = [...merged.values()]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map((row) => {
      const raw: Record<string, unknown> = {
        product_code: row.productCode,
        size_label: row.sizeLabel,
      };
      if (row.garmentColorHex) raw.garment_color_hex = row.garmentColorHex;
      for (const [field, value] of Object.entries(row.values)) {
        raw[csvColumnFor(field)] = value;
      }
      return raw;
    });

  const outcome = await runPipeline(user.sub, job.chartType, rawRows);

  const updated = await prisma.sizeChartIngestion.update({
    where: { id: job.id },
    data: {
      status: outcome.errors.length > 0 ? "ACTION_REQUIRED" : "COMPLETE",
      rows: outcome.rows as unknown as Prisma.InputJsonValue,
      errors: outcome.errors as unknown as Prisma.InputJsonValue,
      committedRows: outcome.committedRows,
      hasWarnings: outcome.rows.some((r) => (r.warnings?.length ?? 0) > 0),
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ job: updated });
}
