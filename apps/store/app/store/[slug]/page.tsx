"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProductGallery from "../../../components/product/ProductGallery";
import SizeSelector from "../../../components/product/SizeSelector";
import { useCart } from "../../../components/CartContext";
import Modal from "../../../components/Modal";

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const { addToCart } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products/${slug}`);
        if (!res.ok) throw new Error("Product not found");
        const data = await res.json();
        setProduct(data.product);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetchProduct();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <span className="inline-block w-8 h-8 border-[3px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-display font-semibold text-forest-950">Product Not Found</h2>
        <Link href="/store" className="text-gold-600 hover:underline">
          Return to Catalog
        </Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    if (!selectedSize) {
      setShowSizeModal(true);
      return;
    }
    setIsAdding(true);
    // Mimic network request
    setTimeout(() => {
      addToCart({ ...product, selectedSize }, 1);
      setIsAdding(false);
    }, 400);
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12 md:py-20">
      
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-medium text-forest-700/60 mb-8 animate-fade-in-up">
        <Link href="/store" className="hover:text-gold-500 transition-colors">Catalog</Link>
        <span className="text-forest-300">/</span>
        <span className="capitalize">{product.category}</span>
        <span className="text-forest-300">/</span>
        <span className="text-forest-950 truncate max-w-[200px]">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
        
        {/* Left Column: Image Gallery */}
        <div className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <ProductGallery imageUrl={product.imageUrl} productName={product.name} />
        </div>

        {/* Right Column: Details */}
        <div className="flex flex-col gap-8 py-4">
          
          <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <span className="text-[12px] font-bold uppercase tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-gold-400 via-gold-200 to-gold-600 bg-[length:200%_auto] animate-shimmer-slow">{product.brand}</span>
            <h1 className="font-display text-3xl md:text-4xl font-semibold text-forest-950 mt-2 leading-tight">{product.name}</h1>
            
            <div className="flex items-baseline gap-3 mt-4">
              <span className="text-3xl font-semibold text-gold-600 animate-pulse-glow">EGP {product.priceEgp?.toLocaleString()}</span>
              {product.discountPct > 0 && (
                <span className="text-sm text-red-500 font-medium bg-red-50 px-2.5 py-1 rounded-full">
                  -{product.discountPct}%
                </span>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-forest-900/5 animate-fade-in-up" style={{ animationDelay: '150ms' }} />

          {/* Size Selection */}
          <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <SizeSelector 
              variants={product.variants} 
              selectedSize={selectedSize} 
              onSelectSize={setSelectedSize} 
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
            <button 
              onClick={handleAddToCart}
              disabled={isAdding}
              className="flex items-center justify-center gap-2 w-full bg-forest-900 text-white rounded-2xl py-4 font-medium shadow-soft hover:bg-forest-800 transition-all duration-300 hover:shadow-card hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-80"
            >
              {isAdding ? (
                <span className="inline-block w-5 h-5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                    <path d="M3 6h18" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                  Add to Cart
                </>
              )}
            </button>
            <button className="flex items-center justify-center gap-3 py-4 px-6 border-2 border-gold-400 text-gold-600 rounded-2xl font-medium text-sm hover:bg-gold-50 hover:text-gold-700 transition-all duration-300 hover:-translate-y-0.5 animate-pulse-glow hover:animate-none">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              Virtual Try-On
            </button>
          </div>

          {/* Shipping Info */}
          <div className="flex items-center gap-6 mt-4 pt-6 border-t border-forest-900/5 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center gap-2 text-sm text-forest-700/80 font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-500">
                <rect x="3" y="8" width="18" height="12" rx="2" />
                <path d="M7 8v-2a5 5 0 0 1 10 0v2" />
              </svg>
              Secure Checkout
            </div>
            <div className="flex items-center gap-2 text-sm text-forest-700/80 font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-500">
                <rect width="16" height="16" x="4" y="4" rx="2" />
                <rect width="6" height="6" x="9" y="9" rx="1" />
                <path d="M9 15v2" />
                <path d="M9 7v2" />
                <path d="M15 9h-2" />
                <path d="M15 15h-2" />
              </svg>
              Free Returns
            </div>
          </div>

        </div>
      </div>

      <Modal 
        isOpen={showSizeModal} 
        onClose={() => setShowSizeModal(false)} 
        title="Select a Size"
      >
        <p className="text-forest-700">
          Please select a size before adding <span className="font-semibold text-forest-900">{product.name}</span> to your cart. 
          If you're unsure, try our Virtual Try-On feature for an AI-powered size recommendation!
        </p>
      </Modal>
    </div>
  );
}
