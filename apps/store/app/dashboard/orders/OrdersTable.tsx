"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "../../../components/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── State machine: valid retailer-triggered transitions ──────────────────────
// Must match the backend RETAILER_VALID_TRANSITIONS map.
// APPROVE_RETURN and REJECT_RETURN are separate actions, not status values.
const NEXT_STATUSES: Record<string, string[]> = {
  PENDING:        ["CONFIRMED", "CANCELLED"],
  CONFIRMED:      ["PROCESSING", "CANCELLED"],
  PROCESSING:     ["SHIPPED", "CANCELLED"],
  SHIPPED:        ["DELIVERED"],
  DELIVERED:      [],
  RETURN_PENDING: [],   // handled by APPROVE/REJECT buttons
  RETURNED:       [],
  CANCELLED:      [],
};

const STATUS_LABELS: Record<string, string> = {
  PENDING:        "Pending",
  CONFIRMED:      "Confirmed",
  PROCESSING:     "Processing",
  SHIPPED:        "Shipped",
  DELIVERED:      "Delivered",
  RETURN_PENDING: "Return Requested",
  RETURNED:       "Returned",
  CANCELLED:      "Cancelled",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING:        "bg-yellow-50 text-yellow-700 border-yellow-200",
  CONFIRMED:      "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSING:     "bg-purple-50 text-purple-700 border-purple-200",
  SHIPPED:        "bg-indigo-50 text-indigo-700 border-indigo-200",
  DELIVERED:      "bg-green-50 text-green-700 border-green-200",
  RETURN_PENDING: "bg-orange-50 text-orange-700 border-orange-200",
  RETURNED:       "bg-violet-50 text-violet-700 border-violet-200",
  CANCELLED:      "bg-red-50 text-red-700 border-red-200",
};

const PAYMENT_BADGE: Record<string, string> = {
  PENDING:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  PAID:     "bg-green-50 text-green-700 border-green-200",
  FAILED:   "bg-red-50 text-red-700 border-red-200",
  REFUNDED: "bg-violet-50 text-violet-700 border-violet-200",
};

// ─── Confirm modal intent ─────────────────────────────────────────────────────
type ModalIntent =
  | { type: "status"; orderId: string; newStatus: string }
  | { type: "approve_return"; orderId: string }
  | { type: "reject_return"; orderId: string };

