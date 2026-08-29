"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import Modal from "../../../components/Modal";

type Product = {
  id: string;
  name: string;
  productCode: string;
  category: string;
  gender?: string;
  brand?: string;
  priceEgp: number;
  stock: number;
  imageUrl: string;
};

export default function ProductDataGrid({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterStock, setFilterStock] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category).filter(Boolean))), [products]);
  const genders = useMemo(() => Array.from(new Set(products.map(p => p.gender).filter(Boolean))), [products]);
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))), [products]);

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.productCode.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory ? p.category === filterCategory : true;
    const matchesGender = filterGender ? p.gender === filterGender : true;
    const matchesBrand = filterBrand ? p.brand === filterBrand : true;
    
    let matchesStock = true;
    if (filterStock === "in-stock") matchesStock = p.stock >= 10;
    if (filterStock === "low-stock") matchesStock = p.stock > 0 && p.stock < 10;
    if (filterStock === "out-of-stock") matchesStock = p.stock === 0;

    return matchesSearch && matchesCategory && matchesGender && matchesBrand && matchesStock;
  });

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
      <div className="p-4 border-b border-manikan-border bg-cream-50/30 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={handleSearchChange}
            className="w-full px-4 py-2 pl-10 bg-white border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent transition-shadow text-sm"
          />
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-700/40 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm text-forest-900 focus:outline-none focus:border-forest-400"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filterGender}
          onChange={(e) => { setFilterGender(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm text-forest-900 focus:outline-none focus:border-forest-400"
        >
          <option value="">All Genders</option>
          {genders.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select
          value={filterBrand}
          onChange={(e) => { setFilterBrand(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm text-forest-900 focus:outline-none focus:border-forest-400"
        >
          <option value="">All Brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <select
          value={filterStock}
          onChange={(e) => { setFilterStock(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 bg-white border border-manikan-border rounded-lg text-sm text-forest-900 focus:outline-none focus:border-forest-400"
        >
          <option value="">All Stock</option>
          <option value="in-stock">In Stock (10+)</option>
          <option value="low-stock">Low Stock (&lt;10)</option>
          <option value="out-of-stock">Out of Stock (0)</option>
        </select>

        {(search || filterCategory || filterGender || filterBrand || filterStock) && (
          <button
            onClick={() => {
              setSearch("");
              setFilterCategory("");
              setFilterGender("");
              setFilterBrand("");
              setFilterStock("");
              setCurrentPage(1);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-manikan-border rounded-lg text-sm font-medium text-forest-700 hover:text-forest-950 hover:bg-forest-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear Filters
          </button>
        )}
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
            {paginatedProducts.map((product, idx) => (
              <tr 
                key={product.id} 
                className="hover:bg-cream-50/30 transition-colors group animate-fade-up"
                style={{ animationDelay: `${100 + idx * 50}ms`, animationFillMode: "both" }}
              >
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
                    <Link 
                      href={`/dashboard/products/${product.id}/edit`}
                      className="text-sm px-3 py-1.5 rounded bg-cream-50 text-forest-700 hover:bg-cream-100 transition-colors"
                    >
                      Edit
                    </Link>
                    <button 
                      className="text-sm px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      onClick={() => setProductToDelete(product)}
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!productToDelete}
        onClose={() => !isDeleting && setProductToDelete(null)}
        title="Delete Product"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setProductToDelete(null)}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-forest-700 hover:text-forest-950 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!productToDelete) return;
                setIsDeleting(true);
                try {
                  const res = await fetch(`/api/retailer/products/${productToDelete.id}`, { method: 'DELETE' });
                  const data = await res.json();
                  if (res.ok) {
                    setProductToDelete(null);
                    window.location.reload();
                  } else {
                    setDeleteError(data.error || 'Failed to delete product');
                    setProductToDelete(null);
                  }
                } catch (e: any) {
                  setDeleteError(e.message || 'An error occurred while deleting the product.');
                  setProductToDelete(null);
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting}
              className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <span className="inline-block w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </button>
          </div>
        }
      >
        <p className="text-forest-700 text-sm">
          Are you sure you want to delete <span className="font-semibold text-forest-900">{productToDelete?.name}</span> ({productToDelete?.productCode})? This action cannot be undone.
        </p>
      </Modal>

      {/* Delete Error Modal */}
      <Modal
        isOpen={!!deleteError}
        onClose={() => setDeleteError(null)}
        title="Cannot Delete Product"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setDeleteError(null)}
              className="px-5 py-2 bg-forest-900 text-white rounded-xl text-sm font-medium hover:bg-forest-800 transition-colors"
            >
              Got it
            </button>
          </div>
        }
      >
        <p className="text-forest-700 text-sm">{deleteError}</p>
      </Modal>
    </div>
  );
}
