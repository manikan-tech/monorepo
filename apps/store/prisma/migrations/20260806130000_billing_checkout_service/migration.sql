-- BillingCheckout now records which service the checkout was for, since
-- Subscription rows are per-service. Safe as a plain NOT NULL add: this
-- table has no writer yet (the Stripe Checkout Session creation route is not
-- built yet) and currently has zero rows.
ALTER TABLE "BillingCheckout" ADD COLUMN     "service" TEXT NOT NULL;