// ─────────────────────────────────────────────────────────────────────────────
export default function OrdersTable({
  initialOrders,
}: {
  initialOrders: Order[];
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [modalIntent, setModalIntent] = useState<ModalIntent | null>(null);
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

  // ── PATCH helper ────────────────────────────────────────────────────────────
  async function sendPatch(orderId: string, body: Record<string, string>) {
    setModalIntent(null);
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.order) {
        throw new Error(data.error || "Failed to update order");
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...data.order } : o)),
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Confirm button dispatcher ────────────────────────────────────────────────
  function handleConfirm() {
    if (!modalIntent) return;
    if (modalIntent.type === "status") {
      sendPatch(modalIntent.orderId, { status: modalIntent.newStatus });
    } else if (modalIntent.type === "approve_return") {
      sendPatch(modalIntent.orderId, { action: "APPROVE_RETURN" });
    } else if (modalIntent.type === "reject_return") {
      sendPatch(modalIntent.orderId, { action: "REJECT_RETURN" });
    }
  }

  // ── Modal copy ───────────────────────────────────────────────────────────────
  function modalTitle(): string {
    if (!modalIntent) return "";
    if (modalIntent.type === "approve_return") return "Approve Return & Refund";
    if (modalIntent.type === "reject_return") return "Reject Return Request";
    return "Update Order Status";
  }

  function modalBody(): React.ReactNode {
    if (!modalIntent) return null;
    if (modalIntent.type === "approve_return") {
      return (
        <p className="text-forest-700">
          Approve this return? This will <strong>refund the payment</strong> and restock all ordered items. This action cannot be undone.
        </p>
      );
    }
    if (modalIntent.type === "reject_return") {
      return (
        <p className="text-forest-700">
          Reject this return request? The order will be restored to <strong>Delivered</strong> and the payment will remain <strong>Paid</strong>.
        </p>
      );
    }
    return (
      <p className="text-forest-700">
        Change order status to{" "}
        <span className="font-bold text-forest-900">
          {STATUS_LABELS[modalIntent.newStatus] ?? modalIntent.newStatus}
        </span>
        ?
      </p>
    );
  }

  function confirmButtonClass(): string {
    if (modalIntent?.type === "approve_return") {
      return "px-4 py-2 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors shadow-soft";
    }
    if (modalIntent?.type === "reject_return") {
      return "px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-soft";
    }
    return "px-4 py-2 rounded-xl text-sm font-medium text-white bg-forest-900 hover:bg-forest-800 transition-colors shadow-soft";
  }

  function confirmButtonLabel(): string {
    if (modalIntent?.type === "approve_return") return "Approve & Refund";
    if (modalIntent?.type === "reject_return") return "Reject Return";
    return "Confirm";
  }

  // ────────────────────────────────────────────────────────────────────────────

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
      {/* Header */}
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
          {isRefreshing ? (
            "Refreshing..."
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Refresh Data
            </>
          )}
        </button>
      </div>

      {/* Table */}
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
              <th className="px-6 py-4 text-right">Actions</th>
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
              const nextStatuses = NEXT_STATUSES[order.status] ?? [];
              const isUpdating = updatingId === order.id;

              return (
                <tr
                  key={order.id}
                  className="hover:bg-cream-50/30 transition-colors group animate-fade-up"
                  style={{ animationDelay: `${100 + idx * 50}ms`, animationFillMode: "both" }}
                >
                  {/* Order ID */}
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-semibold text-gold-600">
                      #{order.id.slice(-6).toUpperCase()}
                    </span>
                    <p className="text-xs text-manikan-text-secondary mt-1">
                      {itemsCount} item{itemsCount > 1 ? "s" : ""}
                    </p>
                  </td>

                  {/* Customer */}
                  <td className="px-6 py-4">
                    <p className="font-medium text-forest-900">
                      {order.customer.firstName} {order.customer.lastName}
                    </p>
                    <p className="text-xs text-manikan-text-secondary">
                      {order.customer.email}
                    </p>
                  </td>

                  {/* Date */}
                  <td className="px-6 py-4 text-sm text-forest-700/60">
                    {new Date(order.createdAt).toLocaleDateString("en", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>

                  {/* Total */}
                  <td className="px-6 py-4 font-medium text-manikan-text">
                    EGP {total.toFixed(2)}
                  </td>

                  {/* Order Status — badge + valid next-step buttons */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5 items-start">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          STATUS_BADGE[order.status] ?? "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>

                      {/* Advance-status buttons (not shown for terminal or action-only states) */}
                      {!isUpdating && nextStatuses.filter((s) => s !== "CANCELLED").map((s) => (
                        <button
                          key={s}
                          onClick={() =>
                            setModalIntent({ type: "status", orderId: order.id, newStatus: s })
                          }
                          className="text-xs px-2.5 py-1 rounded-lg bg-forest-900 text-white hover:bg-forest-700 transition-colors"
                        >
                          → {STATUS_LABELS[s] ?? s}
                        </button>
                      ))}
                    </div>
                  </td>

                  {/* Payment Status — read-only badge */}
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        PAYMENT_BADGE[order.paymentStatus] ?? "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                    {order.paymentStatus === "REFUNDED" && order.refundReferenceId && (
                      <p className="mt-1.5 text-xs text-forest-700/60 font-mono">
                        ref: {order.refundReferenceId.slice(-12)}
                      </p>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    {isUpdating ? (
                      <span className="text-xs text-forest-400 animate-pulse">Updating…</span>
                    ) : (
                      <div className="flex flex-col gap-1.5 items-end">
                        {/* Cancel button — only while pre-shipment */}
                        {nextStatuses.includes("CANCELLED") && (
                          <button
                            onClick={() =>
                              setModalIntent({ type: "status", orderId: order.id, newStatus: "CANCELLED" })
                            }
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Cancel Order
                          </button>
                        )}

                        {/* Return actions — only for RETURN_PENDING */}
                        {order.status === "RETURN_PENDING" && (
                          <>
                            <button
                              onClick={() =>
                                setModalIntent({ type: "approve_return", orderId: order.id })
                              }
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                            >
                              Approve Return
                            </button>
                            <button
                              onClick={() =>
                                setModalIntent({ type: "reject_return", orderId: order.id })
                              }
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-forest-200 text-forest-700 hover:bg-forest-50 transition-colors"
                            >
                              Reject Return
                            </button>
                          </>
                        )}

                        {/* Nothing to show for terminal states */}
                        {order.status === "RETURNED" && (
                          <span className="text-xs text-violet-600 font-medium">Refunded</span>
                        )}

                        {nextStatuses.length === 0 &&
                          order.status !== "RETURN_PENDING" &&
                          order.status !== "RETURNED" && (
                            <span className="text-xs text-forest-700/40">—</span>
                          )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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

      {/* Confirmation Modal */}
      <Modal
        isOpen={!!modalIntent}
        onClose={() => setModalIntent(null)}
        title={modalTitle()}
        footer={
          <>
            <button
              onClick={() => setModalIntent(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              Cancel
            </button>
            <button onClick={handleConfirm} className={confirmButtonClass()}>
              {confirmButtonLabel()}
            </button>
          </>
        }
      >
        {modalBody()}
      </Modal>
    </div>
  );
}
