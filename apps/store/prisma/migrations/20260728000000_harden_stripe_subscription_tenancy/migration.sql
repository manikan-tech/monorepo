-- Preserve subscription history and reject cross-subscription state updates.
DROP INDEX IF EXISTS "Subscription_retailerId_key";
DROP INDEX IF EXISTS "Subscription_stripeCustomerId_key";

ALTER TABLE "Subscription"
  ADD COLUMN "lastStripeEventAt" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Subscription_retailerId_status_idx"
  ON "Subscription"("retailerId", "status");
CREATE INDEX "Subscription_stripeCustomerId_idx"
  ON "Subscription"("stripeCustomerId");

CREATE TABLE "BillingCheckout" (
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("stripeCheckoutSessionId")
);

ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
