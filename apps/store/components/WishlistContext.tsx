"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

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

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/wishlist");
            if (res.status === 401) { setItems([]); return; }
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

    useEffect(() => { refresh(); }, [refresh]);

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
                alert("Please sign in to manage your wishlist.");
            }
        } else {
            // Add
            const res = await fetch("/api/wishlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId }),
            });
            if (res.status === 401) {
                alert("Please sign in to add items to your wishlist.");
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
        </WishlistContext.Provider>
    );
}

export function useWishlist() {
    const context = useContext(WishlistContext);
    if (!context) throw new Error("useWishlist must be used within a WishlistProvider");
    return context;
}
