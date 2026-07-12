"use client";

import React, { useState } from "react";
import Link from "next/link";
import { updateProduct } from "../../../../actions/product";

export default function EditProductForm({ product }: { product: any }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);

    try {
      await updateProduct(product.id, formData);
    } catch (err: any) {
      if (err.message === "NEXT_REDIRECT") {
        throw err;
      }
      setError(err.message || "Something went wrong.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {error && (
        <div className="bg-manikan-error/10 border border-manikan-error text-manikan-error px-4 py-3 rounded-lg text-sm mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card border border-manikan-border p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="name">Product Name *</label>
            <input
              required
              type="text"
              id="name"
              name="name"
              defaultValue={product.name}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="productCode">Product Code / SKU *</label>
            <input
              required
              type="text"
              id="productCode"
              name="productCode"
              defaultValue={product.productCode}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium text-forest-900" htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={product.description || ""}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="category">Category *</label>
            <select
              required
              id="category"
              name="category"
              defaultValue={product.category}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow appearance-none"
            >
              <option value="">Select a category</option>
              <option value="tops">Tops (Shirts, Blouses, T-Shirts)</option>
              <option value="bottoms">Bottoms (Pants, Jeans, Shorts)</option>
              <option value="dresses">Dresses & Jumpsuits</option>
              <option value="outerwear">Outerwear (Jackets, Coats)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="gender">Gender *</label>
            <select
              required
              id="gender"
              name="gender"
              defaultValue={product.gender || "women"}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow appearance-none"
            >
              <option value="women">Women</option>
              <option value="men">Men</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="brand">Brand</label>
            <input
              type="text"
              id="brand"
              name="brand"
              defaultValue={product.brand || ""}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="fabric">Fabric Type</label>
            <input
              type="text"
              id="fabric"
              name="fabric"
              defaultValue={product.fabric || ""}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="priceEgp">Price (EGP) *</label>
            <input
              required
              type="number"
              id="priceEgp"
              name="priceEgp"
              min="0"
              step="0.01"
              defaultValue={product.priceEgp}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="stock">Initial Stock</label>
            <input
              type="number"
              id="stock"
              name="stock"
              min="0"
              defaultValue={product.stock}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium text-forest-900" htmlFor="imageUrl">Product Image URL *</label>
            <input
              required
              type="url"
              id="imageUrl"
              name="imageUrl"
              defaultValue={product.imageUrl}
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end space-x-4 pt-6 border-t border-manikan-border">
          <Link
            href="/dashboard/products"
            className="px-6 py-2.5 rounded-lg font-medium text-manikan-text-secondary hover:text-forest-900 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-manikan-teal hover:bg-manikan-teal-hover text-white px-8 py-2.5 rounded-lg font-medium transition-colors shadow-soft disabled:opacity-70 disabled:cursor-not-allowed flex items-center"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </form>
    </>
  );
}
