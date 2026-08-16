import { prisma } from "../../lib/prisma";
import AdminPageHeader from "./components/AdminPageHeader";
import AdminStatCard from "./components/AdminStatCard";
import Link from "next/link";

export const metadata = { title: "Overview | Admin — Manikan" };


function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
function IconSession() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function InquiryStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-blue-50 text-blue-700 border-blue-200",
    CONTACTED: "bg-yellow-50 text-yellow-700 border-yellow-200",
    QUALIFIED: "bg-green-50 text-green-700 border-green-200",
    CLOSED: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${map[status] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {status}
    </span>
  );
}

export default async function AdminOverviewPage() {
  const [
    totalRetailers,
    activeRetailers,
    totalSessions,
    totalInquiries,
    newInquiries,
    recentInquiries,
    topRetailers,
  ] = await Promise.all([
    prisma.retailer.count(),
    prisma.retailer.count({ where: { isActivated: true } }),
    prisma.measurementSession.count(),
    prisma.businessInquiry.count(),
    prisma.businessInquiry.count({ where: { status: "NEW" } }),
    prisma.businessInquiry.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.measurementSession.groupBy({
      by: ["retailerId"],
      _count: { _all: true },
      orderBy: { _count: { retailerId: "desc" } },
      take: 5,
    }),
  ]);

  // Enrich top-retailer IDs with store names
  const retailerIds = topRetailers.map((r) => r.retailerId);
  const retailerDetails = await prisma.retailer.findMany({
    where: { id: { in: retailerIds } },
    select: { id: true, storeName: true, email: true, isActivated: true },
  });
  const retailerMap = Object.fromEntries(retailerDetails.map((r) => [r.id, r]));

  return (
    <div className="space-y-8">
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
            Platform Overview
          </p>
          <h1 className="font-display text-3xl font-semibold text-white leading-tight">
            Manikan{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                background: "linear-gradient(90deg, #C8966A 0%, #F0C080 50%, #C8966A 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Admin Dashboard
            </span>
          </h1>
          <p className="text-forest-200/70 text-sm mt-1 max-w-md">
            Monitor all retailers, manage B2B inquiries, and track platform-wide usage metrics.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <AdminStatCard label="Total Retailers" value={totalRetailers} icon={<IconUsers />} delay={100} accent="forest" />
        <AdminStatCard label="Active Retailers" value={activeRetailers} icon={<IconCheck />} delay={180} accent="green" />
        <AdminStatCard label="Widget Sessions" value={totalSessions} icon={<IconSession />} delay={260} accent="gold" />
        <AdminStatCard
          label="New Inquiries"
          value={newInquiries}
          icon={<IconMail />}
          delay={340}
          accent={newInquiries > 0 ? "gold" : "forest"}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div
          className="bg-white rounded-3xl shadow-soft border border-manikan-border overflow-hidden animate-fade-up"
          style={{ animationDelay: "420ms" }}
        >
          <div className="px-7 py-5 border-b border-manikan-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg, #C8966A, #F0C080)" }} />
              <h2 className="text-lg font-display font-semibold text-forest-900">Recent Inquiries</h2>
            </div>
            <Link
              href="/admin/inquiries"
              className="text-xs font-medium text-gold-600 hover:text-gold-700 transition-colors"
            >
              View all →
            </Link>
          </div>
          {recentInquiries.length === 0 ? (
            <div className="p-10 text-center text-forest-700/50 text-sm">No inquiries yet.</div>
          ) : (
            <ul className="divide-y divide-manikan-border/50">
              {recentInquiries.map((inquiry, i) => (
                <li
                  key={inquiry.id}
                  className="px-7 py-4 flex items-center justify-between hover:bg-cream-50/40 transition-colors animate-fade-up"
                  style={{ animationDelay: `${480 + i * 50}ms` }}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-forest-900 text-sm truncate">{inquiry.companyName}</p>
                    <p className="text-xs text-forest-700/50 truncate">{inquiry.contactName} · {inquiry.email}</p>
                  </div>
                  <InquiryStatusBadge status={inquiry.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div
          className="bg-white rounded-3xl shadow-soft border border-manikan-border overflow-hidden animate-fade-up"
          style={{ animationDelay: "500ms" }}
        >
          <div className="px-7 py-5 border-b border-manikan-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg, #C8966A, #F0C080)" }} />
              <h2 className="text-lg font-display font-semibold text-forest-900">Top Retailers</h2>
            </div>
            <span className="text-xs font-medium text-gold-600 bg-gold-50 border border-gold-200 px-3 py-1 rounded-full">
              By Sessions
            </span>
          </div>
          {topRetailers.length === 0 ? (
            <div className="p-10 text-center text-forest-700/50 text-sm">No session data yet.</div>
          ) : (
            <ul className="divide-y divide-manikan-border/50">
              {topRetailers.map((row, i) => {
                const retailer = retailerMap[row.retailerId];
                return (
                  <li
                    key={row.retailerId}
                    className="px-7 py-4 flex items-center gap-4 hover:bg-cream-50/40 transition-colors animate-fade-up"
                    style={{ animationDelay: `${560 + i * 50}ms` }}
                  >
                    <span className="w-6 h-6 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-forest-900 text-sm truncate">
                        {retailer?.storeName ?? "Unknown"}
                      </p>
                      <p className="text-xs text-forest-700/50 truncate">{retailer?.email}</p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-gold-600">
                      {row._count._all}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
