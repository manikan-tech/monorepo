import { prisma } from "../../../lib/prisma";
import AdminPageHeader from "../components/AdminPageHeader";
import InquiriesTable from "./InquiriesTable";

export const metadata = { title: "B2B Inquiries | Admin — Manikan" };

export default async function AdminInquiriesPage() {
  const inquiries = await prisma.businessInquiry.findMany({
    orderBy: { createdAt: "desc" },
  });

  const newCount = inquiries.filter((i) => i.status === "NEW").length;
  const qualifiedCount = inquiries.filter((i) => i.status === "QUALIFIED").length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <AdminPageHeader
          label="CRM Pipeline"
          title="B2B "
          highlight="Inquiries"
          subtitle="Manage incoming business inquiries. Click any row to view the full message."
        />
        <div className="flex gap-3 mb-8 flex-shrink-0">
          {newCount > 0 && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">New</p>
              <p className="text-xl font-semibold text-blue-800">{newCount}</p>
            </div>
          )}
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">Qualified</p>
            <p className="text-xl font-semibold text-green-800">{qualifiedCount}</p>
          </div>
          <div className="rounded-2xl border border-forest-200 bg-forest-50 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-forest-700">Total</p>
            <p className="text-xl font-semibold text-forest-800">{inquiries.length}</p>
          </div>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <InquiriesTable initialInquiries={inquiries} />
      </div>
    </div>
  );
}
