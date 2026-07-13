// Shared "is this product 3D-try-on-ready?" check. A product qualifies only
// with a garment colour AND every variant carrying all four garment
// measurements — mirrors the gate enforced by /api/tryon and the config set via
// /api/retailer/products/[id]/tryon-config.
export function isProductTryOnEnabled(product: {
  tshirtColorHex: string | null;
  variants: {
    garmentChestCm: number | null;
    garmentLengthCm: number | null;
    garmentSleeveCm: number | null;
    garmentShoulderCm: number | null;
  }[];
}): boolean {
  return (
    product.tshirtColorHex !== null &&
    product.variants.length > 0 &&
    product.variants.every(
      (v) =>
        v.garmentChestCm !== null &&
        v.garmentLengthCm !== null &&
        v.garmentSleeveCm !== null &&
        v.garmentShoulderCm !== null
    )
  );
}
