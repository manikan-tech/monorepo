import { Prisma } from "@prisma/client";
import { SERVICES, type Service } from "./service-keys";

export const FREE_TIER_NAME = "Free";

// These are cross-retailer safety lanes, not monthly quotas. They keep a
// burst from many Free retailers out of the capacity needed by paid work on
// the shared 0.8-vCPU sustained host. Per-retailer limits live on Plan so
// they can be administered alongside the quota.
export const FREE_TIER_GLOBAL_CONCURRENCY_LIMITS: Record<Service, number> = {
  BODY_MODELING: 1,
  VTON_2D: 1,
  RECOMMENDATION: 2,
};

type DatabaseClient = Prisma.TransactionClient;

/**
 * Give a newly activated retailer the three approved Free service plans.
 * Existing subscriptions are intentionally preserved: activation must never
 * replace a paid, cancelled, or historically retained subscription row.
 */
export async function provisionDefaultFreeSubscriptions(
  tx: DatabaseClient,
  retailerId: string,
): Promise<void> {
  const [plans, existingSubscriptions] = await Promise.all([
    tx.plan.findMany({
      where: {
        name: FREE_TIER_NAME,
        priceEgpMonthly: 0,
        service: { in: [...SERVICES] },
      },
      select: { id: true, service: true },
    }),
    tx.subscription.findMany({
      where: { retailerId, service: { in: [...SERVICES] } },
      select: { service: true },
    }),
  ]);

  const plansByService = new Map(plans.map((plan) => [plan.service, plan]));
  const missingPlans = SERVICES.filter((service) => !plansByService.has(service));
  if (missingPlans.length > 0) {
    throw new Error(`Free plan configuration is incomplete for: ${missingPlans.join(", ")}`);
  }

  const subscribedServices = new Set(existingSubscriptions.map(({ service }) => service));
  const missingServices = SERVICES.filter((service) => !subscribedServices.has(service));
  if (missingServices.length === 0) return;

  await tx.subscription.createMany({
    data: missingServices.map((service) => ({
      retailerId,
      service,
      planId: plansByService.get(service)!.id,
      // Free subscriptions do not have a Stripe customer. The marker is
      // deliberately distinguishable from real `cus_...` identifiers.
      stripeCustomerId: `free_${retailerId}`,
      status: "ACTIVE" as const,
    })),
  });
}
