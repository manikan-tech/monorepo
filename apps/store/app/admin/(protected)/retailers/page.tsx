import { prisma } from "../../../lib/prisma";
import AdminPageHeader from "../components/AdminPageHeader";
import RetailersTable from "./RetailersTable";

export const metadata = { title: "Retailers | Admin — Manikan" };

export default async function AdminRetailersPage() {
  const retailers = await prisma.retailer.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      storeName: true,
      email: true,
      isActivated: true,
      createdAt: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          products: true,
          sessions: true,
        },
      },
    },
  });

  const activeCount = retailers.filter((r) => r.isActivated).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <AdminPageHeader
          label="B2B Client Management"
          title="All "
          highlight="Retailers"
          subtitle="Activate or deactivate retailer accounts. All changes are applied instantly."
        />
        <div className="flex gap-3 mb-8 flex-shrink-0">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">Active</p>
            <p className="text-xl font-semibold text-green-800">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-forest-200 bg-forest-50 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-forest-700">Total</p>
            <p className="text-xl font-semibold text-forest-800">{retailers.length}</p>
          </div>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <RetailersTable initialRetailers={retailers} />
      </div>
    </div>
  );
}
