-- BillingCheckout now records the exact plan tier selected, so the webhook
-- can activate the resulting Subscription on the right plan instead of
-- leaving planId unset. Safe as a plain NOT NULL add: this table has no
-- writer yet and currently has zero rows.
ALTER TABLE "BillingCheckout" ADD COLUMN     "planId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
