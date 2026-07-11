"use client";

import Image from "next/image";

export interface Garment {
    id: string;
    name: string;
    brand: string;
    imageUrl: string;
    priceEgp: number;
    category: "upper_body" | "lower_body" | "dress";
    gender: string;
    discountPct?: number;
}

interface ProductCardProps {
    product: Garment;
    isSelected?: boolean;
    onSelect: (product: Garment) => void;
}

export default function ProductCard({ product, isSelected, onSelect }: ProductCardProps) {
    const categoryLabels: Record<string, string> = {
        upper_body: "Top",
        lower_body: "Bottom",
        dress: "Full Dress",
    };

    const discountedPrice = product.discountPct
        ? product.priceEgp * (1 - product.discountPct / 100)
        : product.priceEgp;

    return (
        <div
            onClick={() => onSelect(product)}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white p-3 cursor-pointer shadow-soft transition-all duration-300 hover:shadow-lift hover:-translate-y-1 ${isSelected
                    ? "border-gold-500 ring-2 ring-gold-500/20"
                    : "border-forest-100 hover:border-forest-300"
                }`}
        >
            {/* Selection Checkmark Indicator */}
            {isSelected && (
                <div className="absolute top-4 left-4 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-white shadow-md animate-scale-up">
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
            )}

            {/* Product Image Area */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-forest-50/50">
                {product.imageUrl ? (
                    <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        sizes="(max-width: 768px) 50vw, 20vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-forest-300 uppercase tracking-wider font-semibold">
                        No Image
                    </div>
                )}

                {/* Subtle Category Badge */}
                <span className="absolute bottom-2.5 right-2 axial-overlay text-[10px] font-bold tracking-wider text-forest-900 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg uppercase shadow-sm">
                    {categoryLabels[product.category] || product.category}
                </span>
            </div>

            {/* Details Container */}
            <div className="flex flex-col gap-1 mt-3 px-1">
                <span className="text-[10px] font-bold text-forest-400 uppercase tracking-widest leading-none">
                    {product.brand}
                </span>
                <h4 className="font-sans text-[13px] font-medium text-forest-900 truncate leading-snug group-hover:text-gold-600 transition-colors">
                    {product.name}
                </h4>

                {/* Price & Discount Indicator */}
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-sans text-[13.5px] font-semibold text-forest-950">
                        EGP {discountedPrice.toLocaleString()}
                    </span>
                    {product.discountPct && product.discountPct > 0 && (
                        <>
                            <span className="text-[11px] text-forest-350 line-through">
                                EGP {product.priceEgp.toLocaleString()}
                            </span>
                            <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1 rounded-sm">
                                -{product.discountPct}%
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
