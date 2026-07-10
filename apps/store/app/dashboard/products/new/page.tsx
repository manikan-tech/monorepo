"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createProduct } from "../../../actions/product";

export default function AddProductPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);

    try {
      await createProduct(formData);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link
          href="/dashboard/products"
          className="w-10 h-10 rounded-full bg-white border border-manikan-border flex items-center justify-center text-forest-700 hover:bg-forest-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="text-2xl font-display text-forest-900">Add New Product</h2>
          <p className="text-manikan-text-secondary">Fill in the details to add a new garment to your catalog.</p>
        </div>
      </div>

      {error && (
        <div className="bg-manikan-error/10 border border-manikan-error text-manikan-error px-4 py-3 rounded-lg text-sm">
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
              placeholder="e.g. Classic Oxford Shirt"
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
              placeholder="e.g. OXF-BLU-M"
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium text-forest-900" htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Tell shoppers about this garment..."
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="category">Category *</label>
            <select
              required
              id="category"
              name="category"
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
              placeholder="Your brand name"
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-forest-900" htmlFor="fabric">Fabric Type</label>
            <input
              type="text"
              id="fabric"
              name="fabric"
              placeholder="e.g. 100% Cotton"
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
              placeholder="0.00"
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
              defaultValue="0"
              className="w-full px-4 py-2.5 bg-manikan-input-bg border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium text-forest-900" htmlFor="imageUrl">Product Image URL *</label>
            <p className="text-xs text-manikan-text-secondary mb-2">For this version, please paste a direct link to the product image (e.g. https://example.com/shirt.jpg)</p>
            <input
              required
              type="url"
              id="imageUrl"
              name="imageUrl"
              placeholder="https://..."
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
              "Save Product"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
