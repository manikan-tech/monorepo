// Shared "is this product 3D-try-on-ready?" check, and the single source of
// truth for which garment measurements each category requires.
//
// Three places have to agree on that field list: this check, the config route
// (/api/retailer/products/[id]/tryon-config) and the widget-products route.
// They used to hold three independent hardcoded copies of the tee's four
// fields, which is why adding pants needed a change in each. They now all read
// CATEGORY_GARMENT_FIELDS instead, so a new category is one entry here.

export const GARMENT_CATEGORIES = ["tshirt", "pants"] as const;
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];

/** Measurement columns on ProductVariant that each category needs populated
 *  before a product can be offered for 3D try-on. All are flat/half
 *  measurements taken from a garment tech pack. */
export const CATEGORY_GARMENT_FIELDS = {
  tshirt: [
    "garmentChestCm",
    "garmentLengthCm",
    "garmentSleeveCm",
    "garmentShoulderCm",
  ],
  pants: [
    "garmentWaistCm",
    "garmentHipCm",
    "garmentInseamCm",
    "garmentRiseCm",
  ],
} as const satisfies Record<GarmentCategory, readonly string[]>;

export function isGarmentCategory(value: string): value is GarmentCategory {
  return (GARMENT_CATEGORIES as readonly string[]).includes(value);
}

/** The measurement fields required for a category. Unknown categories return
 *  an empty list, which makes isProductTryOnEnabled() return false rather than
 *  silently passing a product we have no garment model for. */
export function garmentFieldsFor(category: string): readonly string[] {
  return isGarmentCategory(category) ? CATEGORY_GARMENT_FIELDS[category] : [];
}

// `unknown`, not `number | null`: real callers pass full Prisma variant rows
// (id, sku, sizeLabel, ...), and an index signature requires every property
// on the argument to be assignable to it — a stricter value type here would
// reject any variant object carrying fields beyond the measurement columns.
type VariantMeasurements = Record<string, unknown>;

/**
 * A product qualifies for 3D try-on only with a garment colour AND every
 * variant carrying all of its category's measurements. Mirrors the gate
 * enforced by /api/tryon and the config set via the tryon-config route.
 */
export function isProductTryOnEnabled(product: {
  category?: string | null;
  garmentColorHex: string | null;
  variants: VariantMeasurements[];
}): boolean {
  const fields = garmentFieldsFor(product.category ?? "tshirt");
  if (fields.length === 0) return false;
  return (
    product.garmentColorHex !== null &&
    product.variants.length > 0 &&
    product.variants.every((v) =>
      fields.every((f) => v[f] !== null && v[f] !== undefined)
    )
  );
}
