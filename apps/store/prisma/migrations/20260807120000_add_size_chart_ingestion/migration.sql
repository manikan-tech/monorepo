-- Size chart ingestion: retailers upload a measurement CSV, it is parsed,
-- validated, and either committed or flagged row-by-row for them to fix.
--
-- Purely additive: two new enums, one new table, two indexes, one FK. No
-- existing table is altered.
--
-- NOTE: `prisma migrate diff` also proposes `ALTER TABLE "Retailer" DROP
-- COLUMN "plan"`. That is deliberately NOT included here. `Retailer.plan` is a
-- legacy text column that exists in the database but not in schema.prisma,
-- predates the real Plan/Subscription models, and dropping it is a separate,
-- destructive decision that has nothing to do with this feature.

-- CreateEnum
CREATE TYPE "ChartType" AS ENUM ('BODY_FIT', 'GARMENT_TECHPACK');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACTION_REQUIRED', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "SizeChartIngestion" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "chartType" "ChartType" NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "rows" JSONB,
    "errors" JSONB,
    "committedRows" INTEGER NOT NULL DEFAULT 0,
    "hasWarnings" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizeChartIngestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SizeChartIngestion_retailerId_status_idx" ON "SizeChartIngestion"("retailerId", "status");

-- CreateIndex
CREATE INDEX "SizeChartIngestion_retailerId_createdAt_idx" ON "SizeChartIngestion"("retailerId", "createdAt");

-- AddForeignKey
ALTER TABLE "SizeChartIngestion" ADD CONSTRAINT "SizeChartIngestion_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
