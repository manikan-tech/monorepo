import type { ChartType } from "@prisma/client";
import { garmentFieldsFor } from "./tryon-status";

// Which ProductVariant columns a given chart type targets, and how those
// columns map to/from CSV headers.
//
// This module deliberately does NOT restate any garment field list. It calls
// garmentFieldsFor(), so CATEGORY_GARMENT_FIELDS in tryon-status.ts stays the
// single source of truth and adding a category remains a one-line change
// there. Restating it here is exactly the bug that comment warns about.

/** The retailer's published size guide: "what body does our size M fit".
 *  Fixed five columns, identical for every category -- a blouse and a pair of
 *  trousers both describe a body the same way. */
export const BODY_FIT_FIELDS = [
  "chestCm",
  "waistCm",
  "hipCm",
  "lengthCm",
  "inseamCm",
] as const;

/** The subset of BODY_FIT_FIELDS the recommendation service actually matches
 *  on (compute_best_size_match reads chest/waist/hip only). A row missing any
 *  of these still commits, but it degrades size matching -- see
 *  commitBodyFitVariants' warning path. */
export const BODY_FIT_MATCH_FIELDS = ["chestCm", "waistCm", "hipCm"] as const;

/**
 * The measurement columns a chart writes for a given product.
 *
 * BODY_FIT ignores `category` entirely. GARMENT_TECHPACK delegates, and
 * returns an empty list for a category with no garment model (blouse, shirt,
 * jacket, skirt today) -- callers must treat empty as "unsupported for this
 * chart type" rather than "nothing to validate".
 */
export function targetFieldsFor(
  chartType: ChartType,
  category: string,
): readonly string[] {
  return chartType === "BODY_FIT" ? BODY_FIT_FIELDS : garmentFieldsFor(category);
}

/** camelCase Prisma column -> snake_case CSV header (`chestCm` -> `chest_cm`).
 *  snake_case matches demo-retailer-catalog-final.csv and the size-chart string
 *  the recommendation widget already sends. */
export function csvColumnFor(field: string): string {
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Inverse of csvColumnFor, restricted to the fields we actually accept.
 *  Returns null for any header that is not a known measurement column, so an
 *  unexpected column is ignored rather than silently written somewhere. */
export function fieldForCsvColumn(
  column: string,
  allowedFields: readonly string[],
): string | null {
  const normalized = column.trim().toLowerCase();
  return allowedFields.find((f) => csvColumnFor(f) === normalized) ?? null;
}
