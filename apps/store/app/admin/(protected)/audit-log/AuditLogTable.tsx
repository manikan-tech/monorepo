"use client";

import React, { useState } from "react";
import Link from "next/link";

type AuditLog = {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string | Date;
  retailer: {
    id: string;
    storeName: string;
  };
  admin: {
    id: string;
    email: string;
  };
};

export default function AuditLogTable({
  initialLogs,
}: {
  initialLogs: AuditLog[];
}) {
  const [filterAction, setFilterAction] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const filteredLogs = filterAction
    ? initialLogs.filter((log) => log.action === filterAction)
    : initialLogs;

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE) || 1;
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const actions = Array.from(new Set(initialLogs.map((log) => log.action)));

  return (
    <div className="space-y-6">
      <div className="flex justify-end animate-fade-up">
        <select
          value={filterAction}
          onChange={(e) => {
            setFilterAction(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors shadow-sm"
        >
          <option value="">All Actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-forest-50/50 text-forest-800 text-sm font-medium border-b border-manikan-border">
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Retailer</th>
                <th className="px-6 py-4">Admin</th>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-manikan-border">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-forest-700/50">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className="hover:bg-cream-50/30 transition-colors group animate-fade-up"
                    style={{ animationDelay: `${100 + idx * 50}ms`, animationFillMode: "both" }}
                  >
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        log.action === "ACTIVATED" ? "bg-green-50 text-green-700 border-green-200" :
                        log.action === "SUSPENDED" ? "bg-red-50 text-red-700 border-red-200" :
                        "bg-gold-50 text-gold-700 border-gold-200"
                      }`}>
                        {log.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link 
                        href={`/admin/retailers/${log.retailer.id}`}
                        className="font-medium text-forest-900 hover:text-gold-600 hover:underline transition-colors"
                      >
                        {log.retailer.storeName}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-forest-800">{log.admin.email}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-forest-700/60 font-mono">
                      {new Date(log.createdAt).toLocaleString("en", {
                        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-forest-800">
                      {log.reason || <span className="text-forest-700/40 italic">No details provided</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-manikan-border bg-cream-50/30 flex items-center justify-between text-sm text-manikan-text-secondary">
            <div>
              Showing <span className="font-medium text-forest-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)}</span> of <span className="font-medium text-forest-900">{filteredLogs.length}</span> logs
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
      </div>
    </div>
  );
}
