import { getAdminSession } from "../../../lib/admin-auth";
import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import AdminPageHeader from "../components/AdminPageHeader";
import AdminOrdersTable from "./AdminOrdersTable";

export const metadata = {
  title: "Orders | Manikan Admin",
};

export default async function AdminOrdersPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            include: { retailer: true }
          }
        }
      },
    },
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <AdminPageHeader
        label="Fulfillment"
        title="Platform Orders"
        subtitle="Manage and monitor orders across all retailers. Recover stuck returns."
      />
      <AdminOrdersTable initialOrders={orders} />
    </div>
  );
}
