import { getAdminSession } from "../../../lib/admin-auth";
import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import AdminPageHeader from "../components/AdminPageHeader";
import PlansManager from "./PlansManager";

export const metadata = {
  title: "Plan Management | Manikan Admin",
};

export default async function AdminPlansPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const plans = await prisma.plan.findMany({
    orderBy: [
      { service: "asc" },
      { priceEgpMonthly: "asc" },
    ],
  });

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <AdminPageHeader
        label="Pricing & Plans"
        title="Plan Management"
        subtitle="Create, update, and manage pricing tiers for each service."
      />
      <PlansManager initialPlans={plans} adminRole={session.role} />
    </div>
  );
}
