import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import ServicesClient from "./ServicesClient";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await getAuthFromCookies();
  if (!user) {
    redirect("/login");
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    include: {
      subscriptions: {
        where: { status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!retailer) {
    redirect("/login");
  }

  const activeSubscription = retailer.subscriptions[0] || null;

  return (
    <ServicesClient subscription={activeSubscription} />
  );
}
