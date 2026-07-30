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
    <div className="space-y-8 max-w-5xl">
      <div
        className="relative overflow-hidden rounded-3xl p-8 animate-fade-up"
        style={{
          background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
          animationDelay: "0ms",
        }}
      >
        <div className="relative z-10 flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-400/80">
            Billing & Usage
          </p>
          <h1 className="font-display text-3xl font-semibold text-white leading-tight">
            Services & Quotas
          </h1>
          <p className="text-gray-400 text-sm mt-1 max-w-md">
            Monitor your API consumption and manage your AI capabilities.
          </p>
        </div>
      </div>

      <ServicesClient subscription={activeSubscription} />
    </div>
  );
}
