import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { garmentFieldsFor } from "./tryon-status";
import { BODY_FIT_FIELDS, BODY_FIT_MATCH_FIELDS } from "./measurement-fields";
import { isPositiveNumber } from "./validation";

// ─── The only two writers of ProductVariant measurement columns ─────────
//
// Every caller goes through these: the tryon-config route (a human typing
// values into the dashboard), the CSV ingestion pipeline, and whatever
// AI/OCR extraction lands later. That is the point -- validation cannot
// diverge between a person and a model if there is only one implementation.
//
// Neither function returns a NextResponse and neither throws for an expected
// failure. They return a discriminated result, so an HTTP route can map it to
// a status code and the job handler can map the same result to a per-row
// error, without either one reimplementing the other's rules.

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type CommitErrorCode =
  | "INVALID_COLOR"
  | "EMPTY_VARIANTS"
  | "PRODUCT_NOT_FOUND"
  | "UNSUPPORTED_CATEGORY"
  | "INVALID_VARIANT"
  | "UNKNOWN_SIZE";

type ProductWithVariants = Prisma.ProductGetPayload<{
  include: { variants: true };
}>;

export type CommitResult =
  | { ok: true; product: ProductWithVariants; warnedSizeLabels: string[] }
  | {
      ok: false;
      code: CommitErrorCode;
      message: string;
      /** Set when the failure is attributable to one row, so the ingestion
       *  pipeline can point the retailer at it. */
      sizeLabel?: string;
    };

function fail(
  code: CommitErrorCode,
  message: string,
  sizeLabel?: string,
): CommitResult {
  return { ok: false, code, message, ...(sizeLabel ? { sizeLabel } : {}) };
}

/**
 * Set a product's garment colour and its per-size flat garment measurements.
 *
 * Extracted verbatim from the PUT handler of
 * app/api/retailer/products/[id]/tryon-config/route.ts. The check ORDER below
 * is load-bearing and must not be reordered: it decides which error a caller
 * sees when more than one thing is wrong, and that ordering is covered by the
 * behaviour-preservation harness. In particular colour and the variants-array
 * shape are both validated BEFORE the product is fetched, so a malformed body
 * aimed at a nonexistent product returns 400, not 404.
 *
 * Only updates variants that already exist -- it never creates one. Supplying
 * a subset of the product's sizes is allowed (isProductTryOnEnabled then
 * simply reports false). Extra keys on a variant object are ignored.
 */
export async function commitGarmentConfig(input: {
  productId: string;
  retailerId: string;
  garmentColorHex: unknown;
  variants: unknown;
}): Promise<CommitResult> {
  // 1. Colour.
  if (
    typeof input.garmentColorHex !== "string" ||
    !HEX_COLOR.test(input.garmentColorHex)
  ) {
    return fail(
      "INVALID_COLOR",
      "garmentColorHex is required and must be a hex colour (e.g. #1a1a2e)",
    );
  }
  const garmentColorHex = input.garmentColorHex;

  // 2. Variants array shape.
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    return fail("EMPTY_VARIANTS", "variants must be a non-empty array");
  }

  // 3. Product + tenant isolation. Which fields are required depends on the
  //    product's own category, so this must precede variant validation.
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { variants: true },
  });
  if (!product || product.retailerId !== input.retailerId) {
    return fail("PRODUCT_NOT_FOUND", "Product not found");
  }

  // 4. Category -> field list.
  const fields = garmentFieldsFor(product.category ?? "");
  if (fields.length === 0) {
    return fail(
      "UNSUPPORTED_CATEGORY",
      `Unsupported category "${product.category}" -- no garment fields defined for it`,
    );
  }

  // 5. Per-variant validation: every category field must be a positive number.
  const variantInputs: Array<{ sizeLabel: string } & Record<string, number>> = [];
  for (const v of input.variants as Array<Record<string, unknown>>) {
    if (
      !v ||
      typeof v.sizeLabel !== "string" ||
      !fields.every((f) => isPositiveNumber(v[f]))
    ) {
      return fail(
        "INVALID_VARIANT",
        `Each variant needs a sizeLabel and positive ${fields.join(", ")}`,
        typeof v?.sizeLabel === "string" ? v.sizeLabel : undefined,
      );
    }
    const row = { sizeLabel: v.sizeLabel } as { sizeLabel: string } & Record<
      string,
      number
    >;
    for (const f of fields) row[f] = v[f] as number;
    variantInputs.push(row);
  }

  // 6. Resolve each sizeLabel to an existing variant, building the writes.
  const variantBySize = new Map(product.variants.map((v) => [v.sizeLabel, v]));
  const updates: Prisma.PrismaPromise<unknown>[] = [
    prisma.product.update({
      where: { id: product.id },
      data: { garmentColorHex },
    }),
  ];

  for (const row of variantInputs) {
    const variant = variantBySize.get(row.sizeLabel);
    if (!variant) {
      return fail(
        "UNKNOWN_SIZE",
        `Unknown size "${row.sizeLabel}" for this product`,
        row.sizeLabel,
      );
    }
    const data: Record<string, number> = {};
    for (const f of fields) data[f] = row[f]!;
    updates.push(
      prisma.productVariant.update({ where: { id: variant.id }, data }),
    );
  }

  // 7. Atomic -- colour + all variant rows land together, or none do.
  await prisma.$transaction(updates);

  // 8. Re-read so the caller sees committed state.
  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    include: { variants: true },
  });

  return { ok: true, product: updated!, warnedSizeLabels: [] };
}

