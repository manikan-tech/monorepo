import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
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

  const planName = retailer.subscriptions[0]?.plan?.name ?? "No Plan";

  return (
    <div className="space-y-8 max-w-4xl">
      <div
        className="relative overflow-hidden rounded-3xl p-8 animate-fade-up"
        style={{
          background: "linear-gradient(135deg, #12343b 0%, #1e5560 60%, #12343b 100%)",
          animationDelay: "0ms",
        }}
      >
        <div
          className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(200,150,102,0.18) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(200,150,102,0.1) 0%, transparent 70%)" }}
        />

        <div className="relative z-10 flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-400/80">
            Account Preferences
          </p>
          <h1 className="font-display text-3xl font-semibold text-white leading-tight">
            Settings
          </h1>
          <p className="text-forest-200/70 text-sm mt-1 max-w-md">
            Update your store profile and manage your security credentials.
          </p>
        </div>
      </div>

      <SettingsClient retailer={retailer} planName={planName} />
    </div>
  );
}
