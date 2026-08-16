-- Persists Stripe payment and refund identifiers for order-level refunds.
--
-- Apply with:
--     prisma db execute --file prisma/migrations/20260729000000_add_order_refund_fields/migration.sql --schema prisma/schema.prisma

ALTER TABLE "Order"
    ADD COLUMN "stripePaymentIntentId" TEXT,
    ADD COLUMN "refundReferenceId" TEXT;

CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key"
    ON "Order"("stripePaymentIntentId");

CREATE UNIQUE INDEX "Order_refundReferenceId_key"
    ON "Order"("refundReferenceId");
