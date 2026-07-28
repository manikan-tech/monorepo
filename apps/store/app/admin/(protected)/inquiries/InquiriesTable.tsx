"use client";

import { useState, Fragment } from "react";

type Inquiry = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  website: string | null;
  monthlyOrders: string | null;
  message: string | null;
  status: string;
  createdAt: Date;
};

const STATUS_OPTIONS = ["NEW", "CONTACTED", "QUALIFIED", "CLOSED"] as const;

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  CONTACTED: "bg-yellow-50 text-yellow-700 border-yellow-200",
  QUALIFIED: "bg-green-50 text-green-700 border-green-200",
  CLOSED: "bg-gray-100 text-gray-500 border-gray-200",
};

const ITEMS_PER_PAGE = 10;

export default function InquiriesTable({ initialInquiries }: { initialInquiries: Inquiry[] }) {
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(inquiries.length / ITEMS_PER_PAGE) || 1;
  const paginated = inquiries.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update status");
      }

      setInquiries((prev) =>
        prev.map((inq) => (inq.id === id ? { ...inq, status } : inq))
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (inquiries.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-soft border border-manikan-border p-12 text-center">
        <div className="w-14 h-14 rounded-full bg-forest-50 flex items-center justify-center text-forest-400 mx-auto mb-3">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <p className="text-forest-700/60 font-medium">No business inquiries yet.</p>
        <p className="text-xs text-forest-700/40 mt-1">Inquiries from the contact page will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/60 text-forest-700/70 text-xs font-bold uppercase tracking-widest border-b border-manikan-border">
              <th className="px-6 py-4">Company</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Monthly Orders</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border/50">
            {paginated.map((inquiry, idx) => (
              <Fragment key={inquiry.id}>
                <tr
                  key={inquiry.id}
                  className="group hover:bg-gold-50/20 transition-colors animate-fade-up cursor-pointer"
                  style={{ animationDelay: `${80 + idx * 40}ms`, animationFillMode: "both" }}
                  onClick={() => setExpandedId(expandedId === inquiry.id ? null : inquiry.id)}
                >
                  {/* Company */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-xs font-bold text-gold-700 flex-shrink-0">
                        {inquiry.companyName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-forest-900 text-sm">{inquiry.companyName}</p>
                        {inquiry.website && (
                          <a
                            href={inquiry.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-gold-600 hover:underline"
                          >
                            {inquiry.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Contact */}
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-forest-900">{inquiry.contactName}</p>
                    <p className="text-xs text-forest-700/60">{inquiry.email}</p>
                    {inquiry.phone && (
                      <p className="text-xs text-forest-700/50">{inquiry.phone}</p>
                    )}
                  </td>

                  {/* Monthly Orders tier */}
                  <td className="px-6 py-4">
                    {inquiry.monthlyOrders ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-forest-50 text-forest-700 border-forest-200">
                        {inquiry.monthlyOrders}
                      </span>
                    ) : (
                      <span className="text-xs text-forest-700/40">—</span>
                    )}
                  </td>

                  {/* Date */}
                  <td className="px-6 py-4 text-sm text-forest-700/60">
                    {new Date(inquiry.createdAt).toLocaleDateString("en", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>

                  {/* Status select */}
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {updatingId === inquiry.id && (
                        <span className="text-xs text-forest-400 animate-pulse">Saving...</span>
                      )}
                      <select
                        value={inquiry.status}
                        disabled={updatingId === inquiry.id}
                        onChange={(e) => updateStatus(inquiry.id, e.target.value)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border focus:outline-none appearance-none cursor-pointer transition-colors ${
                          STATUS_STYLE[inquiry.status] ?? "bg-gray-50 text-gray-500 border-gray-200"
                        }`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>

                {/* Expandable message row */}
                {expandedId === inquiry.id && inquiry.message && (
                  <tr key={`${inquiry.id}-msg`} className="bg-gold-50/30">
                    <td colSpan={5} className="px-10 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 mb-1">Message</p>
                      <p className="text-sm text-forest-800 leading-relaxed">{inquiry.message}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
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
            <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, inquiries.length)}</span>
            {" "}of{" "}
            <span className="font-medium text-forest-900">{inquiries.length}</span> inquiries
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-forest-900">Page {currentPage} of {totalPages}</span>
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
