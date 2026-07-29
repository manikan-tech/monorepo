"use client";

import React, { useState } from "react";

type Order = {
  id: string;
  createdAt: string | Date;
  status: string;
  paymentStatus: string;
  refundReferenceId: string | null;
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

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  PAID: "bg-green-50 text-green-700 border-green-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  REFUNDED: "bg-violet-50 text-violet-700 border-violet-200",
};

export default function OrdersTable({
  initialOrders,
}: {
  initialOrders: Order[];
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const totalPages = Math.ceil(orders.length / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = orders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  async function processReturn(orderId: string) {
    if (
      !window.confirm(
        "Process this return? This refunds the payment and restocks all ordered items.",
      )
    ) {
      return;
    }

    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RETURNED" }),
      });

      const data = (await res.json()) as {
        error?: string;
        order?: Pick<Order, "status" | "paymentStatus" | "refundReferenceId">;
      };
      if (!res.ok || !data.order) {
        throw new Error(data.error || "Failed to update status");
      }

      setOrders((previousOrders) =>
        previousOrders.map((order) =>
          order.id === orderId ? { ...order, ...data.order } : order,
        ),
      );
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Failed to process return",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-12 text-center">
        <h3 className="text-xl font-display font-semibold text-forest-900 mb-2">
          No orders yet
        </h3>
        <p className="text-manikan-text-secondary">
          When customers place orders for your products, they will appear here.
        </p>
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
              <th className="px-6 py-4">Order Status</th>
              <th className="px-6 py-4">Payment</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border">
            {paginatedOrders.map((order, idx) => {
              const total = order.items.reduce(
                (sum, item) => sum + item.quantity * item.unitPriceEgp,
                0,
              );
              const itemsCount = order.items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              );
              const canReturn =
                order.status === "DELIVERED" && order.paymentStatus === "PAID";

              return (
                <tr
                  key={order.id}
                  className="hover:bg-cream-50/30 transition-colors group animate-fade-up"
                  style={{
                    animationDelay: `${100 + idx * 50}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-semibold text-gold-600">
                      #{order.id.slice(-6).toUpperCase()}
                    </span>
                    <p className="text-xs text-manikan-text-secondary mt-1">
                      {itemsCount} item{itemsCount > 1 ? "s" : ""}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-forest-900">
                      {order.customer.firstName} {order.customer.lastName}
                    </p>
                    <p className="text-xs text-manikan-text-secondary">
                      {order.customer.email}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-sm text-forest-700/60">
                    {new Date(order.createdAt).toLocaleDateString("en", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-6 py-4 font-medium text-manikan-text">
                    EGP {total.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                        order.status === "DELIVERED"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : order.status === "CANCELLED" ||
                              order.status === "RETURNED"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : order.status === "SHIPPED"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-yellow-50 text-yellow-700 border-yellow-200"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                        PAYMENT_STATUS_COLORS[order.paymentStatus] ??
                        "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                    {order.paymentStatus === "REFUNDED" &&
                      order.refundReferenceId && (
                        <p className="mt-2 text-xs text-forest-700/60 font-mono">
                          Refund ref: {order.refundReferenceId}
                        </p>
                      )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {updatingId === order.id ? (
                      <span className="text-xs text-forest-400 animate-pulse">
                        Processing refund...
                      </span>
                    ) : canReturn ? (
                      <button
                        type="button"
                        onClick={() => processReturn(order.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Return & refund
                      </button>
                    ) : (
                      <span className="text-xs text-forest-700/50">—</span>
                    )}
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
            Showing{" "}
            <span className="font-medium text-forest-900">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium text-forest-900">
              {Math.min(currentPage * ITEMS_PER_PAGE, orders.length)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-forest-900">{orders.length}</span>{" "}
            orders
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-forest-900">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
