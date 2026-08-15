"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { createClient } from "../app/lib/supabase/client";
import Modal from "./Modal";
import Link from "next/link";

export type WishlistItem = {
    id: string;
    productId: string;
    name: string;
    brand: string;
    slug: string;
    priceEgp: number;
    discountPct: number;
    imageUrl: string;
    isActive: boolean;
};

type WishlistContextType = {
    items: WishlistItem[];
    loading: boolean;
    isWishlisted: (productId: string) => boolean;
    toggle: (productId: string) => Promise<void>;
    refresh: () => Promise<void>;
};

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<WishlistItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/wishlist");
            if (!res.ok) return;
            const data = await res.json();
            const mapped: WishlistItem[] = (data.wishlist ?? []).map((w: any) => ({
                id: w.id,
                productId: w.productId,
                name: w.product.name,
                brand: w.product.brand,
                slug: w.product.slug,
                priceEgp: w.product.priceEgp,
                discountPct: w.product.discountPct,
                imageUrl: w.product.imageUrl,
                isActive: w.product.isActive,
            }));
            setItems(mapped);
        } catch {
            // network error
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            void refresh();
        });
        return () => subscription.unsubscribe();
    }, [refresh]);

    const isWishlisted = (productId: string) => items.some((i) => i.productId === productId);

    const toggle = async (productId: string) => {
        const existing = items.find((i) => i.productId === productId);
        if (existing) {
            // Optimistic remove
            setItems((prev) => prev.filter((i) => i.productId !== productId));
            const res = await fetch(`/api/wishlist/${existing.id}`, { method: "DELETE" });
            if (res.status === 401) {
                // Roll back and prompt login
                setItems((prev) => [...prev, existing]);
                setShowAuthModal(true);
            }
        } else {
            // Add
            const res = await fetch("/api/wishlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId }),
            });
            if (res.status === 401) {
                setShowAuthModal(true);
                return;
            }
            if (res.ok) {
                // Optimistic add — get data from response to update state immediately
                const data = await res.json();
                if (data.wishlistItem) {
                    const w = data.wishlistItem;
                    setItems((prev) => [
                        ...prev,
                        {
                            id: w.id,
                            productId: w.productId,
                            name: w.product?.name ?? "",
                            brand: w.product?.brand ?? "",
                            slug: w.product?.slug ?? productId,
                            priceEgp: w.product?.priceEgp ?? 0,
                            discountPct: w.product?.discountPct ?? 0,
                            imageUrl: w.product?.imageUrl ?? "",
                            isActive: w.product?.isActive ?? true,
                        },
                    ]);
                } else {
                    // Fallback: re-fetch from server
                    await refresh();
                }
            }
        }
    };

    return (
        <WishlistContext.Provider value={{ items, loading, isWishlisted, toggle, refresh }}>
            {children}
            <Modal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                title="Sign In Required"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-forest-700">
                        Please sign in or create an account to save items to your wishlist.
                    </p>
                    <div className="flex gap-3 justify-end mt-2">
                        <button 
                            onClick={() => setShowAuthModal(false)}
                            className="px-4 py-2 text-sm font-medium text-forest-700 hover:text-forest-950 transition-colors"
                        >
                            Cancel
                        </button>
                        <Link 
                            href="/login"
                            onClick={() => setShowAuthModal(false)}
                            className="px-5 py-2 bg-forest-900 text-white rounded-xl text-sm font-medium hover:bg-forest-800 transition-colors"
                        >
                            Sign In
                        </Link>
                    </div>
                </div>
            </Modal>
        </WishlistContext.Provider>
    );
}

export function useWishlist() {
    const context = useContext(WishlistContext);
    if (!context) throw new Error("useWishlist must be used within a WishlistProvider");
    return context;
}
