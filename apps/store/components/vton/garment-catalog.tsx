"use client";

import { useState, useEffect } from "react";
import ProductCard, { Garment } from "./product-card";

interface GarmentCatalogProps {
    selectedGarment: Garment | null;
    onSelectGarment: (garment: Garment) => void;
    initialSelectedGarmentId?: string;
}

// Complete mock database to use as robust fallback if the network or local database is empty/issues
const FALLBACK_GARMENTS: Garment[] = [
    {
        id: "g1",
        name: "Classic Forest Crewneck Sweatshirt",
        brand: "Manikan",
        imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=600&auto=format&fit=crop",
        priceEgp: 950,
        category: "shirt",
        gender: "Men",
        discountPct: 15
    },
    {
        id: "g2",
        name: "White Oversized Casual Tee",
        brand: "Basics",
        imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600&auto=format&fit=crop",
        priceEgp: 450,
        category: "shirt",
        gender: "Women"
    },
    {
        id: "g3",
        name: "Vintage Floral Summer Dress",
        brand: "Bella",
        imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?q=80&w=600&auto=format&fit=crop",
        priceEgp: 1850,
        category: "dress",
        gender: "Women",
        discountPct: 20
    },
    {
        id: "g4",
        name: "Slim Fit Canvas Chinos",
        brand: "Atelier",
        imageUrl: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=600&auto=format&fit=crop",
        priceEgp: 1200,
        category: "pants",
        gender: "Men"
    },
    {
        id: "g5",
        name: "A-Line Denim Buttoned Skirt",
        brand: "Denim & Co",
        imageUrl: "https://images.unsplash.com/photo-1582142306909-195724d33ab9?q=80&w=600&auto=format&fit=crop",
        priceEgp: 850,
        category: "skirt",
        gender: "Women",
        discountPct: 10
    },
    {
        id: "g6",
        name: "Relaxed Linen Autumn Trench Coat",
        brand: "Manikan",
        imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=600&auto=format&fit=crop",
        priceEgp: 2900,
        category: "jacket",
        gender: "Women"
    }
];

