"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export type CartItem = {
  id: string;          // CartItem DB id
  productId: string;
  variantId: string;
  name: string;
  brand: string;
  priceEgp: number;
  imageUrl: string;
  slug: string;
  sizeLabel: string;
  quantity: number;
  stock: number;
};

type CartContextType = {
  items: CartItem[];
  loading: boolean;
  addToCart: (payload: { productId: string; variantId: string; quantity?: number }) => Promise<{ error?: string }>;
  removeFromCart: (cartItemId: string) => Promise<void>;
  updateQuantity: (cartItemId: string, quantity: number) => Promise<{ error?: string }>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  cartTotal: number;
  cartCount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cart");
      if (res.status === 401) {
        // Not logged in — clear items
        setItems([]);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const mapped: CartItem[] = (data.cartItems ?? []).map((ci: any) => ({
        id: ci.id,
        productId: ci.productId,
        variantId: ci.variantId,
        name: ci.product.name,
        brand: ci.product.brand,
        priceEgp: ci.variant.priceOverride ?? ci.product.priceEgp,
        imageUrl: ci.product.imageUrl,
        slug: ci.product.slug,
        sizeLabel: ci.variant.sizeLabel,
        quantity: ci.quantity,
        stock: ci.variant.stock,
      }));
      setItems(mapped);
    } catch {
      // network error — leave existing items
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addToCart = async ({ productId, variantId, quantity = 1 }: { productId: string; variantId: string; quantity?: number }): Promise<{ error?: string }> => {
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, variantId, quantity }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Failed to add to cart" };
    await refreshCart();
    return {};
  };

  const removeFromCart = async (cartItemId: string) => {
    await fetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== cartItemId));
  };

  const updateQuantity = async (cartItemId: string, quantity: number): Promise<{ error?: string }> => {
    if (quantity === 0) {
      await removeFromCart(cartItemId);
      return {};
    }
    const res = await fetch(`/api/cart/${cartItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Failed to update quantity" };
    setItems((prev) => prev.map((i) => i.id === cartItemId ? { ...i, quantity } : i));
    return {};
  };

  const clearCart = async () => {
    await fetch("/api/cart", { method: "DELETE" });
    setItems([]);
  };

  const cartTotal = items.reduce((total, item) => total + item.priceEgp * item.quantity, 0);
  const cartCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, loading, addToCart, removeFromCart, updateQuantity, clearCart, refreshCart, cartTotal, cartCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) throw new Error("useCart must be used within a CartProvider");
  return context;
}
