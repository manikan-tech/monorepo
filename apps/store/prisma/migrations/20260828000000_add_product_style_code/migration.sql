-- Groups colour variants of the same garment style for storefront and widget
-- colour selection. Existing products remain valid with a NULL styleCode.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "styleCode" TEXT;

CREATE INDEX IF NOT EXISTS "Product_retailerId_styleCode_idx"
  ON "Product"("retailerId", "styleCode");
