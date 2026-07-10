import { getAuthFromCookies } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getAuthFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [totalProducts, widgetViews, tryonConversions, recentOrders, totalOrders] = await Promise.all([
    prisma.product.count({ where: { retailerId: user.sub } }),
    prisma.measurementSession.count({ where: { retailerId: user.sub } }),
    prisma.measurementSession.count({ where: { retailerId: user.sub, isPurchased: true } }),
    prisma.order.findMany({
      where: {
        items: {
          some: {
            product: { retailerId: user.sub }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        customer: true,
        items: {
          where: { product: { retailerId: user.sub } },
        }
      }
    }),
    prisma.order.count({
      where: {
        items: {
          some: {
            product: { retailerId: user.sub }
          }
        }
      }
    })
  ]);

  const conversionRate = widgetViews > 0 ? ((tryonConversions / widgetViews) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-8">
        <h2 className="text-2xl font-display text-forest-900 mb-2">Welcome to Manikan.io</h2>
        <p className="text-manikan-text-secondary mb-6">
          Here you can manage your fashion catalog and view widget performance.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-forest-50 p-6 rounded-xl border border-forest-100">
            <h3 className="text-forest-800 font-medium mb-1">Total Products</h3>
            <p className="text-3xl font-display font-semibold text-forest-950">{totalProducts}</p>
          </div>
          <div className="bg-cream-50 p-6 rounded-xl border border-cream-100">
            <h3 className="text-forest-800 font-medium mb-1">Total Orders</h3>
            <p className="text-3xl font-display font-semibold text-forest-950">{totalOrders}</p>
          </div>
          <div className="bg-cream-50 p-6 rounded-xl border border-cream-100">
            <h3 className="text-forest-800 font-medium mb-1">Widget Views (30d)</h3>
            <p className="text-3xl font-display font-semibold text-forest-950">{widgetViews}</p>
          </div>
          <div className="bg-gold-50 p-6 rounded-xl border border-gold-100">
            <h3 className="text-gold-800 font-medium mb-1">Try-on Conversions</h3>
            <p className="text-3xl font-display font-semibold text-gold-900">{conversionRate}%</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden">
        <div className="p-6 border-b border-manikan-border">
          <h3 className="text-lg font-display font-medium text-forest-900">Recent Orders</h3>
        </div>
        
        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-manikan-text-secondary">
            No orders found yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-forest-50/50 text-forest-800 text-sm font-medium border-b border-manikan-border">
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-manikan-border">
                {recentOrders.map((order) => {
                  // Calculate total for only the items belonging to this retailer
                  const retailerTotal = order.items.reduce((sum, item) => sum + (item.quantity * item.unitPriceEgp), 0);
                  
                  return (
                    <tr key={order.id} className="hover:bg-cream-50/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm text-forest-900">
                        #{order.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-6 py-4 text-manikan-text-secondary">
                        {order.customer.firstName} {order.customer.lastName}
                      </td>
                      <td className="px-6 py-4 text-manikan-text-secondary">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          order.status === 'DELIVERED' ? 'bg-green-50 text-green-700 border-green-200' :
                          order.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-manikan-text text-right">
                        EGP {retailerTotal.toFixed(2)}
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
