import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthFromCookies } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { parseErrors, parseRows } from "../../../../lib/ingestion/types";
import { BODY_FIT_FIELDS } from "../../../../lib/measurement-fields";
import { garmentFieldsFor } from "../../../../lib/tryon-status";
import { STATUS_LABEL, STATUS_STYLE } from "../status-style";
import FixRowsForm from "./FixRowsForm";

export const dynamic = "force-dynamic";

export default async function SizeChartJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getAuthFromCookies();
  if (!user) redirect("/login");

  const { id } = await params;
  const job = await prisma.sizeChartIngestion.findUnique({ where: { id } });
  // Tenant isolation: another retailer's job is indistinguishable from one
  // that does not exist.
  if (!job || job.retailerId !== user.sub) notFound();

  // Same helpers and same types the API uses, so the shape cannot drift
  // between server, client, and stored JSON.
  const rows = parseRows(job.rows);
  const errors = parseErrors(job.errors);
  const isGarment = job.chartType === "GARMENT_TECHPACK";

  // Warnings are non-blocking, so they exist on COMPLETE jobs too -- rendering
  // them only under ACTION_REQUIRED would silently swallow the signal on a
  // fully successful upload, which is the case it matters most.
  const warnedRows = rows.filter((r) => (r.warnings?.length ?? 0) > 0);

  // The fix grid needs the column set. For a garment chart that depends on the
  // product's category, so resolve it from the first row's product; body-fit
  // is category-independent.
  let fields: string[] = [...BODY_FIT_FIELDS];
  if (isGarment) {
    const firstCode = rows[0]?.productCode ?? errors[0]?.productCode ?? null;
    const product = firstCode
      ? await prisma.product.findFirst({
          where: { retailerId: user.sub, productCode: firstCode },
          select: { category: true },
        })
      : null;
    fields = [...garmentFieldsFor(product?.category ?? "")];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard/products/size-charts"
            className="text-xs text-manikan-text-secondary hover:text-forest-900 transition-colors"
          >
            &larr; Back to size charts
          </Link>
          <h2 className="text-2xl font-display font-semibold text-forest-950 leading-tight">
            {job.fileName}
          </h2>
          <p className="text-sm text-forest-700/60">
            {job.chartType === "BODY_FIT" ? "Body Fit Guide" : "Garment Tech Pack"}
            {" · "}
            {job.committedRows} of {job.rowCount} rows committed
          </p>
        </div>
        <span
          className={`inline-block px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_STYLE[job.status]}`}
        >
          {STATUS_LABEL[job.status]}
        </span>
      </div>

      {job.status === "FAILED" && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-6 py-4 text-sm">
          {job.failureReason ?? "This upload could not be processed."}
        </div>
      )}

      {job.status === "COMPLETE" && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-2xl px-6 py-4 text-sm">
          Every row committed successfully.
        </div>
      )}

      {/* Blocking: rows that did not commit and need a correction. */}
      {errors.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden">
          <div className="px-6 py-4 border-b border-manikan-border">
            <h3 className="font-display font-semibold text-forest-900">
              {errors.length} row{errors.length === 1 ? "" : "s"} need attention
            </h3>
            <p className="text-sm text-manikan-text-secondary mt-1">
              Fix the values below and resubmit. Rows that already committed are
              left alone.
            </p>
          </div>
          <div className="p-6">
            <FixRowsForm
              jobId={job.id}
              errors={errors}
              rows={rows}
              fields={fields}
              isGarment={isGarment}
            />
          </div>
        </div>
      )}

      {/* Non-blocking: these rows DID commit. Subordinate styling, no inputs --
          there is nothing to fix, only a quality caveat to be aware of. */}
      {warnedRows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200 bg-amber-50/60">
            <h3 className="font-display font-semibold text-amber-900">
              {warnedRows.length} row{warnedRows.length === 1 ? "" : "s"} committed with warnings
            </h3>
            <p className="text-sm text-amber-800/80 mt-1">
              These saved fine, but they will make size recommendations less
              accurate.
            </p>
          </div>
          <ul className="divide-y divide-manikan-border">
            {warnedRows.map((row) => (
              <li key={row.rowNumber} className="px-6 py-3 text-sm">
                <span className="font-medium text-forest-900">
                  Row {row.rowNumber} · {row.productCode} · {row.sizeLabel}
                </span>
                {row.warnings?.map((w) => (
                  <span key={w.code} className="block text-xs text-amber-700 mt-0.5">
                    {w.message}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
