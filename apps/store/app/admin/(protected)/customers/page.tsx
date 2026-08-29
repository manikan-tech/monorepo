import { prisma } from "../../../lib/prisma";
import AdminPageHeader from "../components/AdminPageHeader";
import CustomersTable from "./CustomersTable";

export const metadata = {
  title: "Customers | Manikan Admin",
};

export default async function AdminCustomersPage() {

  const customers = await prisma.customer.findMany({
    include: {
      _count: {
        select: { orders: true, reviews: true, sessions: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <AdminPageHeader
        label="Platform Users"
        title="Customer Management"
        subtitle="View all registered shoppers across the platform and their activity."
      />
      <CustomersTable initialCustomers={customers} />
    </div>
  );
}
