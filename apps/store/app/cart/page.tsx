"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "../../components/CartContext";

export default function CartPage() {
  const { items, removeFromCart, cartTotal, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh] gap-6 animate-fade-in-up">
        <div className="w-24 h-24 bg-forest-50 rounded-full flex items-center justify-center text-forest-900/30 mb-2">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-forest-950">Your Cart is Empty</h1>
        <p className="text-forest-700/80 max-w-md text-center">Looks like you haven't added anything to your cart yet. Discover your next favorite outfit in our collection.</p>
        <Link href="/store" className="mt-4 bg-forest-900 text-white rounded-xl px-8 py-3 font-medium shadow-soft hover:bg-forest-800 transition-all duration-300 hover:shadow-card hover:-translate-y-0.5 active:scale-[0.98]">
          Explore Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12 md:py-20 w-full">
      <div className="flex items-end justify-between mb-12 animate-fade-in-up">
        <h1 className="font-display text-4xl md:text-5xl font-semibold bg-gradient-to-r from-gold-400 via-gold-600 to-gold-400 text-transparent bg-clip-text bg-[length:200%_100%] animate-shimmer-slow">
          Shopping Cart
        </h1>
        <button onClick={clearCart} className="text-sm font-medium text-forest-700/60 hover:text-red-500 transition-colors underline underline-offset-4 decoration-transparent hover:decoration-red-500/30">
          Clear Cart
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Cart Items */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {items.map((item, index) => (
            <div 
              key={item.id} 
              className="flex gap-6 p-4 rounded-3xl bg-white border border-forest-900/5 shadow-soft animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="relative w-32 h-40 bg-forest-50 rounded-2xl overflow-hidden shrink-0">
                <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
              </div>
              <div className="flex flex-col justify-between py-2 flex-1">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-forest-950 line-clamp-2">{item.name}</h3>
                    <p className="text-sm text-forest-700/60 mt-1">Qty: {item.quantity}</p>
                  </div>
                  <span className="font-semibold text-forest-950 whitespace-nowrap">EGP {item.priceEgp.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-end">
                  <button 
                    onClick={() => removeFromCart(item.productId)}
                    className="text-sm font-medium text-forest-700/60 hover:text-red-500 transition-colors flex items-center gap-1.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-4 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <div className="bg-forest-950 text-white rounded-3xl p-8 shadow-card sticky top-32">
            <h2 className="font-display text-2xl font-semibold mb-6">Order Summary</h2>
            
            <div className="flex flex-col gap-4 text-sm font-light text-white/80 border-b border-white/10 pb-6 mb-6">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-medium text-white">EGP {cartTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="font-medium text-gold-400">Calculated at checkout</span>
              </div>
            </div>

            <div className="flex justify-between items-end mb-8">
              <span className="text-white/80">Total</span>
              <span className="font-display text-3xl font-semibold text-gold-500">EGP {cartTotal.toLocaleString()}</span>
            </div>

            <button className="relative overflow-hidden flex items-center justify-center gap-2 w-full bg-gold-500 text-forest-950 rounded-2xl py-4 font-semibold hover:bg-gold-400 transition-all duration-300 hover:shadow-[0_0_20px_rgba(200,150,102,0.4)] hover:-translate-y-0.5 active:scale-[0.98]">
              <div className="absolute inset-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
              <span className="relative z-10">Proceed to Checkout</span>
            </button>
            <p className="text-center text-xs text-white/40 mt-4">Secure encrypted checkout.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
