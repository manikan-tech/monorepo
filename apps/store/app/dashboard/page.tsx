import { getAuthFromCookies } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getAuthFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [totalProducts, widgetViews, tryonConversions, recentOrders, totalOrders, retailer] = await Promise.all([
    prisma.product.count({ where: { retailerId: user.sub } }),
    prisma.measurementSession.count({ where: { retailerId: user.sub } }),
    prisma.measurementSession.count({ where: { retailerId: user.sub, isPurchased: true } }),
    prisma.order.findMany({
      where: { items: { some: { product: { retailerId: user.sub } } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        customer: true,
        items: { where: { product: { retailerId: user.sub } } },
      },
    }),
    prisma.order.count({
      where: { items: { some: { product: { retailerId: user.sub } } } },
    }),
    prisma.retailer.findUnique({
      where: { id: user.sub },
      select: { isActivated: true },
    }),
  ]);

  const conversionRate = widgetViews > 0 ? ((tryonConversions / widgetViews) * 100).toFixed(1) : "0.0";

  const stats = [
    {
      label: "Total Products",
      value: totalProducts,
      suffix: "",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
      bg: "bg-forest-50",
      border: "border-forest-100",
      iconBg: "bg-forest-900/8",
      iconColor: "text-forest-700",
      valueColor: "text-forest-950",
    },
    {
      label: "Total Orders",
      value: totalOrders,
      suffix: "",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
      bg: "bg-cream-50",
      border: "border-cream-100",
      iconBg: "bg-gold-400/10",
      iconColor: "text-gold-600",
      valueColor: "text-forest-950",
    },
    {
      label: "Widget Views (30d)",
      value: widgetViews,
      suffix: "",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
      bg: "bg-cream-50",
      border: "border-cream-100",
      iconBg: "bg-forest-900/8",
      iconColor: "text-forest-700",
      valueColor: "text-forest-950",
    },
    {
      label: "Try-on Conversions",
      value: conversionRate,
      suffix: "%",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      bg: "bg-gold-50",
      border: "border-gold-200",
      iconBg: "bg-gold-400/15",
      iconColor: "text-gold-600",
      valueColor: "text-gold-700",
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Pending Activation Banner ── */}
      {!retailer?.isActivated && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex items-start gap-4 shadow-soft animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="flex flex-col justify-center min-h-[3rem]">
            <h3 className="text-amber-900 font-display font-semibold text-lg">Your account is under review</h3>
            <p className="text-amber-800/80 text-sm mt-0.5">
              You cannot generate a Widget API key or fully integrate your store until an admin activates your account.
            </p>
          </div>
        </div>
      )}

      {/* ── Welcome Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-8 animate-fade-up"
        style={{
          background: "linear-gradient(135deg, #12343b 0%, #1e5560 60%, #12343b 100%)",
          animationDelay: "0ms",
        }}
      >
        {/* decorative glow orbs */}
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
            Retailer Overview
          </p>
          <h1 className="font-display text-3xl font-semibold text-white leading-tight">
            Welcome back,{" "}
            <span
              className="gold-shimmer bg-clip-text text-transparent"
              style={{
                background: "linear-gradient(90deg, #C8966A 0%, #F0C080 50%, #C8966A 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {user.name}
            </span>
          </h1>
          <p className="text-forest-200/70 text-sm mt-1 max-w-md">
            Manage your fashion catalog, track orders, and monitor your widget performance — all in one place.
          </p>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`relative group ${stat.bg} rounded-2xl p-6 border ${stat.border} shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card animate-fade-up`}
            style={{ animationDelay: `${100 + i * 80}ms` }}
          >
            {/* subtle gold top accent */}
            <div
              className="absolute top-0 left-6 h-[2px] w-12 rounded-full transition-all duration-300 group-hover:w-20"
              style={{ background: "linear-gradient(90deg, #C8966A, transparent)" }}
            />
            <div className="flex items-start justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-forest-700/60">
                {stat.label}
              </p>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.iconBg} ${stat.iconColor}`}>
                {stat.icon}
              </div>
            </div>
            <p className={`text-4xl font-display font-bold ${stat.valueColor} leading-none`}>
              {stat.value}{stat.suffix}
            </p>
          </div>
        ))}
      </div>

      {/* ── Recent Orders ── */}
      <div
        className="bg-white rounded-3xl shadow-soft border border-manikan-border overflow-hidden animate-fade-up"
        style={{ animationDelay: "450ms" }}
      >
        {/* table header */}
        <div className="px-8 py-5 border-b border-manikan-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg, #C8966A, #F0C080)" }} />
            <h3 className="text-lg font-display font-semibold text-forest-900">Recent Orders</h3>
          </div>
          <span className="text-xs font-medium text-gold-600 bg-gold-50 border border-gold-200 px-3 py-1 rounded-full">
            Last 5
          </span>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-forest-50 flex items-center justify-center text-forest-400">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 4 0M9 5h6" />
              </svg>
            </div>
            <p className="text-forest-700/60 font-medium">No orders yet.</p>
            <p className="text-xs text-forest-700/40">Orders for your products will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-forest-50/60 text-forest-700/70 text-xs font-bold uppercase tracking-widest border-b border-manikan-border">
                  <th className="px-8 py-4">Order ID</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-manikan-border/50">
                {recentOrders.map((order, i) => {
                  const retailerTotal = order.items.reduce(
                    (sum, item) => sum + item.quantity * item.unitPriceEgp,
                    0
                  );
                  return (
                    <tr
                      key={order.id}
                      className="group hover:bg-gold-50/30 transition-colors duration-200 animate-fade-up"
                      style={{ animationDelay: `${500 + i * 60}ms` }}
                    >
                      <td className="px-8 py-4">
                        <span className="font-mono text-sm font-semibold text-gold-600">
                          #{order.id.slice(-6).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-forest-100 flex items-center justify-center text-xs font-bold text-forest-700">
                            {order.customer.firstName[0]?.toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-forest-900">
                            {order.customer.firstName} {order.customer.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-forest-700/60">
                        {new Date(order.createdAt).toLocaleDateString("en", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            order.status === "DELIVERED"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : order.status === "CANCELLED"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : order.status === "SHIPPED"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-yellow-50 text-yellow-700 border-yellow-200"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            order.status === "DELIVERED" ? "bg-green-500" :
                            order.status === "CANCELLED" ? "bg-red-500" :
                            order.status === "SHIPPED" ? "bg-indigo-500" :
                            "bg-yellow-500"
                          }`} />
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-semibold text-forest-950 text-sm">
                          EGP{" "}
                          <span className="text-gold-700">{retailerTotal.toLocaleString("en", { minimumFractionDigits: 2 })}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
