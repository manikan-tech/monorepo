"use client";

import React, { useState } from "react";
import Link from "next/link";
import Modal from "../../../../components/Modal";

type Order = {
  id: string;
  createdAt: string | Date;
  status: string;
  paymentStatus: string;
  totalEgp: number;
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
      retailer: {
        id: string;
        storeName: string;
      };
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

export default function AdminOrdersTable({
  initialOrders,
}: {
  initialOrders: Order[];
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ orderId: string; newStatus: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const totalPages = Math.ceil(orders.length / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = orders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  async function confirmUpdateStatus() {
    if (!confirmModal) return;
    const { orderId, newStatus } = confirmModal;
    setConfirmModal(null);
    
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-12 text-center">
        <h3 className="text-xl font-display font-semibold text-forest-900 mb-2">No orders</h3>
        <p className="text-manikan-text-secondary">There are no orders on the platform yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden flex flex-col">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/50 text-forest-800 text-sm font-medium border-b border-manikan-border">
              <th className="px-6 py-4">Order ID & Retailer</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Total</th>
              <th className="px-6 py-4">Payment</th>
              <th className="px-6 py-4 text-right">Order Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border">
            {paginatedOrders.map((order, idx) => {
              const retailers = Array.from(new Set(order.items.map(item => item.product.retailer.storeName)));
              const retailerIds = Array.from(new Set(order.items.map(item => item.product.retailer.id)));
              
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
                    <div className="mt-1">
                      {retailers.map((r, i) => (
                        <Link 
                          key={r} 
                          href={`/admin/retailers/${retailerIds[i]}`}
                          className="text-xs text-forest-600 hover:underline block"
                        >
                          {r}
                        </Link>
                      ))}
                    </div>
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
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                    })}
                  </td>
                  <td className="px-6 py-4 font-medium text-manikan-text">
                    EGP {order.totalEgp.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${PAYMENT_STATUS_COLORS[order.paymentStatus] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                      {order.paymentStatus}
                    </span>
                    {order.paymentStatus === "REFUNDED" && order.refundReferenceId && (
                      <p className="mt-2 text-xs text-forest-700/60 font-mono">
                        Ref: {order.refundReferenceId}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {updatingId === order.id && <span className="text-xs text-forest-400 animate-pulse">Saving...</span>}
                      <select
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => setConfirmModal({ orderId: order.id, newStatus: e.target.value })}
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
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-manikan-border bg-cream-50/30 flex items-center justify-between text-sm text-manikan-text-secondary">
          <div>
            Showing <span className="font-medium text-forest-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, orders.length)}</span> of <span className="font-medium text-forest-900">{orders.length}</span> orders
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-forest-900">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Confirm Status Change"
        footer={
          <>
            <button
              onClick={() => setConfirmModal(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmUpdateStatus}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-forest-900 hover:bg-forest-800 transition-colors shadow-soft"
            >
              Confirm
            </button>
          </>
        }
      >
        <p className="text-forest-700/80 text-sm">
          Are you sure you want to change this order's status to <span className="font-semibold text-forest-900">{confirmModal?.newStatus}</span>?
        </p>
      </Modal>
    </div>
  );
}
