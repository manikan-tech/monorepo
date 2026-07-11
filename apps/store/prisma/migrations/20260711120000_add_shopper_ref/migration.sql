-- Manikan widget — anonymous shopper identity (Phase 3a)
--
-- Adds MeasurementSession.shopperRef: an opaque, anonymous visitor token
-- (MVP "Tier 2" identity) that lets a returning shopper's sessions be linked
-- without any login. See docs/enterprise-roadmap.md for the Tier 3 (retailer
-- HMAC-signed customerRef) migration path.
--
-- NOTE: This migration intentionally contains ONLY the shopperRef delta.
-- The other widget try-on columns (Product.tshirtColorHex, ProductVariant.
-- garment*Cm, MeasurementSession.hipsCm, Retailer.isActivated/widgetSettings)
-- were applied to the shared DB in a prior session and already exist there —
-- `prisma migrate diff` against the live DB confirms shopperRef is the only
-- outstanding change. Apply with:
--     prisma db execute --file prisma/migrations/20260711120000_add_shopper_ref/migration.sql
-- (Do NOT `prisma db push` from this branch — unrelated drift may exist.)

-- AlterTable
ALTER TABLE "MeasurementSession" ADD COLUMN     "shopperRef" TEXT;
