"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// measurementErrors (a real validation failure -- these rows need fixing)
// and noMeasurementData (a product simply had no measurement columns at
// all, normal for a catalog-only CSV) are kept as two separate, differently
// worded lines so the common no-measurement-data case never reads as an
// alarm the retailer learns to ignore.
function buildResultMessage(data: {
  count: number;
  measurementErrors?: Array<{ productCode: string }>;
  noMeasurementData?: string[];
}): string {
  const lines = [`Successfully imported ${data.count} products!`];

  const errors = data.measurementErrors ?? [];
  if (errors.length > 0) {
    const codes = errors.map((e) => e.productCode);
    const shown = codes.slice(0, 5).join(", ");
    const rest = codes.length > 5 ? ` and ${codes.length - 5} more` : "";
    lines.push(
      `${errors.length} product${errors.length === 1 ? "" : "s"}' measurements need attention: ${shown}${rest}.`
    );
  }

  const noData = data.noMeasurementData ?? [];
  if (noData.length > 0) {
    lines.push(
      `(${noData.length} product${noData.length === 1 ? "" : "s"} had no measurement data)`
    );
  }

  return lines.join("\n\n");
}

export default function CsvUploadButton() {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/products/upload-csv", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await res.json();
      alert(buildResultMessage(data));
      router.refresh();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Something went wrong during upload");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
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
        className={`px-5 py-2.5 rounded-lg font-medium transition-colors shadow-soft border border-manikan-border ${
          isUploading
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white hover:bg-gray-50 text-forest-900"
        }`}
      >
        {isUploading ? "Uploading..." : "Upload CSV"}
      </button>
    </>
  );
}
