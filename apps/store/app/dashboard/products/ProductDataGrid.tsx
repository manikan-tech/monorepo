"use client";

import React, { useState } from "react";

type Product = {
  id: string;
  name: string;
  productCode: string;
  category: string;
  priceEgp: number;
  stock: number;
  imageUrl: string;
};

export default function ProductDataGrid({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("");

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.productCode.toLowerCase().includes(search.toLowerCase())
  );

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-12 text-center">
        <div className="w-16 h-16 bg-forest-50 text-forest-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 className="text-xl font-display font-semibold text-forest-900 mb-2">No products found</h3>
        <p className="text-manikan-text-secondary max-w-sm mx-auto">
          You haven't added any products to your catalog yet. Click "Add New Product" to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden">
      <div className="p-4 border-b border-manikan-border bg-cream-50/30">
        <input
          type="text"
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-white border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/50 text-forest-800 text-sm font-medium border-b border-manikan-border">
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">Code / SKU</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Price</th>
              <th className="px-6 py-4">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border">
            {filteredProducts.map((product) => (
              <tr key={product.id} className="hover:bg-cream-50/30 transition-colors group">
                <td className="px-6 py-4 flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-manikan-border group-hover:border-forest-200 transition-colors">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="font-medium text-forest-900">{product.name}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-manikan-text-secondary">{product.productCode}</td>
                <td className="px-6 py-4">
                  <span className="px-3 py-1 bg-forest-50 text-forest-700 rounded-full text-xs font-medium border border-forest-100">
                    {product.category}
                  </span>
                </td>
                <td className="px-6 py-4 font-medium text-manikan-text">EGP {product.priceEgp.toFixed(2)}</td>
                <td className="px-6 py-4">
                  {product.stock > 0 ? (
                    <span className="text-green-600 font-medium">{product.stock} in stock</span>
                  ) : (
                    <span className="text-red-500 font-medium">Out of stock</span>
                  )}
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-manikan-text-secondary">
                  No products match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
