// One-time backfill for the 20260806120000_per_service_keys_and_subscriptions
// migration. That migration deleted the single bundled "Pro" Plan and the
// single bundled Subscription row (values captured below from the live DB
// before deletion) so the new per-service NOT NULL columns could be added
// cleanly. This script re-creates the same entitlements in the new
// per-service shape, and issues fresh ServiceApiKeys for every retailer
// (Retailer.apiKey no longer exists -- each service now has its own key).
//
// Safe to re-run: every write is idempotent (upsert on the new unique keys).
import "dotenv/config";
import { prisma } from "../../app/lib/prisma";
import { generatePublicKey, SERVICES } from "../../app/lib/service-keys";

const OLD_PLAN = {
  name: "Pro",
  priceEgpMonthly: 2000,
  quotas: { VTON_2D: 5000, BODY_MODELING: 1000, RECOMMENDATION: 10000 } as Record<string, number>,
};

const OLD_SUBSCRIPTION = {
  retailerId: "cms73igx50003vlf0lx66ozoi", // Manikan Official Store
  status: "ACTIVE" as const,
  stripeCustomerId: "cus_dev_test",
  stripeSubscriptionId: "sub_dev_active",
  currentPeriodUsage: { BODY_MODELING: 67 } as Record<string, number>,
  lastStripeEventAt: 0,
};

async function main() {
  // ── 1. Re-create "Pro" as three per-service plans ──
  const plansByService = new Map<string, { id: string }>();
  for (const service of SERVICES) {
    const plan = await prisma.plan.upsert({
      where: { name_service: { name: OLD_PLAN.name, service } },
      update: { priceEgpMonthly: OLD_PLAN.priceEgpMonthly, quota: OLD_PLAN.quotas[service] ?? 0 },
      create: {
        name: OLD_PLAN.name,
        service,
        priceEgpMonthly: OLD_PLAN.priceEgpMonthly,
        quota: OLD_PLAN.quotas[service] ?? 0,
      },
    });
    plansByService.set(service, plan);
    console.log(`Plan "${OLD_PLAN.name}"/${service}: quota=${OLD_PLAN.quotas[service] ?? 0}`);
  }

  // ── 2. Re-create the bundled Subscription as three per-service Subscriptions ──
  // stripeSubscriptionId is globally unique, so only the first (arbitrarily,
  // BODY_MODELING -- the one with real recorded usage) keeps the original dev
  // Stripe id; the other two get none, since they never had their own Stripe
  // subscription object to begin with (this was one bundled dev subscription
  // covering all three, not three real independent ones).
  for (const service of SERVICES) {
    const plan = plansByService.get(service)!;
    const isPrimary = service === "BODY_MODELING";
    await prisma.subscription.create({
      data: {
        retailerId: OLD_SUBSCRIPTION.retailerId,
        service,
        planId: plan.id,
        stripeCustomerId: OLD_SUBSCRIPTION.stripeCustomerId,
        stripeSubscriptionId: isPrimary ? OLD_SUBSCRIPTION.stripeSubscriptionId : null,
        status: OLD_SUBSCRIPTION.status,
        currentPeriodUsage: OLD_SUBSCRIPTION.currentPeriodUsage[service] ?? 0,
        lastStripeEventAt: OLD_SUBSCRIPTION.lastStripeEventAt,
      },
    });
    console.log(
      `Subscription/${service}: usage=${OLD_SUBSCRIPTION.currentPeriodUsage[service] ?? 0}, stripeSubscriptionId=${isPrimary ? OLD_SUBSCRIPTION.stripeSubscriptionId : "null"}`
    );
  }

  // ── 3. Issue fresh per-service keys for every retailer ──
  const retailers = await prisma.retailer.findMany({ select: { id: true, storeName: true } });
  for (const retailer of retailers) {
    for (const service of SERVICES) {
      await prisma.serviceApiKey.upsert({
        where: { retailerId_service: { retailerId: retailer.id, service } },
        update: {},
        create: { retailerId: retailer.id, service, apiKey: generatePublicKey() },
      });
    }
    console.log(`Issued 3 service keys for retailer "${retailer.storeName}" (${retailer.id})`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
