"use client";

import { useRef, useState } from "react";

type ProductImageFieldProps = {
  defaultValue?: string;
};

export default function ProductImageField({ defaultValue = "" }: ProductImageFieldProps) {
  const [imageUrl, setImageUrl] = useState(defaultValue);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/retailer/product-images", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.imageUrl !== "string") {
        throw new Error(payload.error || "Image upload failed");
      }
      setImageUrl(payload.imageUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <label className="text-sm font-medium text-forest-900" htmlFor="imageUrl">Product image *</label>
        <p className="text-xs text-manikan-text-secondary mt-1">
          Drag in a JPEG, PNG, or WebP image (up to 10MB), or paste a public HTTPS image URL.
        </p>
      </div>

      <div
        className="rounded-xl border-2 border-dashed border-manikan-border bg-manikan-bg/50 p-5 text-center transition-colors hover:border-forest-400"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files.item(0);
          if (file) void upload(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="text-sm font-medium text-forest-800 hover:text-forest-950 disabled:opacity-60"
        >
          {isUploading ? "Uploading image…" : "Drop an image here or choose a file"}
        </button>
      </div>

      {imageUrl && (
        <div className="flex items-center gap-3 rounded-xl border border-manikan-border bg-white p-3">
          <img src={imageUrl} alt="Selected product" className="h-16 w-16 rounded-lg object-cover" />
          <span className="min-w-0 truncate text-xs text-forest-700">{imageUrl}</span>
        </div>
      )}

      <input
        required
        type="url"
        id="imageUrl"
        name="imageUrl"
        value={imageUrl}
        onChange={(event) => setImageUrl(event.target.value)}
        placeholder="https://..."
        className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
