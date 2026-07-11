import React from "react";
import Link from "next/link";
import { getCustomerFromCookies } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { redirect } from "next/navigation";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSING: "bg-purple-50 text-purple-700 border-purple-200",
  SHIPPED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  DELIVERED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

export default async function AccountPage() {
  const customerAuth = await getCustomerFromCookies();

  if (!customerAuth) {
    redirect("/login");
  }

  // Fetch full customer details
  const customer = await prisma.customer.findUnique({
    where: { id: customerAuth.sub },
    include: {
      addresses: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 3, // Show only the 3 most recent orders
        include: {
          items: {
            include: {
              product: {
                select: { name: true, imageUrl: true }
              }
            }
          }
        }
      }
    }
  });

  if (!customer) {
    redirect("/login");
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12 md:py-20 w-full animate-fade-in-up">
      <h1 className="font-display text-4xl font-semibold text-forest-950 mb-10">My Account</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* ── Left Column: Personal Info ── */}
        <div className="lg:col-span-1 space-y-8">
          {/* Profile Card */}
          <div className="bg-white rounded-3xl p-8 border border-forest-900/5 shadow-soft">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-forest-900 text-gold-400 rounded-full flex items-center justify-center text-2xl font-display font-medium">
                {customer.firstName[0]}{customer.lastName[0]}
              </div>
              <div>
                <h2 className="text-xl font-display font-semibold text-forest-950">
                  {customer.firstName} {customer.lastName}
                </h2>
                <p className="text-sm text-forest-700/70">{customer.email}</p>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-forest-900/5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-forest-900/60">Phone</span>
                <span className="text-sm font-medium text-forest-950">{customer.phone || "Not provided"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-forest-900/60">Member Since</span>
                <span className="text-sm font-medium text-forest-950">
                  {new Date(customer.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
              </div>
            </div>

            <button className="w-full mt-8 py-3 px-4 bg-cream-50 text-forest-800 rounded-xl font-medium text-sm border border-forest-900/10 hover:bg-cream-100 transition-colors">
              Edit Profile
            </button>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-3xl p-6 border border-forest-900/5 shadow-soft">
            <h3 className="font-display font-medium text-forest-950 mb-4">Settings</h3>
            <div className="flex flex-col gap-2">
              <Link href="/account/addresses" className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-forest-50 text-forest-800 text-sm font-medium transition-colors">
                <span>Addresses ({customer.addresses.length})</span>
                <span className="text-forest-400">→</span>
              </Link>
              <Link href="/wishlist" className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-forest-50 text-forest-800 text-sm font-medium transition-colors">
                <span>Wishlist</span>
                <span className="text-forest-400">→</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Right Column: Order History Overview ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl p-8 border border-forest-900/5 shadow-soft h-full">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-display font-semibold text-forest-950">Recent Orders</h2>
              {customer.orders.length > 0 && (
                <Link href="/orders" className="text-sm font-medium text-gold-600 hover:text-gold-700 transition-colors">
                  View All
                </Link>
              )}
            </div>

            {customer.orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-forest-50 rounded-full flex items-center justify-center text-forest-900/30 mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 4 0M9 5h6m-3 7h3m-3 4h3M9 12h.01M9 16h.01" /></svg>
                </div>
                <h3 className="font-display text-xl font-medium text-forest-950">No orders yet</h3>
                <p className="text-forest-700/70 text-sm mt-1 mb-6">You haven't placed any orders.</p>
                <Link href="/store" className="bg-forest-900 text-white rounded-xl px-6 py-2.5 font-medium hover:bg-forest-800 transition-colors">Start Shopping</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {customer.orders.map((order: any) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="group block border border-forest-900/10 rounded-2xl p-5 hover:border-gold-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-xs text-forest-700/50 uppercase tracking-widest font-bold mb-1">
                          Order #{order.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-sm text-forest-700/80">
                          {new Date(order.createdAt).toLocaleDateString("en-EG", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${STATUS_COLORS[order.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {order.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {order.items.slice(0, 3).map((item: any) => (
                        <div key={item.id} className="text-sm text-forest-900 bg-forest-50 rounded-lg px-3 py-1.5 flex items-center gap-2">
                          <img src={item.product.imageUrl} alt={item.product.name} className="w-5 h-5 rounded object-cover" />
                          <span>{item.product.name} × {item.quantity}</span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <span className="text-sm text-forest-700/50">+{order.items.length - 3} more</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-5 pt-5 border-t border-forest-900/5">
                      <span className="text-lg font-semibold text-forest-950">EGP {order.totalEgp.toLocaleString()}</span>
                      <span className="text-sm font-medium text-gold-600 group-hover:underline">Order Details →</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
