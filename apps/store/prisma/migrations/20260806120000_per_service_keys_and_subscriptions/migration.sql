-- Per-service API keys and subscriptions: BODY_MODELING, VTON_2D, and
-- RECOMMENDATION are now billed, keyed, and quota-tracked independently. A
-- retailer may subscribe to one, some, or all three.
--
-- Whatever is currently in Plan/Subscription is removed here and re-created
-- in the new per-service shape by prisma/scripts/backfill-per-service.ts, run
-- immediately after this migration. Their old values (usage count, Stripe
-- ids, etc) are preserved -- see that script for the exact mapping, and
-- /tmp .../pre-migration-snapshot.json for the pre-delete values captured
-- from the live DB right before this ran.
--
-- Originally this deleted two specific hardcoded dev/test ids. Those ids no
-- longer matched anything in the live database by the time this was actually
-- applied (see the review discussion in the size-chart-ingestion work) --
-- Plan/Subscription had real, current-shape rows under different ids, and
-- deleting by stale id was a silent no-op that left the tables non-empty,
-- which made the ADD COLUMN ... NOT NULL below fail outright (confirmed via
-- a dry run in a rolled-back transaction). Changed to unconditional deletes,
-- matching this migration's actual intent: empty both tables before adding
-- the NOT NULL columns, then let the backfill script fully repopulate them.
DELETE FROM "Subscription";
DELETE FROM "Plan";

-- DropIndex
DROP INDEX "Plan_name_key";
DROP INDEX "Retailer_apiKey_key";

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "quotas",
ADD COLUMN     "quota" INTEGER NOT NULL,
ADD COLUMN     "service" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Retailer" DROP COLUMN "apiKey";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "service" TEXT NOT NULL,
DROP COLUMN "currentPeriodUsage",
ADD COLUMN     "currentPeriodUsage" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ServiceApiKey" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceApiKey_apiKey_key" ON "ServiceApiKey"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceApiKey_retailerId_service_key" ON "ServiceApiKey"("retailerId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_service_key" ON "Plan"("name", "service");

-- CreateIndex
CREATE INDEX "Subscription_retailerId_service_status_idx" ON "Subscription"("retailerId", "service", "status");

-- AddForeignKey
ALTER TABLE "ServiceApiKey" ADD CONSTRAINT "ServiceApiKey_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
