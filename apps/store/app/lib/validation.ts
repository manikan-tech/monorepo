// Shared primitive validators.
//
// These bodies used to be copy-pasted into three separate route files
// (retailer/products, retailer/products/[id], tryon-config). That is the same
// drift pattern that made "pants" silently un-configurable once before -- see
// the comment at the top of tryon-status.ts -- just one level down, on the
// value checks instead of the field list. One definition, imported everywhere.

/** Finite and strictly greater than zero. Rejects `0`, `NaN`, `Infinity`,
 *  numeric strings, and every non-number -- there is deliberately no coercion,
 *  so `"38"` is invalid rather than quietly becoming 38. */
export function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** A whole number >= 0. Used for stock counts, where 0 is meaningful. */
export function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}
