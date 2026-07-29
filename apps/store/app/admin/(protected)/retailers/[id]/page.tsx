import { getAdminSession } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import RetailerDetailToggle from "./RetailerDetailToggle";

export default async function RetailerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const { id } = await params;

  const retailer = await prisma.retailer.findUnique({
    where: { id },
    include: {
      _count: {
        select: { products: true, sessions: true, subscriptions: true, billingCheckouts: true }
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        include: { admin: true }
      }
    }
  });

  if (!retailer) {
    redirect("/admin/retailers");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-up">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/retailers"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-manikan-border text-forest-700 hover:bg-forest-50 transition-colors shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-forest-950">
              {retailer.storeName}
            </h1>
            <p className="text-forest-700/60 text-sm mt-1">{retailer.email}</p>
          </div>
        </div>
        
        <RetailerDetailToggle retailerId={retailer.id} isActivated={retailer.isActivated} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-8 animate-fade-up" style={{ animationDelay: "100ms" }}>
            <h2 className="text-lg font-display font-semibold text-forest-900 mb-6">Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs font-semibold text-forest-700/60 uppercase tracking-wider mb-1">Joined</p>
                <p className="font-medium text-forest-900">
                  {new Date(retailer.createdAt).toLocaleDateString("en", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-forest-700/60 uppercase tracking-wider mb-1">Plan</p>
                <p className="font-medium text-forest-900 capitalize">{retailer.plan}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-forest-700/60 uppercase tracking-wider mb-1">Products</p>
                <p className="font-mono font-medium text-forest-900">{retailer._count.products}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-forest-700/60 uppercase tracking-wider mb-1">Sessions</p>
                <p className="font-mono font-medium text-forest-900">{retailer._count.sessions}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6 animate-fade-up" style={{ animationDelay: "200ms" }}>
          <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-6 h-full flex flex-col">
            <h2 className="text-lg font-display font-semibold text-forest-900 mb-6 flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-600">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Activity Timeline
            </h2>

            <div className="flex-1">
              {retailer.auditLogs.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-forest-700/60 text-sm">No activity recorded yet.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-forest-100 ml-3 space-y-6">
                  {retailer.auditLogs.map((log) => (
                    <div key={log.id} className="relative pl-6">
                      <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                        log.action === "ACTIVATED" ? "bg-green-500" :
                        log.action === "SUSPENDED" ? "bg-red-500" :
                        "bg-gold-500"
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-forest-900">
                          {log.action === "ACTIVATED" ? "Account Activated" :
                           log.action === "SUSPENDED" ? "Account Suspended" :
                           "Plan Changed"}
                        </p>
                        <p className="text-xs text-forest-700/60 mt-1">
                          by <span className="font-medium text-forest-800">{log.admin.email}</span>
                        </p>
                        <p className="text-xs text-forest-400 mt-1">
                          {new Date(log.createdAt).toLocaleString("en", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "numeric",
                          })}
                        </p>
                        {log.reason && (
                          <div className="mt-2 text-xs text-forest-700 bg-forest-50 p-2 rounded-md border border-forest-100">
                            "{log.reason}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
