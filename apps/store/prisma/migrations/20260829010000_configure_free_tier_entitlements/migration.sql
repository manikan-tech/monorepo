-- Approved Free-tier quota and per-retailer concurrency policy.
-- The limits are per retailer and per billing period: BODY_MODELING=10,
-- VTON_2D=3, RECOMMENDATION=50. A NULL concurrency limit means unlimited.
ALTER TABLE "Plan" ADD COLUMN "concurrentRequestLimit" INTEGER;

-- Upsert instead of relying on a development-only seed: deployed databases
-- receive the policy too, and fresh databases get the required three rows as
-- soon as the migration history is applied.
INSERT INTO "Plan" ("id", "name", "service", "priceEgpMonthly", "quota", "concurrentRequestLimit", "createdAt", "updatedAt")
VALUES
  ('free-plan-body-modeling', 'Free', 'BODY_MODELING', 0, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('free-plan-vton-2d', 'Free', 'VTON_2D', 0, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('free-plan-recommendation', 'Free', 'RECOMMENDATION', 0, 50, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name", "service") DO UPDATE
SET
  "priceEgpMonthly" = EXCLUDED."priceEgpMonthly",
  "quota" = EXCLUDED."quota",
  "concurrentRequestLimit" = EXCLUDED."concurrentRequestLimit",
  "updatedAt" = CURRENT_TIMESTAMP;
