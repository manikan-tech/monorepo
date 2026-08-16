import { getAdminSession } from "../../../lib/admin-auth";
import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import AdminPageHeader from "../components/AdminPageHeader";
import AuditLogTable from "./AuditLogTable";

export const metadata = {
  title: "Audit Log | Manikan Admin",
};

export default async function AdminAuditLogPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const logs = await prisma.retailerAuditLog.findMany({
    include: {
      retailer: {
        select: { id: true, storeName: true },
      },
      admin: {
        select: { id: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500, 
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <AdminPageHeader
        label="Security & Operations"
        title="Global Audit Log"
        subtitle="Track administrative actions taken across all retailers on the platform."
      />
      <AuditLogTable initialLogs={logs} />
    </div>
  );
}
