-- Manikan widget — virtual try-on fields (ADDITIVE ONLY)
--
-- Hand-authored from `prisma migrate diff`, with the destructive parts removed.
-- The raw diff ALSO proposed dropping Retailer.isActivated and
-- Retailer.widgetSettings — those columns exist in the shared DB (added by a
-- teammate on another branch) but are missing from this branch's schema.prisma.
-- Those DROP statements are intentionally EXCLUDED so this migration cannot
-- destroy their work. Apply with:
--     prisma db execute --file prisma/migrations/20260710120000_add_widget_tryon_fields/migration.sql
-- (Do NOT `prisma db push` from this branch — it would drop the Retailer columns.)

-- AlterTable: per-session hip measurement (MeasurementSession is empty → NOT NULL is safe)
ALTER TABLE "MeasurementSession" ADD COLUMN     "hipsCm" DOUBLE PRECISION NOT NULL;

-- AlterTable: product garment colour (hex) for the 3D dressed-avatar try-on
ALTER TABLE "Product" ADD COLUMN     "tshirtColorHex" TEXT;

-- AlterTable: per-size flat garment measurements for the 3D dressed-avatar try-on
ALTER TABLE "ProductVariant" ADD COLUMN     "garmentChestCm" DOUBLE PRECISION,
ADD COLUMN     "garmentLengthCm" DOUBLE PRECISION,
ADD COLUMN     "garmentShoulderCm" DOUBLE PRECISION,
ADD COLUMN     "garmentSleeveCm" DOUBLE PRECISION;
