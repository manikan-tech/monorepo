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
      <div className="flex items-center justify-between animate-fade-up" style={{ animationDelay: "100ms" }}>
        <div>
          <h2 className="text-2xl font-display text-forest-900">Order Management</h2>
          <p className="text-manikan-text-secondary">Track and update the status of your customers' orders.</p>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <OrdersTable initialOrders={orders} />
      </div>
    </div>
  );
}
