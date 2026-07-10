"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
      alert(`Successfully imported ${data.count} products!`);
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
