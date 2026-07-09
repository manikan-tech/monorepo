"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  priceEgp: number;
  imageUrl: string;
  quantity: number;
};

type CartContextType = {
  items: CartItem[];
  addToCart: (product: any, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load from local storage initially
  useEffect(() => {
    const saved = localStorage.getItem("manikan_cart");
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse cart");
      }
    }
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem("manikan_cart", JSON.stringify(items));
  }, [items]);

  const addToCart = (product: any, quantity: number) => {
    setItems((currentItems) => {
      const existing = currentItems.find((item) => item.productId === product.id);
      if (existing) {
        return currentItems.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...currentItems,
        {
          id: Math.random().toString(36).substr(2, 9),
          productId: product.id,
          name: product.name,
          priceEgp: product.priceEgp,
          imageUrl: product.imageUrl,
          quantity,
        },
      ];
    });
  };

  const removeFromCart = (productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  };

  const clearCart = () => setItems([]);

  const cartTotal = items.reduce((total, item) => total + item.priceEgp * item.quantity, 0);
  const cartCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addToCart, removeFromCart, clearCart, cartTotal, cartCount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
