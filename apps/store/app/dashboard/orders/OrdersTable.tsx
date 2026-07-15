"use client";

import React, { useState } from "react";

type Order = {
  id: string;
  createdAt: Date;
  status: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
  };
  items: {
    id: string;
    quantity: number;
    unitPriceEgp: number;
    product: {
      name: string;
    };
  }[];
};

const STATUS_OPTIONS = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED"
];

export default function OrdersTable({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const totalPages = Math.ceil(orders.length / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = orders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  async function updateStatus(orderId: string, newStatus: string) {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-12 text-center">
        <h3 className="text-xl font-display font-semibold text-forest-900 mb-2">No orders yet</h3>
        <p className="text-manikan-text-secondary">When customers place orders for your products, they will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden flex flex-col">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/50 text-forest-800 text-sm font-medium border-b border-manikan-border">
              <th className="px-6 py-4">Order ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Total</th>
              <th className="px-6 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border">
            {paginatedOrders.map((order, idx) => {
              const total = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceEgp, 0);
              const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
              const isReadOnly = order.status === "DELIVERED" || order.status === "CANCELLED" || order.status === "RETURNED";

              return (
                <tr 
                  key={order.id} 
                  className="hover:bg-cream-50/30 transition-colors group animate-fade-up"
                  style={{ animationDelay: `${100 + idx * 50}ms`, animationFillMode: "both" }}
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-semibold text-gold-600">
                      #{order.id.slice(-6).toUpperCase()}
                    </span>
                    <p className="text-xs text-manikan-text-secondary mt-1">{itemsCount} item{itemsCount > 1 ? 's' : ''}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-forest-900">{order.customer.firstName} {order.customer.lastName}</p>
                    <p className="text-xs text-manikan-text-secondary">{order.customer.email}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-forest-700/60">
                    {new Date(order.createdAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-6 py-4 font-medium text-manikan-text">
                    EGP {total.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-3">
                      {updatingId === order.id && <span className="text-xs text-forest-400 animate-pulse">Updating...</span>}
                      <select
                        disabled={isReadOnly || updatingId === order.id}
                        value={order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border focus:outline-none appearance-none cursor-pointer transition-colors ${
                          order.status === "DELIVERED" ? "bg-green-50 text-green-700 border-green-200" :
                          order.status === "CANCELLED" || order.status === "RETURNED" ? "bg-red-50 text-red-700 border-red-200" :
                          order.status === "SHIPPED" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                          "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
                        }`}
                      >
                        {STATUS_OPTIONS.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-manikan-border bg-cream-50/30 flex items-center justify-between text-sm text-manikan-text-secondary">
          <div>
            Showing <span className="font-medium text-forest-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, orders.length)}</span> of <span className="font-medium text-forest-900">{orders.length}</span> orders
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-forest-900">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
