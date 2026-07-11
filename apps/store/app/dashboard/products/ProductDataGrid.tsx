"use client";

import React, { useState } from "react";
import Link from "next/link";
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
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.productCode.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1;
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
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
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden flex flex-col">
      <div className="p-4 border-b border-manikan-border bg-cream-50/30">
        <input
          type="text"
          placeholder="Search by name or code..."
          value={search}
          onChange={handleSearchChange}
          className="w-full max-w-md px-4 py-2 bg-white border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow"
        />
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/50 text-forest-800 text-sm font-medium border-b border-manikan-border">
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">Code / SKU</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Price</th>
              <th className="px-6 py-4">Stock</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border">
            {paginatedProducts.map((product) => (
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
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/products/${product.id}/edit`} className="text-sm px-3 py-1.5 rounded bg-cream-50 text-forest-700 hover:bg-cream-100 transition-colors">
                      Edit
                    </Link>
                    <button 
                      className="text-sm px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      onClick={async () => {
                        if (confirm('Are you sure you want to delete this product?')) {
                          try {
                            const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
                            if (res.ok) {
                              window.location.reload();
                            } else {
                              alert('Failed to delete product');
                            }
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paginatedProducts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-manikan-text-secondary">
                  No products match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      <div className="p-4 border-t border-manikan-border bg-cream-50/30 flex items-center justify-between text-sm text-manikan-text-secondary">
        <div>
          Showing <span className="font-medium text-forest-900">{filteredProducts.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}</span> to <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)}</span> of <span className="font-medium text-forest-900">{filteredProducts.length}</span> products
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="px-2 font-medium text-forest-900">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
