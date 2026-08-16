"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRow, RowError } from "../../../../lib/ingestion/types";

// Editable grid of ONLY the rows that failed validation.
//
// Each line carries its rowNumber in a hidden field -- the same identity the
// PATCH endpoint matches on. That is deliberately not (productCode,
// sizeLabel): the correction is often TO those fields (a typo'd size label is
// exactly what produces UNKNOWN_SIZE), so matching on them would make the rows
// most likely to need fixing impossible to match back. Mirrors the
// variant_id[] hidden-identity pattern in EditProductForm.

type Draft = {
  rowNumber: number;
  productCode: string;
  sizeLabel: string;
  values: Record<string, number | null>;
  garmentColorHex?: string;
};

export default function FixRowsForm({
  jobId,
  errors,
  rows,
  fields,
  isGarment,
}: {
  jobId: string;
  errors: RowError[];
  rows: ParsedRow[];
  fields: string[];
  isGarment: boolean;
}) {
  const router = useRouter();
  const byNumber = new Map(rows.map((r) => [r.rowNumber, r]));

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    errors.map((e) => {
      const parsed = byNumber.get(e.rowNumber);
      return {
        rowNumber: e.rowNumber,
        productCode: parsed?.productCode ?? e.productCode ?? "",
        sizeLabel: parsed?.sizeLabel ?? e.sizeLabel ?? "",
        values: parsed?.values ?? Object.fromEntries(fields.map((f) => [f, null])),
        ...(parsed?.garmentColorHex ? { garmentColorHex: parsed.garmentColorHex } : {}),
      };
    }),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update(rowNumber: number, patch: Partial<Draft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.rowNumber === rowNumber ? { ...d, ...patch } : d)),
    );
  }

  function updateValue(rowNumber: number, field: string, raw: string) {
    const parsed = raw.trim() === "" ? null : Number(raw);
    setDrafts((prev) =>
      prev.map((d) =>
        d.rowNumber === rowNumber
          ? { ...d, values: { ...d.values, [field]: Number.isNaN(parsed) ? null : parsed } }
          : d,
      ),
    );
  }

  async function submit() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/retailer/size-charts/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: drafts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resubmit failed");
      router.refresh();
      setMessage(
        data.job.status === "COMPLETE"
          ? "All rows committed."
          : "Some rows still need attention.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const errorByNumber = new Map(errors.map((e) => [e.rowNumber, e]));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-xs uppercase tracking-wider text-manikan-text-secondary">
              <th className="px-3 py-3 font-semibold">Row</th>
              <th className="px-3 py-3 font-semibold">Product code</th>
              <th className="px-3 py-3 font-semibold">Size</th>
              {isGarment && <th className="px-3 py-3 font-semibold">Colour</th>}
              {fields.map((f) => (
                <th key={f} className="px-3 py-3 font-semibold whitespace-nowrap">
                  {f.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border">
            {drafts.map((d) => (
              <React.Fragment key={d.rowNumber}>
                <tr>
                  <td className="px-3 py-2 text-manikan-text-secondary">{d.rowNumber}</td>
                  <td className="px-3 py-2">
                    <input
                      value={d.productCode}
                      onChange={(e) => update(d.rowNumber, { productCode: e.target.value })}
                      className="w-32 px-2 py-1.5 border border-manikan-border rounded text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={d.sizeLabel}
                      onChange={(e) => update(d.rowNumber, { sizeLabel: e.target.value })}
                      className="w-20 px-2 py-1.5 border border-manikan-border rounded text-sm"
                    />
                  </td>
                  {isGarment && (
                    <td className="px-3 py-2">
                      <input
                        value={d.garmentColorHex ?? ""}
                        onChange={(e) =>
                          update(d.rowNumber, { garmentColorHex: e.target.value })
                        }
                        placeholder="#1a1a2e"
                        className="w-24 px-2 py-1.5 border border-manikan-border rounded text-sm font-mono"
                      />
                    </td>
                  )}
                  {fields.map((f) => (
                    <td key={f} className="px-3 py-2">
                      <input
                        type="number"
                        step="0.1"
                        value={d.values[f] ?? ""}
                        onChange={(e) => updateValue(d.rowNumber, f, e.target.value)}
                        className="w-20 px-2 py-1.5 border border-manikan-border rounded text-sm"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td />
                  <td
                    colSpan={fields.length + (isGarment ? 3 : 2)}
                    className="px-3 pb-3 text-xs text-red-600"
                  >
                    {errorByNumber.get(d.rowNumber)?.message}
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={saving}
          className="bg-manikan-teal hover:bg-manikan-teal-hover text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-soft disabled:opacity-60"
        >
          {saving ? "Saving..." : "Resubmit fixed rows"}
        </button>
        {message && (
          <span className="text-sm text-manikan-text-secondary">{message}</span>
        )}
      </div>
    </div>
  );
}
