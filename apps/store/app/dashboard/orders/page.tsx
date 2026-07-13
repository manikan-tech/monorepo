import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import OrdersTable from "./OrdersTable";

export const metadata = {
  title: "Orders | Manikan Dashboard",
};

export default async function OrdersPage() {
  const user = await getAuthFromCookies();

  if (!user) {
    redirect("/login");
  }

  const orders = await prisma.order.findMany({
    where: { items: { some: { product: { retailerId: user.sub } } } },
    orderBy: { createdAt: "desc" },
    include: { 
      customer: true, 
      items: { 
        where: { product: { retailerId: user.sub } },
        include: { product: true }
      } 
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-up transition-all duration-500 hover:translate-x-1" style={{ animationDelay: "100ms" }}>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-400/90 animate-pulse">
            Order Tracking
          </p>
          <h2 className="text-3xl font-display font-semibold text-forest-950 leading-tight">
            Order <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">Management</span>
          </h2>
          <p className="text-forest-700/60 text-sm mt-1 max-w-2xl">Track and update the status of your customers' orders.</p>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <OrdersTable initialOrders={orders} />
      </div>
    </div>
  );
}
