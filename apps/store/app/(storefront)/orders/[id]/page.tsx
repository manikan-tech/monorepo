"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Modal from "../../../../components/Modal";

const STATUS_STEPS = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSING: "bg-purple-50 text-purple-700 border-purple-200",
  SHIPPED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  DELIVERED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
  RETURN_PENDING: "bg-orange-50 text-orange-700 border-orange-200",
  RETURNED: "bg-violet-50 text-violet-700 border-violet-200",
};

type OrderItem = {
  id: string;
  quantity: number;
  unitPriceEgp: number;
  sizeLabel: string;
  product: { name: string; imageUrl: string | null };
};

type Order = {
  id: string;
  status: string;
  paymentStatus: string;
  subtotalEgp: number;
  shippingEgp: number;
  totalEgp: number;
  createdAt: string;
  items: OrderItem[];
  address: {
    label: string;
    street: string;
    city: string;
    state: string;
  } | null;
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const handleRequestReturn = async () => {
    setShowReturnModal(false);
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/orders/${order!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RETURN_PENDING" })
      });
      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to request return");
      } else {
        const data = await res.json();
        setOrder(prev => prev ? { ...prev, status: data.order.status } : null);
      }
    } catch (err) {
      alert("An unexpected error occurred.");
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetch(`/api/orders/${orderId}`)
      .then((r) => r.json())
      .then((d) => {
        setOrder(d.order ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <span className="inline-block w-8 h-8 border-[3px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h1 className="font-display text-3xl font-semibold text-forest-950">
          Order not found
        </h1>
        <Link href="/orders" className="text-gold-600 hover:underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const stepIdx = STATUS_STEPS.indexOf(order.status);
  const isTerminal =
    order.status === "CANCELLED" || 
    order.status === "RETURNED" || 
    order.status === "RETURN_PENDING";

  return (
    <div className="max-w-[900px] mx-auto px-6 py-12 md:py-20 w-full">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-forest-700/60 hover:text-forest-900 transition-colors mb-8"
      >
        ← Back to Orders
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-10">
        <div>
          <h1 className="font-display text-3xl font-semibold text-forest-950">
            Order #{order.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-sm text-forest-700/60 mt-1">
            {new Date(order.createdAt).toLocaleDateString("en-EG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`text-sm font-semibold px-4 py-2 rounded-full border ${STATUS_COLORS[order.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}
          >
            {order.status}
          </span>
          {order.paymentStatus === "REFUNDED" && (
            <span className="text-sm font-semibold px-4 py-2 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
              Refunded
            </span>
          )}
          {order.status === "DELIVERED" && (
            <button
              onClick={() => setShowReturnModal(true)}
              disabled={isUpdating}
              className="mt-2 text-sm font-semibold px-4 py-2 rounded-full border bg-white text-forest-900 border-forest-200 hover:bg-forest-50 transition-colors disabled:opacity-50"
            >
              {isUpdating ? "Requesting..." : "Request Return"}
            </button>
          )}
        </div>
      </div>

      {/* Stepper */}
      {!isTerminal && (
        <div className="bg-white rounded-3xl p-6 border border-forest-900/5 shadow-soft mb-8">
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${i <= stepIdx ? "bg-forest-900 border-forest-900 text-white" : "bg-white border-forest-200 text-forest-400"}`}
                  >
                    {i < stepIdx ? "✓" : i + 1}
                  </div>
                  <span
                    className={`text-[11px] font-medium text-center leading-tight ${i <= stepIdx ? "text-forest-900" : "text-forest-400"}`}
                  >
                    {step}
                  </span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 transition-all ${i < stepIdx ? "bg-forest-900" : "bg-forest-100"}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Items */}
        <div className="md:col-span-8 flex flex-col gap-4">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 bg-white rounded-2xl p-4 border border-forest-900/5 shadow-soft"
            >
              <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-forest-50 shrink-0">
                {item.product.imageUrl && (
                  <Image
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    fill
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex-1 py-1">
                <p className="font-medium text-forest-950">
                  {item.product.name}
                </p>
                <p className="text-sm text-forest-700/60">
                  Size: {item.sizeLabel} · Qty: {item.quantity}
                </p>
                <p className="text-sm font-semibold text-forest-900 mt-1">
                  EGP {(item.unitPriceEgp * item.quantity).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary & Address */}
        <div className="md:col-span-4 flex flex-col gap-4">
          <div className="bg-forest-950 text-white rounded-2xl p-6">
            <h3 className="font-display text-lg mb-4">Summary</h3>
            <div className="flex flex-col gap-2 text-sm text-white/70">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>EGP {order.subtotalEgp?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="text-gold-400">
                  EGP {order.shippingEgp?.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex justify-between mt-4 pt-4 border-t border-white/10">
              <span className="font-semibold">Total</span>
              <span className="text-gold-500 font-display text-xl font-semibold">
                EGP {order.totalEgp?.toLocaleString()}
              </span>
            </div>
          </div>

          {order.address && (
            <div className="bg-white rounded-2xl p-5 border border-forest-900/5 shadow-soft">
              <h3 className="font-display text-sm font-semibold text-forest-950 mb-3">
                Delivery Address
              </h3>
              <p className="text-sm text-forest-700/80">
                {order.address.label}
              </p>
              <p className="text-sm text-forest-700/60">
                {order.address.street}
              </p>
              <p className="text-sm text-forest-700/60">
                {order.address.city}, {order.address.state}
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="Request Return"
        footer={
          <>
            <button
              onClick={() => setShowReturnModal(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleRequestReturn}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-forest-900 hover:bg-forest-800 transition-colors shadow-soft"
            >
              Confirm
            </button>
          </>
        }
      >
        <p className="text-forest-700">
          Are you sure you want to request a return for this order? Our team will review your request.
        </p>
      </Modal>
    </div>
  );
}
