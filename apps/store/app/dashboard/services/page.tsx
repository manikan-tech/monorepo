import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import ServicesClient from "./ServicesClient";
import { SERVICES } from "../../lib/service-keys";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await getAuthFromCookies();
  if (!user) {
    redirect("/login");
  }

  const retailer = await prisma.retailer.findUnique({ where: { id: user.sub } });
  if (!retailer) {
    redirect("/login");
  }

  // Each service is independently subscribed to -- fetch each one's own
  // latest active subscription, and its own available plan tiers, separately
  // rather than one bundled row.
  const subscriptionsByService = await Promise.all(
    SERVICES.map(async (service) => {
      const [subscription, plans] = await Promise.all([
        prisma.subscription.findFirst({
          where: { retailerId: user.sub, service, status: "ACTIVE" },
          include: { plan: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.plan.findMany({
          where: { service },
          orderBy: { priceEgpMonthly: "asc" },
        }),
      ]);
      return { service, subscription, plans };
    })
  );

  return <ServicesClient subscriptions={subscriptionsByService} />;
}