/**
 * Set a product's per-size BODY_FIT measurements -- the retailer's published
 * size guide ("what body does our size M fit"), which the recommendation
 * service matches a shopper's avatar against.
 *
 * Intentionally more lenient per-field than commitGarmentConfig, because these
 * fields are genuinely optional in a way garment tech-pack fields are not: a
 * pair of trousers has no meaningful chest measurement, and the existing
 * catalog CSV leaves inseam blank for tops. So:
 *   - each of the five fields is individually optional
 *   - a field that IS supplied must be a positive number, otherwise the row is
 *     rejected. This is the deliberate improvement over upload-csv/route.ts,
 *     which coerces both garbage and `0` to null via `||` and writes it anyway
 *   - a row carrying no measurement at all is rejected -- it would be a no-op
 *   - omitted fields are written as null rather than left stale, matching how
 *     retailer/products/route.ts creates variants
 *
 * Tenant isolation, update-only semantics, unknown-size handling and the
 * single transaction all match commitGarmentConfig.
 */
export async function commitBodyFitVariants(input: {
  productId: string;
  retailerId: string;
  variants: unknown;
}): Promise<CommitResult> {
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    return fail("EMPTY_VARIANTS", "variants must be a non-empty array");
  }

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { variants: true },
  });
  if (!product || product.retailerId !== input.retailerId) {
    return fail("PRODUCT_NOT_FOUND", "Product not found");
  }

  // Body-fit fields are category-independent, so unlike the garment path there
  // is no UNSUPPORTED_CATEGORY case here -- every product can carry a size guide.
  const rows: Array<{ sizeLabel: string; data: Record<string, number | null> }> =
    [];

  for (const v of input.variants as Array<Record<string, unknown>>) {
    if (!v || typeof v.sizeLabel !== "string") {
      return fail(
        "INVALID_VARIANT",
        `Each variant needs a sizeLabel and positive values for any of ${BODY_FIT_FIELDS.join(", ")}`,
        typeof v?.sizeLabel === "string" ? v.sizeLabel : undefined,
      );
    }

    const data: Record<string, number | null> = {};
    let supplied = 0;
    for (const f of BODY_FIT_FIELDS) {
      const raw = v[f];
      if (raw === undefined || raw === null || raw === "") {
        data[f] = null;
        continue;
      }
      if (!isPositiveNumber(raw)) {
        return fail(
          "INVALID_VARIANT",
          `variant "${v.sizeLabel}": ${f} must be a positive number`,
          v.sizeLabel,
        );
      }
      data[f] = raw;
      supplied++;
    }

    if (supplied === 0) {
      return fail(
        "INVALID_VARIANT",
        `variant "${v.sizeLabel}": at least one of ${BODY_FIT_FIELDS.join(", ")} is required`,
        v.sizeLabel,
      );
    }

    rows.push({ sizeLabel: v.sizeLabel, data });
  }

  const variantBySize = new Map(product.variants.map((v) => [v.sizeLabel, v]));
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  const warnedSizeLabels: string[] = [];

  for (const row of rows) {
    const variant = variantBySize.get(row.sizeLabel);
    if (!variant) {
      return fail(
        "UNKNOWN_SIZE",
        `Unknown size "${row.sizeLabel}" for this product`,
        row.sizeLabel,
      );
    }
    // Non-blocking: compute_best_size_match matches on chest/waist/hip and
    // treats a missing hip as 0.0, which badly skews its distance. The row
    // still commits; the caller surfaces the caveat.
    if (BODY_FIT_MATCH_FIELDS.some((f) => row.data[f] === null)) {
      warnedSizeLabels.push(row.sizeLabel);
    }
    updates.push(
      prisma.productVariant.update({ where: { id: variant.id }, data: row.data }),
    );
  }

  await prisma.$transaction(updates);

  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    include: { variants: true },
  });

  return { ok: true, product: updated!, warnedSizeLabels };
}
