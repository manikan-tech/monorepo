"use client";

import React, { useState } from "react";
import { updateProduct } from "../../../../actions/product";
import ProductImageField from "../../ProductImageField";

export default function EditProductForm({ product }: { product: any }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [variantRows, setVariantRows] = useState(
    product.variants?.length > 0 ? product.variants : [{ id: "", sizeLabel: "", sku: "", stock: 10, priceOverride: "" }]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    formData.append("productId", product.id);

    try {
      await updateProduct(formData);
    } catch (err: any) {
      setError(err.message || "Failed to update product");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-manikan-bg p-8 rounded-2xl shadow-card border border-manikan-border/50 max-w-4xl mx-auto space-y-8 animate-fade-in-up">
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100 flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="text-sm font-medium text-forest-900">Product Name *</label>
          <input required type="text" name="name" defaultValue={product.name} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-forest-900">Product Code / SKU *</label>
          <input required type="text" name="productCode" defaultValue={product.productCode} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400" />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-forest-900">Description</label>
          <textarea name="description" rows={4} defaultValue={product.description} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-forest-900">Category *</label>
          <select required name="category" defaultValue={product.category} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400">
            <option value="tshirt">T-Shirt (3D try-on)</option>
            <option value="pants">Pants (3D try-on)</option>
            <option value="shirt">Shirt</option>
            <option value="blouse">Blouse</option>
            <option value="skirt">Skirt</option>
            <option value="jacket">Jacket</option>
            <option value="hoodie">Hoodie</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-forest-900">Gender</label>
          <select name="gender" defaultValue={product.gender} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400">
            <option value="women">Women</option>
            <option value="men">Men</option>
            <option value="unisex">Unisex</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-forest-900">Brand</label>
          <input type="text" name="brand" defaultValue={product.brand} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-forest-900">Fabric</label>
          <input type="text" name="fabric" defaultValue={product.fabric} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-forest-900">Price (EGP) *</label>
          <input required type="number" step="0.01" name="priceEgp" defaultValue={product.priceEgp} className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400" />
        </div>

        <ProductImageField defaultValue={product.imageUrl} />

        <div className="space-y-1 md:col-span-2 pt-6 border-t border-manikan-border mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-forest-900">Product Variants</h3>
              <p className="text-sm text-manikan-text-secondary">Manage sizes, unique SKUs, and stock limits.</p>
            </div>
            <button
              type="button"
              onClick={() => setVariantRows([...variantRows, { id: "", sizeLabel: "", sku: "", stock: 10, priceOverride: "" }])}
              className="px-4 py-2 bg-cream-50 text-forest-800 text-sm font-medium rounded-lg border border-manikan-border hover:bg-cream-100 transition-colors"
            >
              + Add Variant
            </button>
          </div>
          
          <div className="space-y-4">
            {variantRows.map((variant: any, index: number) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-manikan-bg p-4 rounded-xl border border-manikan-border">
                <input type="hidden" name="variant_id[]" value={variant.id || ""} />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-forest-900">Size *</label>
                  <input required type="text" name="variant_size[]" defaultValue={variant.sizeLabel} className="w-full px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-forest-900">SKU</label>
                  <input type="text" name="variant_sku[]" defaultValue={variant.sku} className="w-full px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-forest-900">Stock *</label>
                  <input required type="number" name="variant_stock[]" defaultValue={variant.stock} className="w-full px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-forest-900">Price Override</label>
                  <input type="number" step="0.01" name="variant_price[]" defaultValue={variant.priceOverride || ""} className="w-full px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm" />
                </div>
                <div className="pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      const newRows = [...variantRows];
                      newRows.splice(index, 1);
                      setVariantRows(newRows);
                    }}
                    className="text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 w-full"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-manikan-border flex justify-end gap-4">
        <a href="/dashboard/products" className="px-6 py-2.5 text-forest-700 hover:bg-forest-50 rounded-xl font-medium transition-colors">
          Cancel
        </a>
        <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-forest-900 hover:bg-forest-800 text-white rounded-xl font-medium transition-all duration-300 shadow-soft hover:shadow-card hover:-translate-y-0.5 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
          {isSubmitting ? "Updating..." : "Update Product"}
        </button>
      </div>
    </form>
  );
}
