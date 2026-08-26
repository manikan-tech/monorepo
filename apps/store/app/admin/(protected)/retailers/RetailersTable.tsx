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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filteredRetailers = retailers.filter((r) => {
    const matchesSearch =
      r.storeName.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && r.isActivated) ||
      (statusFilter === "inactive" && !r.isActivated);
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredRetailers.length / ITEMS_PER_PAGE) || 1;
  const paginated = filteredRetailers.slice(
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
    <div className="space-y-4">
      {/* ── Search + Filter bar ── */}
      <div className="flex items-center gap-3 animate-fade-up">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by store name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-white border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors shadow-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as "all" | "active" | "inactive"); setCurrentPage(1); }}
          className="px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors shadow-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

    <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/60 text-forest-700/70 text-xs font-bold uppercase tracking-widest border-b border-manikan-border">
              <th className="px-6 py-4">Store</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Plans</th>
              <th className="px-6 py-4 text-center">Products</th>
              <th className="px-6 py-4 text-center">Sessions</th>
              <th className="px-6 py-4">Joined</th>
              <th className="px-6 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border/50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-forest-700/50">
                  No retailers found matching your search.
                </td>
              </tr>
            ) : (
              paginated.map((retailer, idx) => (
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

                {/* Plans */}
                <td className="px-6 py-4">
                  {retailer.subscriptions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {retailer.subscriptions.map((sub) => (
                        <span key={sub.id} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gold-50 text-gold-700 border border-gold-200 capitalize whitespace-nowrap">
                          {sub.plan?.name ?? "No Plan"}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-forest-700/50">None</span>
                  )}
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
            ))
            )}
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
            <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, filteredRetailers.length)}</span>
            {" "}of{" "}
            <span className="font-medium text-forest-900">{filteredRetailers.length}</span> retailers
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
    </div>
  );
}
