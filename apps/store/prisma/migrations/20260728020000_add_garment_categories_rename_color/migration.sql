-- Rename Product.tshirtColorHex -> Product.garmentColorHex: this field is not
-- t-shirt-specific (it's the garment's base colour, used across categories).
--
-- Guarded because the rename was already applied out-of-band on the shared
-- database (the column is already garmentColorHex there, while this migration
-- is not recorded in _prisma_migrations). A bare ALTER would abort the whole
-- migration on that database before reaching the additive statements below.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Product' AND column_name = 'tshirtColorHex'
  ) THEN
    ALTER TABLE "Product" RENAME COLUMN "tshirtColorHex" TO "garmentColorHex";
  END IF;
END $$;

-- Add pants-category flat garment measurements, mirroring the existing
-- tee-category garmentChestCm/LengthCm/SleeveCm/ShoulderCm fields. Nullable
-- with no default, so this is a metadata-only change on Postgres: no table
-- rewrite, no backfill, and every existing tee variant is unaffected.
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "garmentWaistCm" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "garmentHipCm" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "garmentInseamCm" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "garmentRiseCm" DOUBLE PRECISION;
