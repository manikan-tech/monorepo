-- Make quota admission durable and concurrency-safe. A successful AI result
-- moves one unit from currentPeriodReserved to currentPeriodUsage.
ALTER TABLE "Subscription"
ADD COLUMN "currentPeriodReserved" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "UsageReservationStatus" AS ENUM ('PENDING', 'COMMITTED', 'RELEASED', 'EXPIRED');

CREATE TABLE "ServiceUsageReservation" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "UsageReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceUsageReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceUsageReservation_subscriptionId_requestId_key"
ON "ServiceUsageReservation"("subscriptionId", "requestId");

CREATE INDEX "ServiceUsageReservation_subscriptionId_status_expiresAt_idx"
ON "ServiceUsageReservation"("subscriptionId", "status", "expiresAt");

ALTER TABLE "ServiceUsageReservation"
ADD CONSTRAINT "ServiceUsageReservation_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
