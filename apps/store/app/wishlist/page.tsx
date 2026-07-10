"use client";

import Link from "next/link";
import Image from "next/image";
import { useWishlist } from "../../components/WishlistContext";
import { useCart } from "../../components/CartContext";
import { useState } from "react";

export default function WishlistPage() {
    const { items, loading, toggle } = useWishlist();
    const { addToCart } = useCart();
    const [addingId, setAddingId] = useState<string | null>(null);

    return (
        <div className="max-w-[1200px] mx-auto px-6 py-12 md:py-20 w-full">
            <h1 className="font-display text-4xl font-semibold text-forest-950 mb-10 animate-fade-in-up">Wishlist</h1>

            {loading ? (
                <div className="flex justify-center py-20">
                    <span className="inline-block w-8 h-8 border-[3px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
                </div>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center animate-fade-in-up">
                    <div className="w-20 h-20 bg-forest-50 rounded-full flex items-center justify-center text-forest-900/30">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                    </div>
                    <h2 className="font-display text-2xl font-semibold text-forest-950">Your wishlist is empty</h2>
                    <p className="text-forest-700/70">Save products you love and come back to them later.</p>
                    <Link href="/store" className="mt-2 bg-forest-900 text-white rounded-xl px-8 py-3 font-medium hover:bg-forest-800 transition-colors">
                        Browse Collection
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {items.map((item, i) => (
                        <div
                            key={item.id}
                            className="group flex flex-col gap-3 animate-fade-in-up"
                            style={{ animationDelay: `${i * 80}ms` }}
                        >
                            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-forest-50 shadow-soft">
                                <Link href={`/store/${item.slug}`}>
                                    {item.imageUrl ? (
                                        <Image src={item.imageUrl} alt={item.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-forest-400">No image</div>
                                    )}
                                </Link>
                                {!item.isActive && (
                                    <div className="absolute inset-0 bg-forest-950/50 flex items-center justify-center">
                                        <span className="text-white text-xs font-semibold bg-red-500 px-3 py-1.5 rounded-full">Unavailable</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => toggle(item.productId)}
                                    className="absolute top-3 right-3 p-2 rounded-full bg-white/90 backdrop-blur-sm text-gold-500 shadow-sm hover:scale-110 transition-all"
                                    aria-label="Remove from wishlist"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                                    </svg>
                                </button>
                            </div>

                            <div className="px-1">
                                <p className="text-xs font-bold text-forest-700/40 uppercase tracking-widest">{item.brand}</p>
                                <Link href={`/store/${item.slug}`}>
                                    <h3 className="text-[14px] font-medium text-forest-950 truncate group-hover:text-gold-600 transition-colors">{item.name}</h3>
                                </Link>
                                <div className="flex items-center gap-2 mt-1">
                                    {item.discountPct > 0 ? (
                                        <>
                                            <span className="font-semibold text-forest-900 text-sm">
                                                EGP {(item.priceEgp * (1 - item.discountPct / 100)).toLocaleString()}
                                            </span>
                                            <span className="text-xs text-forest-700/40 line-through">
                                                EGP {item.priceEgp.toLocaleString()}
                                            </span>
                                            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-sm">
                                                -{item.discountPct}%
                                            </span>
                                        </>
                                    ) : (
                                        <span className="font-semibold text-forest-900 text-sm">EGP {item.priceEgp.toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                            <Link
                                href={`/store/${item.slug}`}
                                className="mx-1 py-2.5 text-center text-sm font-medium bg-forest-900 text-white rounded-xl hover:bg-forest-800 transition-colors"
                            >
                                View Product
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
