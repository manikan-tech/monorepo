"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Upload panel for a measurement CSV. Adapted from CsvUploadButton (same
// hidden-input + FormData + router.refresh() flow) with the chart-type picker
// the ingestion pipeline is parameterised by, and a template download so the
// retailer does not have to reverse-engineer the column names.

type ChartType = "BODY_FIT" | "GARMENT_TECHPACK";

const CHART_TYPES: { value: ChartType; label: string; hint: string }[] = [
  {
    value: "BODY_FIT",
    label: "Body Fit Guide",
    hint: "Your published size guide — what body each size fits. Powers size recommendations.",
  },
  {
    value: "GARMENT_TECHPACK",
    label: "Garment Tech Pack",
    hint: "The garment's own flat measurements. Powers 3D try-on. T-shirts and pants only.",
  },
];

export default function SizeChartUploader() {
  const [chartType, setChartType] = useState<ChartType>("BODY_FIT");
  const [category, setCategory] = useState("pants");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const active = CHART_TYPES.find((c) => c.value === chartType)!;

  const templateHref =
    chartType === "GARMENT_TECHPACK"
      ? `/api/retailer/size-charts/template?chartType=${chartType}&category=${category}`
      : `/api/retailer/size-charts/template?chartType=${chartType}`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("chartType", chartType);

      const res = await fetch("/api/retailer/size-charts", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      // Straight to the detail page: a job that needs fixes is the common
      // case, and that is where the retailer acts on it.
      router.push(`/dashboard/products/size-charts/${data.job.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-6 space-y-5">
      <div>
        <h3 className="text-lg font-display font-semibold text-forest-900">
          Upload a size chart
        </h3>
        <p className="text-sm text-manikan-text-secondary mt-1">
          One CSV can cover many products. Rows that need attention are flagged
          for you to fix rather than rejecting the whole file.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-forest-900 mb-2">
            Chart type
          </label>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
            className="w-full px-4 py-2.5 border border-manikan-border rounded-lg text-sm focus:ring-2 focus:ring-forest-400 focus:outline-none"
          >
            {CHART_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-manikan-text-secondary mt-2">{active.hint}</p>
        </div>

        {chartType === "GARMENT_TECHPACK" && (
          <div>
            <label className="block text-sm font-medium text-forest-900 mb-2">
              Category (for the template)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 border border-manikan-border rounded-lg text-sm focus:ring-2 focus:ring-forest-400 focus:outline-none"
            >
              <option value="pants">Pants</option>
              <option value="tshirt">T-shirt</option>
            </select>
            <p className="text-xs text-manikan-text-secondary mt-2">
              Tech-pack columns differ per category, so the template does too.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="bg-manikan-teal hover:bg-manikan-teal-hover text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-soft disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isUploading ? "Processing..." : "Choose CSV"}
        </button>
        <a
          href={templateHref}
          className="px-5 py-2.5 rounded-lg font-medium text-sm border border-manikan-border text-forest-900 hover:bg-gray-50 transition-colors"
        >
          Download template
        </a>
        <span className="text-xs text-manikan-text-secondary">
          Max 2MB / 5,000 rows
        </span>
      </div>
    </div>
  );
}
