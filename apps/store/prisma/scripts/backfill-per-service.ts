// One-time backfill for the 20260806120000_per_service_keys_and_subscriptions
// migration. That migration empties Plan/Subscription entirely (see its own
// comment) so the new per-service NOT NULL columns can be added cleanly.
// This script re-creates the same entitlements in the new per-service shape,
// and issues fresh ServiceApiKeys for every retailer (Retailer.apiKey no
// longer exists -- each service now has its own key).
//
// The values below are the REAL rows this environment's Plan/Subscription
// tables held immediately before the migration ran (captured by direct query
// right before the DELETEs, since by the time this script runs the old-shape
// rows are already gone -- there's nothing left to query at that point).
// Cross-check against pre-migration-snapshot.json, taken at the same time.
//
// Deliberately generalised over N plans (this environment had 3: Free,
// Starter, Growth -- not the single "Pro" plan an earlier version of this
// script assumed) and N subscriptions (this environment had 1, but the loop
// doesn't assume that).
//
// Safe to re-run: every write is idempotent (upsert on the new unique keys),
// except OLD_SUBSCRIPTIONS -> Subscription.create, which is NOT idempotent
// (Subscription has no natural unique key to upsert on pre-migration data).
// Re-running after a successful first run will create duplicate Subscription
// rows -- this is a one-shot script for this one migration, not a general
// utility.
import "dotenv/config";
import { prisma } from "../../app/lib/prisma";
import { generatePublicKey, SERVICES } from "../../app/lib/service-keys";

const OLD_PLANS = [
  {
    id: "cmsqcr70k0000361kgkpbh49h",
    name: "Free",
    priceEgpMonthly: 0,
    quotas: { VTON_2D: 50, BODY_MODELING: 100, RECOMMENDATION: 500 } as Record<string, number>,
  },
  {
    id: "cmsqcr8dw0001361k0xh5dpq9",
    name: "Starter",
    priceEgpMonthly: 999,
    quotas: { VTON_2D: 200, BODY_MODELING: 1000, RECOMMENDATION: 5000 } as Record<string, number>,
  },
  {
    id: "cmsqcr8fp0002361kmva0ypjw",
    name: "Growth",
    priceEgpMonthly: 2499,
    quotas: { VTON_2D: 1000, BODY_MODELING: 5000, RECOMMENDATION: 20000 } as Record<string, number>,
  },
];

const OLD_SUBSCRIPTIONS = [
  {
    retailerId: "cmsqcr8l80003361ksy8ekkr8", // Manikan Official Store
    oldPlanId: "cmsqcr8fp0002361kmva0ypjw", // Growth
    status: "ACTIVE" as const,
    stripeCustomerId: "cus_manikan_internal_dogfood",
    stripeSubscriptionId: "sub_manikan_internal_dogfood",
    currentPeriodEnd: new Date("2027-08-12T14:36:06.241Z"),
    currentPeriodUsage: { BODY_MODELING: 12 } as Record<string, number>,
    lastStripeEventAt: 0,
    // Which service keeps the real stripeSubscriptionId -- it's @unique, so
    // only one of the N per-service rows split from this one bundled
    // subscription can carry it. Chosen as the service with real recorded
    // usage, same reasoning the id itself was chosen for in the source data.
    primaryService: "BODY_MODELING" as const,
  },
];

async function main() {
  // ── 1. Re-create each old Plan as three per-service plans ──
  const plansByOldId = new Map<string, Map<string, { id: string }>>();
  for (const oldPlan of OLD_PLANS) {
    const byService = new Map<string, { id: string }>();
    for (const service of SERVICES) {
      const plan = await prisma.plan.upsert({
        where: { name_service: { name: oldPlan.name, service } },
        update: { priceEgpMonthly: oldPlan.priceEgpMonthly, quota: oldPlan.quotas[service] ?? 0 },
        create: {
          name: oldPlan.name,
          service,
          priceEgpMonthly: oldPlan.priceEgpMonthly,
          quota: oldPlan.quotas[service] ?? 0,
        },
      });
      byService.set(service, plan);
      console.log(`Plan "${oldPlan.name}"/${service}: quota=${oldPlan.quotas[service] ?? 0}`);
    }
    plansByOldId.set(oldPlan.id, byService);
  }

  // ── 2. Re-create each old Subscription as three per-service Subscriptions ──
  for (const oldSub of OLD_SUBSCRIPTIONS) {
    const plansForThisSub = plansByOldId.get(oldSub.oldPlanId);
    if (!plansForThisSub) {
      throw new Error(
        `OLD_SUBSCRIPTIONS references oldPlanId ${oldSub.oldPlanId}, which is not in OLD_PLANS`
      );
    }
    for (const service of SERVICES) {
      const plan = plansForThisSub.get(service)!;
      const isPrimary = service === oldSub.primaryService;
      await prisma.subscription.create({
        data: {
          retailerId: oldSub.retailerId,
          service,
          planId: plan.id,
          stripeCustomerId: oldSub.stripeCustomerId,
          stripeSubscriptionId: isPrimary ? oldSub.stripeSubscriptionId : null,
          status: oldSub.status,
          currentPeriodEnd: oldSub.currentPeriodEnd,
          currentPeriodUsage: oldSub.currentPeriodUsage[service] ?? 0,
          lastStripeEventAt: oldSub.lastStripeEventAt,
        },
      });
      console.log(
        `Subscription/${service} for ${oldSub.retailerId}: usage=${oldSub.currentPeriodUsage[service] ?? 0}, ` +
          `stripeSubscriptionId=${isPrimary ? oldSub.stripeSubscriptionId : "null"}`
      );
    }
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
