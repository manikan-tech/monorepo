"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import ProductCard from "../../components/ProductCard";

export default function StorePage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";

  // Categories from API
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string }[]>([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 12;

  // Filter State
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [brand, setBrand] = useState("");
  const [sort, setSort] = useState("newest");

  // Fetch categories on mount
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        // Flatten tree to get all categories (incl. children)
        const flatten = (cats: any[]): any[] =>
          cats.flatMap((c: any) => [{ id: c.id, name: c.name, slug: c.slug }, ...flatten(c.children ?? [])]);
        setCategories(flatten(data.categories ?? []));
      })
      .catch(() => { });
  }, []);

  const fetchProducts = useCallback(async (page: number, cat: string, gen: string, brnd: string, srt: string, q: string) => {
    try {
      setLoading(true);
      setError("");

      let url = `/api/products?page=${page}&limit=${limit}`;
      if (cat) url += `&category=${cat}`;
      if (gen) url += `&gender=${gen}`;
      if (brnd) url += `&brand=${brnd}`;
      if (srt) url += `&sort=${srt}`;
      if (q) url += `&search=${encodeURIComponent(q)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load products. Make sure your database is running!");

      const data = await res.json();
      setProducts(data.products || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Remove the problematic useEffect that was causing double-fetches
  // useEffect(() => {
  //   setCurrentPage(1);
  // }, [category, gender, sort]);

  useEffect(() => {
    fetchProducts(currentPage, category, gender, brand, sort, search);
  }, [currentPage, category, gender, brand, sort, search, fetchProducts]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-16">
      {/* ── Page Header ── */}
      <div className="mb-16 text-center max-w-2xl mx-auto flex flex-col items-center">
        {search ? (
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-forest-950 mb-4 animate-fade-in-up opacity-0" style={{ animationDelay: '0ms' }}>
            Search results for <span className="italic bg-clip-text text-transparent bg-gradient-to-r from-gold-400 via-yellow-200 to-gold-600 bg-[length:200%_auto] animate-shimmer-slow">"{search}"</span>
          </h1>
        ) : (
          <>
            <h1 className="font-display text-4xl md:text-5xl font-semibold text-forest-950 mb-4 animate-fade-in-up opacity-0" style={{ animationDelay: '0ms' }}>
              The <span className="italic bg-clip-text text-transparent bg-gradient-to-r from-gold-400 via-yellow-200 to-gold-600 bg-[length:200%_auto] animate-shimmer-slow">Collection</span>
            </h1>
            <p className="font-sans text-forest-700/80 leading-relaxed animate-fade-in-up opacity-0" style={{ animationDelay: '100ms' }}>
              Explore our latest arrivals. Every item in the catalog is fully supported by Manikan's 3D Virtual Try-On and AI size recommendations.
            </p>
          </>
        )}
      </div>

      {/* ── Filters & Sort ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 animate-fade-in-up opacity-0" style={{ animationDelay: '200ms' }}>
        <div className="flex flex-wrap gap-3">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2.5 rounded-xl border-2 border-forest-100 bg-cream-50 text-forest-900 text-sm font-medium focus:outline-none focus:border-gold-400 transition-colors cursor-pointer hover:bg-white"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.slug}>{cat.name}</option>
            ))}
          </select>
          <select
            value={gender}
            onChange={(e) => {
              setGender(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2.5 rounded-xl border-2 border-forest-100 bg-cream-50 text-forest-900 text-sm font-medium focus:outline-none focus:border-gold-400 transition-colors cursor-pointer hover:bg-white"
          >
            <option value="">All Genders</option>
            <option value="women">Women</option>
            <option value="men">Men</option>
          </select>
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2.5 rounded-xl border-2 border-forest-100 bg-cream-50 text-forest-900 text-sm font-medium focus:outline-none focus:border-gold-400 transition-colors cursor-pointer hover:bg-white"
          >
            <option value="">All Brands</option>
            <option value="Nour Atelier">Nour Atelier</option>
            <option value="Cairo Thread Co.">Cairo Thread Co.</option>
          </select>
        </div>

        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setCurrentPage(1);
          }}
          className="px-4 py-2.5 rounded-xl border-2 border-forest-100 bg-cream-50 text-forest-900 text-sm font-medium focus:outline-none focus:border-gold-400 transition-colors cursor-pointer hover:bg-white"
        >
          <option value="newest">Newest Arrivals</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
        </select>
      </div>

      {/* ── Products Grid ── */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <span className="inline-block w-8 h-8 border-[3px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex justify-center items-center h-64 text-red-500/80 bg-red-50/50 rounded-2xl p-6 text-sm font-medium border border-red-100 animate-fade-in-up">
          {error}
        </div>
      ) : products.length === 0 ? (
        <div className="flex justify-center items-center h-64 text-forest-700/60 text-sm font-medium animate-fade-in-up">
          No products match your filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-16">
            {products.map((product: any, index: number) => (
              <div
                key={product.id}
                className="opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${(index % limit) * 75}ms` }}
              >
                <ProductCard product={product} />
              </div>
            ))}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="mt-20 flex items-center justify-center gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '500ms' }}>
              <button
                disabled={currentPage === 1}
                onClick={() => {
                  setCurrentPage(prev => Math.max(prev - 1, 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="p-2.5 rounded-full border border-forest-200 text-forest-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-forest-50 hover:border-forest-300 transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              <div className="flex gap-2">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setCurrentPage(i + 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${currentPage === i + 1
                      ? 'bg-forest-900 text-white shadow-soft'
                      : 'text-forest-700 hover:bg-forest-100'
                      }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                disabled={currentPage === totalPages}
                onClick={() => {
                  setCurrentPage(prev => Math.min(prev + 1, totalPages));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="p-2.5 rounded-full border border-forest-200 text-forest-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-forest-50 hover:border-forest-300 transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
