-- CreateTable: Plan
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceEgpMonthly" DOUBLE PRECISION NOT NULL,
    "quotas" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Plan.name must be unique (tier lookup)
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- AlterTable: add planId + currentPeriodEnd to Subscription
ALTER TABLE "Subscription"
  ADD COLUMN "planId" TEXT,
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

-- AddForeignKey: Subscription → Plan
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
