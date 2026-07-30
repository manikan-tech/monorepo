"use client";

import { useState } from "react";
import Link from "next/link";

type SubscriptionWithPlan = {
  id: string;
  status: string;
  plan: { name: string } | null;
};

type Retailer = {
  id: string;
  storeName: string;
  email: string;
  isActivated: boolean;
  createdAt: Date;
  subscriptions: SubscriptionWithPlan[];
  _count: {
    products: number;
    sessions: number;
  };
};

const ITEMS_PER_PAGE = 10;

export default function RetailersTable({ initialRetailers }: { initialRetailers: Retailer[] }) {
  const [retailers, setRetailers] = useState(initialRetailers);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(retailers.length / ITEMS_PER_PAGE) || 1;
  const paginated = retailers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  async function toggleActivation(retailer: Retailer) {
    setTogglingId(retailer.id);
    try {
      const res = await fetch(`/api/admin/retailers/${retailer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActivated: !retailer.isActivated }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update retailer");
      }

      setRetailers((prev) =>
        prev.map((r) =>
          r.id === retailer.id ? { ...r, isActivated: !r.isActivated } : r
        )
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTogglingId(null);
    }
  }

  if (retailers.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-soft border border-manikan-border p-12 text-center">
        <p className="text-forest-700/60 font-medium">No retailers registered yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/60 text-forest-700/70 text-xs font-bold uppercase tracking-widest border-b border-manikan-border">
              <th className="px-6 py-4">Store</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Plan</th>
              <th className="px-6 py-4 text-center">Products</th>
              <th className="px-6 py-4 text-center">Sessions</th>
              <th className="px-6 py-4">Joined</th>
              <th className="px-6 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border/50">
            {paginated.map((retailer, idx) => (
              <tr
                key={retailer.id}
                className="group hover:bg-gold-50/20 transition-colors animate-fade-up"
                style={{ animationDelay: `${80 + idx * 40}ms`, animationFillMode: "both" }}
              >
                {/* Store Name */}
                <td className="px-6 py-4">
                  <Link href={`/admin/retailers/${retailer.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-forest-100 flex items-center justify-center text-xs font-bold text-forest-700 flex-shrink-0">
                      {retailer.storeName[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium text-forest-900 text-sm hover:underline">{retailer.storeName}</span>
                  </Link>
                </td>

                {/* Email */}
                <td className="px-6 py-4 text-sm text-forest-700/70">{retailer.email}</td>

                {/* Plan */}
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-gold-50 text-gold-700 border-gold-200 capitalize">
                    {retailer.subscriptions[0]?.plan?.name ?? "No Plan"}
                  </span>
                </td>

                {/* Products count */}
                <td className="px-6 py-4 text-center">
                  <span className="font-mono text-sm font-semibold text-forest-900">
                    {retailer._count.products}
                  </span>
                </td>

                {/* Sessions count */}
                <td className="px-6 py-4 text-center">
                  <span className="font-mono text-sm font-semibold text-gold-600">
                    {retailer._count.sessions}
                  </span>
                </td>

                {/* Joined date */}
                <td className="px-6 py-4 text-sm text-forest-700/60">
                  {new Date(retailer.createdAt).toLocaleDateString("en", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>

                {/* Activate / Deactivate toggle */}
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {togglingId === retailer.id && (
                      <span className="text-xs text-forest-400 animate-pulse">Updating...</span>
                    )}
                    <button
                      onClick={() => toggleActivation(retailer)}
                      disabled={togglingId === retailer.id}
                      className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                        retailer.isActivated
                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          retailer.isActivated ? "bg-green-500" : "bg-red-400"
                        }`}
                      />
                      {retailer.isActivated ? "Active" : "Inactive"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-manikan-border bg-cream-50/30 flex items-center justify-between text-sm text-manikan-text-secondary">
          <span>
            Showing{" "}
            <span className="font-medium text-forest-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span>
            {" "}to{" "}
            <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, retailers.length)}</span>
            {" "}of{" "}
            <span className="font-medium text-forest-900">{retailers.length}</span> retailers
          </span>
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
