"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "../../../components/Modal";

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

const STATUS_OPTIONS = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURN_PENDING", "RETURNED"];

export default function OrdersTable({
  initialOrders,
}: {
  initialOrders: Order[];
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ action: "return" | "status" | "payment"; orderId: string; value?: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setOrders(initialOrders);
    setIsRefreshing(false);
  }, [initialOrders]);

  const totalPages = Math.ceil(orders.length / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = orders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  async function processUpdate(orderId: string, field: "status", value: string) {
    setConfirmModal(null);
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      const data = await res.json();
      if (!res.ok || !data.order) {
        throw new Error(data.error || "Failed to update order");
      }

      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...data.order } : o)));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
  }

  async function processReturn(orderId: string) {
    setConfirmModal(null);
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
      <div className="p-4 flex justify-between items-center border-b border-manikan-border bg-gray-50/50">
        <h3 className="text-sm font-semibold text-forest-900">Recent Orders</h3>
        <button
          onClick={() => {
            setIsRefreshing(true);
            router.refresh();
          }}
          className="text-xs px-3 py-1.5 bg-white border border-manikan-border rounded-lg text-forest-700 hover:bg-gray-50 transition flex items-center gap-2 disabled:opacity-50 shadow-sm"
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Refresh Data
            </>
          )}
        </button>
      </div>
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
                    <select
                      value={order.status}
                      disabled={updatingId === order.id}
                      onChange={(e) => setConfirmModal({ action: "status", orderId: order.id, value: e.target.value })}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border focus:outline-none appearance-none cursor-pointer transition-colors ${
                        order.status === "DELIVERED"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : order.status === "CANCELLED" || order.status === "RETURNED"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : order.status === "RETURN_PENDING"
                          ? "bg-orange-50 text-orange-700 border-orange-200"
                          : order.status === "SHIPPED"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : order.status === "CONFIRMED" || order.status === "PROCESSING"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-yellow-50 text-yellow-700 border-yellow-200"
                      }`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${PAYMENT_STATUS_COLORS[order.paymentStatus] ??
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
                        Updating...
                      </span>
                    ) : canReturn ? (
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ action: "return", orderId: order.id })}
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

      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title={
          confirmModal?.action === "return" ? "Confirm Return" : "Update Order Status"
        }
        footer={
          <>
            <button
              onClick={() => setConfirmModal(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!confirmModal) return;
                if (confirmModal.action === "return") {
                  processReturn(confirmModal.orderId);
                } else if (confirmModal.action === "status" && confirmModal.value) {
                  processUpdate(confirmModal.orderId, "status", confirmModal.value);
                }
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-forest-900 hover:bg-forest-800 transition-colors shadow-soft"
            >
              {confirmModal?.action === "return" ? "Process Return" : "Confirm Update"}
            </button>
          </>
        }
      >
        {confirmModal?.action === "return" ? (
          <p className="text-forest-700">
            Process this return? This refunds the payment and restocks all ordered items.
          </p>
        ) : (
          <p className="text-forest-700">
            Are you sure you want to change this order's status to <span className="font-bold text-forest-900">{confirmModal?.value}</span>?
          </p>
        )}
      </Modal>
    </div>
  );
}