export default function GarmentCatalog({ selectedGarment, onSelectGarment, initialSelectedGarmentId }: GarmentCatalogProps) {
    const [garments, setGarments] = useState<Garment[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [search, setSearch] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [selectedGender, setSelectedGender] = useState<string>("all");

    // Attempt to fetch garments from active store API route, fall back to default catalog on error or empty
    useEffect(() => {
        async function loadGarments() {
            try {
                setLoading(true);
                const res = await fetch("/api/products?limit=50");
                if (!res.ok) {
                    throw new Error("Failed to fetch from store API");
                }
                const data = await res.json();

                if (data?.products && Array.isArray(data.products) && data.products.length > 0) {
                    // Map DB structure to garment structures in state
                    const mapped: Garment[] = data.products.map((p: any) => {
                        // Map store categories to the values accepted by CatVTON.
                        const dbCat = String(p.categoryRef?.slug || p.category || "").toLowerCase();
                        let matchedCategory: Garment["category"] = "shirt";
                        if (dbCat.includes("skirt")) {
                            matchedCategory = "skirt";
                        } else if (dbCat.includes("pants") || dbCat.includes("trouser") || dbCat.includes("bottom") || dbCat.includes("lower")) {
                            matchedCategory = "pants";
                        } else if (dbCat.includes("dress") || dbCat.includes("suit")) {
                            matchedCategory = "dress";
                        } else if (dbCat.includes("jacket") || dbCat.includes("coat")) {
                            matchedCategory = "jacket";
                        } else if (dbCat.includes("blouse")) {
                            matchedCategory = "blouse";
                        }

                        return {
                            id: String(p.id),
                            name: p.name,
                            brand: p.brand || "Manikan",
                            imageUrl: p.imageUrl || "",
                            priceEgp: p.priceEgp || 0,
                            category: matchedCategory,
                            gender: p.gender || "Unisex",
                            discountPct: p.discountPct || 0
                        };
                    });
                    setGarments(mapped);
                } else {
                    setGarments(FALLBACK_GARMENTS);
                }
            } catch (err) {
                console.warn("Garment API offline, using premium fallback garments database:", err);
                setGarments(FALLBACK_GARMENTS);
            } finally {
                setLoading(false);
            }
        }

        loadGarments();
    }, []);

    useEffect(() => {
        if (!initialSelectedGarmentId || garments.length === 0) return;
        const matched = garments.find((garment) => garment.id === initialSelectedGarmentId);
        if (matched && selectedGarment?.id !== matched.id) {
            onSelectGarment(matched);
        }
    }, [garments, initialSelectedGarmentId, onSelectGarment, selectedGarment?.id]);

    // Filtering Logic
    const filteredGarments = garments.filter((g) => {
        const matchesSearch =
            g.name.toLowerCase().includes(search.toLowerCase()) ||
            g.brand.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === "all" || g.category === selectedCategory;
        const matchesGender = selectedGender === "all" || g.gender.toLowerCase() === selectedGender.toLowerCase();

        return matchesSearch && matchesCategory && matchesGender;
    });

    return (
        <div id="garment-catalog" className="flex flex-col h-full bg-white rounded-2xl border border-forest-100/80 p-5 shadow-soft">
            {/* Header Info */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-forest-50">
                <div>
                    <h3 className="font-display text-lg font-bold text-forest-950">Select Garment</h3>
                    <p className="text-xs text-forest-500 mt-0.5">Click a clothing item you want to try on virtual models.</p>
                </div>
            </div>

            {/* Catalog Search & Filters Panel */}
            <div className="flex flex-col gap-3 py-4">
                {/* Search */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search items, brands..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-forest-200 rounded-xl text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500/25 transition-all text-forest-900"
                    />
                    <svg
                        className="absolute left-3.5 top-3 text-forest-400"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </div>

                {/* Filters Grid */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Categories */}
                    <div className="flex items-center gap-1 bg-forest-50/50 p-1 rounded-xl">
                        {[
                            { id: "all", label: "All" },
                            { id: "shirt", label: "Tops" },
                            { id: "jacket", label: "Jackets" },
                            { id: "pants", label: "Pants" },
                            { id: "skirt", label: "Skirts" },
                            { id: "dress", label: "Dresses" },
                        ].map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${selectedCategory === cat.id
                                    ? "bg-forest-900 text-white shadow-sm"
                                    : "text-forest-700 hover:text-forest-900 hover:bg-forest-100/55"
                                    }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Gender */}
                    <div className="flex items-center gap-1 bg-forest-50/50 p-1 rounded-xl">
                        {[
                            { id: "all", label: "All Genders" },
                            { id: "men", label: "Men" },
                            { id: "women", label: "Women" },
                        ].map((gen) => (
                            <button
                                key={gen.id}
                                onClick={() => setSelectedGender(gen.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${selectedGender === gen.id
                                    ? "bg-forest-900 text-white shadow-sm"
                                    : "text-forest-700 hover:text-forest-900 hover:bg-forest-100/55"
                                    }`}
                            >
                                {gen.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Garments List Grid */}
            <div className="flex-1 overflow-y-auto max-h-[500px] scrollbar-thin pr-1">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="h-7 w-7 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
                        <span className="text-xs text-forest-500 font-semibold tracking-wider uppercase">Loading Garments...</span>
                    </div>
                ) : filteredGarments.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pb-4">
                        {filteredGarments.map((garment) => (
                            <ProductCard
                                key={garment.id}
                                product={garment}
                                isSelected={selectedGarment?.id === garment.id}
                                onSelect={onSelectGarment}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-4 border-2 border-dashed border-forest-100 rounded-2xl bg-forest-50/30">
                        <svg
                            className="text-forest-300 mb-3"
                            width="36"
                            height="36"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                        </svg>
                        <h4 className="text-sm font-bold text-forest-900">No Garments Found</h4>
                        <p className="text-xs text-forest-450 mt-1 max-w-[200px]">Try adjusting your search query or catalog filter settings.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
