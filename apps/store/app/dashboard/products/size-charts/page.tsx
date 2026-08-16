import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import SizeChartUploader from "./SizeChartUploader";
import { STATUS_STYLE, STATUS_LABEL } from "./status-style";

export const dynamic = "force-dynamic";

export default async function SizeChartsPage() {
  const user = await getAuthFromCookies();
  if (!user) redirect("/login");

  // Deliberately does not select rows/errors -- a job can carry thousands of
  // rows and the list never needs them. hasWarnings is a stored column for
  // exactly this reason.
  const jobs = await prisma.sizeChartIngestion.findMany({
    where: { retailerId: user.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      chartType: true,
      status: true,
      fileName: true,
      rowCount: true,
      committedRows: true,
      hasWarnings: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up" style={{ animationDelay: "100ms" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-400/90">
          Catalog Management
        </p>
        <h2 className="text-3xl font-display font-semibold text-forest-950 leading-tight">
          Size{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">
            Charts
          </span>
        </h2>
        <p className="text-forest-700/60 text-sm mt-1 max-w-2xl">
          Upload measurements in bulk instead of typing them per product.
        </p>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <SizeChartUploader />
      </div>

      <div
        className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden animate-fade-up"
        style={{ animationDelay: "300ms" }}
      >
        <div className="px-6 py-4 border-b border-manikan-border">
          <h3 className="font-display font-semibold text-forest-900">Recent uploads</h3>
        </div>

        {jobs.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-manikan-text-secondary">
            No uploads yet. Start with the template above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr className="text-xs uppercase tracking-wider text-manikan-text-secondary">
                <th className="px-6 py-3 font-semibold">File</th>
                <th className="px-6 py-3 font-semibold">Type</th>
                <th className="px-6 py-3 font-semibold">Rows</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-manikan-border">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-forest-900">{job.fileName}</span>
                    <span className="block text-xs text-manikan-text-secondary">
                      {new Date(job.createdAt).toLocaleString("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-manikan-text-secondary">
                    {job.chartType === "BODY_FIT" ? "Body Fit" : "Tech Pack"}
                  </td>
                  <td className="px-6 py-4 text-manikan-text-secondary">
                    {job.committedRows} / {job.rowCount}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[job.status]}`}
                      >
                        {STATUS_LABEL[job.status]}
                      </span>
                      {/* Subordinate to the status pill on purpose: a job can be
                          COMPLETE and still carry quality caveats, and without
                          this the list would silently swallow that. */}
                      {job.hasWarnings && (
                        <span
                          title="Committed, but some sizes are missing measurements used for size recommendations"
                          className="inline-flex items-center gap-1 text-xs text-amber-700"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          Warnings
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/products/size-charts/${job.id}`}
                      className="text-manikan-teal hover:underline font-medium"
                    >
                      {job.status === "ACTION_REQUIRED" ? "Fix rows" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
