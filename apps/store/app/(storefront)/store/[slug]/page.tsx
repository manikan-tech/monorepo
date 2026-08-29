"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProductGallery from "../../../../components/product/ProductGallery";
import SizeSelector from "../../../../components/product/SizeSelector";
import { useCart } from "../../../../components/CartContext";
import { useWishlist } from "../../../../components/WishlistContext";
import Modal from "../../../../components/Modal";
import Manikan3DTryOn from "../../../../components/product/Manikan3DTryOn";
import ManikanRecommendWidget from "../../../../components/product/ManikanRecommendWidget";
import FitToolsOnboarding from "../../../../components/product/FitToolsOnboarding";
import ColorSwatches from "../../../../components/product/ColorSwatches";
import { isHostedServiceAvailable } from "../../../lib/hosted-service-availability";

type Review = {
  id: string;
  rating: number;
  title?: string;
  comment?: string;
  isVerified: boolean;
  createdAt: string;
  customer?: { firstName?: string; lastName?: string; avatarUrl?: string };
};

const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((s) => (
      <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill={s <= rating ? "#C89666" : "none"} stroke="#C89666" strokeWidth="1.5">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
    ))}
  </div>
);

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [product, setProduct] = useState<any>(null);
  const [colorSiblings, setColorSiblings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const { addToCart } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const [isAdding, setIsAdding] = useState(false);
  const [cartError, setCartError] = useState("");
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isTryOnRouting, setIsTryOnRouting] = useState(false);
  const [manualGuideTrigger, setManualGuideTrigger] = useState(0);

  const recommendationAvailable = isHostedServiceAvailable(product?.hostedServiceAvailability, "RECOMMENDATION");
  const vtonAvailable = isHostedServiceAvailable(product?.hostedServiceAvailability, "VTON_2D");

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", comment: "" });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products/${slug}`);
        if (!res.ok) throw new Error("Product not found");
        const data = await res.json();
        setProduct(data.product);
        setColorSiblings(data.colorSiblings ?? []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetchProduct();
  }, [slug]);

  // ── Manikan widget integration ──────────────────────────────
  // Sets the current product context so the widget knows which product
  // page the user is currently viewing.
  useEffect(() => {
    if (!product) return;

    (window as any).currentProductContext = {
      id: product.id,
      name: product.name,
      recommendationKey: product.hostedServiceKeys?.RECOMMENDATION ?? null,
    };

    return () => {
      (window as any).currentProductContext = null;
    };
  }, [product]);
  // ── end Manikan widget integration ──────────────────────────────

  // Load reviews when product is set
  useEffect(() => {
    if (!slug) return;
    setReviewsLoading(true);
    fetch(`/api/products/${slug}/reviews`)
      .then((r) => r.json())
      .then((data) => setReviews(data.reviews ?? []))
      .catch(() => { })
      .finally(() => setReviewsLoading(false));
  }, [slug]);

  // Sync selected variant when size changes
  useEffect(() => {
    if (product && selectedSize) {
      const v = product.variants?.find((v: any) => v.sizeLabel === selectedSize);
      setSelectedVariant(v ?? null);
    }
  }, [selectedSize, product]);

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
        <Link href="/store" className="text-gold-600 hover:underline">Return to Catalog</Link>
      </div>
    );
  }

  const wishlisted = isWishlisted(product.id);

  const handleAddToCart = async () => {
    if (!selectedSize || !selectedVariant) {
      setShowSizeModal(true);
      return;
    }
    if (selectedVariant.stock === 0) return;

    setIsAdding(true);
    setCartError("");
    const result = await addToCart({ productId: product.id, variantId: selectedVariant.id, quantity: 1 });
    if (result.error) setCartError(result.error);
    setIsAdding(false);
  };

  const handleSubmitReview = async () => {
    if (!product?.id) return;
    setSubmittingReview(true);
    setReviewMsg("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, ...reviewForm }),
    });

    if (res.status === 401) {
      setSubmittingReview(false);
      setShowAuthModal(true);
      return;
    }

    const data = await res.json();
    if (res.ok) {
      setReviewMsg("✓ Review submitted!");
      setReviewForm({ rating: 5, title: "", comment: "" });
      const r = await fetch(`/api/products/${slug}/reviews`);
      const d = await r.json();
      setReviews(d.reviews ?? []);
    } else {
      setReviewMsg(data.error ?? "Failed to submit review");
    }
    setSubmittingReview(false);
  };

  const displayPrice = selectedVariant?.priceOverride ?? product.priceEgp;

  const handleVirtualTryOn = async () => {
    if (!product?.id) return;

    setIsTryOnRouting(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        router.push(`/visualize?productId=${product.id}`);
        return;
      }
    } catch {
      // Fall back to login redirect below.
    } finally {
      setIsTryOnRouting(false);
    }

    const nextPath = `/visualize?productId=${encodeURIComponent(product.id)}`;
    router.push(`/login?next=${encodeURIComponent(nextPath)}`);
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

            <div className="flex items-baseline gap-3 mt-4 transition-all duration-300">
              {product.discountPct > 0 ? (
                <>
                  <span className="text-3xl font-semibold text-gold-600 animate-pulse-glow">
                    EGP {(displayPrice * (1 - product.discountPct / 100)).toLocaleString()}
                  </span>
                  <span className="text-lg text-forest-700/50 line-through">
                    EGP {displayPrice?.toLocaleString()}
                  </span>
                  <span className="text-sm font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
                    -{product.discountPct}%
                  </span>
                </>
              ) : (
                <span className="text-3xl font-semibold text-gold-600 animate-pulse-glow">
                  EGP {displayPrice?.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-forest-900/5 animate-fade-in-up" style={{ animationDelay: '150ms' }} />

          {/* Color Swatches */}
          <ColorSwatches
            currentColorHex={product.garmentColorHex}
            siblings={colorSiblings}
          />

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
            {cartError && (
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">{cartError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleAddToCart}
                disabled={isAdding || (selectedVariant && selectedVariant.stock === 0)}
                className="flex-1 flex items-center justify-center gap-2 bg-forest-900 text-white rounded-2xl py-4 font-medium shadow-soft hover:bg-forest-800 transition-all duration-300 hover:shadow-card hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed"
              >
                {isAdding ? (
                  <span className="inline-block w-5 h-5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                ) : selectedVariant && selectedVariant.stock === 0 ? (
                  "Out of Stock"
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
              <button
                onClick={() => toggle(product.id)}
                aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                className={`flex items-center justify-center px-5 border-2 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 ${wishlisted ? "border-gold-500 bg-gold-50 text-gold-600" : "border-forest-200 text-forest-700 hover:border-gold-400 hover:text-gold-600"}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  const widget = (window as any).ManikanWidget;
                  if (typeof widget?.openForSizing === "function") {
                    widget.openForSizing();
                  } else if (typeof widget?.open === "function") {
                    widget.open();
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border-2 border-gold-400 text-gold-600 rounded-2xl font-medium text-sm hover:bg-gold-50 hover:text-gold-700 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2" />
                  <path d="M3 8h18v8H3z" />
                  <path d="M7 8v3M11 8v3M15 8v3" />
                </svg>
                Find My Size
              </button>
            </div>

            {/* AI-powered fit tools */}
            <div className="relative rounded-3xl border border-gold-200/70 bg-gradient-to-br from-gold-50 via-cream-50 to-white p-5 shadow-soft overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gold-200/40 blur-3xl" />

              <div className="relative flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-forest-900 text-gold-300">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2Z" />
                    </svg>
                  </span>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest-700/70">
                    AI-Powered Fit Tools
                  </p>
                </div>
                <button
                  onClick={() => setManualGuideTrigger(prev => prev + 1)}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
                  style={{ background: "linear-gradient(135deg, #12343b 0%, #c89666 100%)" }}
                  title="How it works"
                >
                  {/* Animated shimmer */}
                  <span className="pointer-events-none absolute inset-0 animate-btn-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <span className="relative flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-gold-300 shrink-0">
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2Z" />
                    </svg>
                    How it works
                  </span>
                </button>
              </div>

              <div className="relative flex flex-col gap-3">
                {/* Size Assistant Button (Dark Theme) - unchanged: opens the
                    shared window.ManikanWidget loaded once via Navbar.tsx,
                    for a visitor who lands directly on this product page
                    without coming from the general chat first. */}
                <button
                  onClick={() => {
                    if ((window as any).ManikanWidget && typeof (window as any).ManikanWidget.openForSizing === 'function') {
                      (window as any).ManikanWidget.openForSizing();
                    }
                  }}
                  disabled={!recommendationAvailable}
                  className="group relative flex items-center justify-center gap-3 py-3 px-6 rounded-2xl font-medium text-sm border-2 border-forest-900 text-white bg-forest-900 hover:bg-forest-800 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden cursor-pointer shadow-soft disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative text-gold-400">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span className="relative">{recommendationAvailable ? "Size Assistant" : "Size Assistant unavailable"}</span>
                  <span className="relative text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gold-500/20 text-gold-300 border border-gold-500/20">
                    AI
                  </span>
                </button>

                <button
                  id="product-2d-tryon"
                  type="button"
                  onClick={() => void handleVirtualTryOn()}
                  disabled={!vtonAvailable || isTryOnRouting}
                  aria-busy={isTryOnRouting}
                  className="group relative flex items-center justify-center gap-3 py-3 px-6 rounded-2xl font-medium text-sm border-2 border-gold-400 text-gold-700 bg-white/60 hover:bg-gold-50 hover:text-gold-800 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(212,155,99,0.25),transparent_60%)]"
                  />
                  {isTryOnRouting ? (
                    <span className="relative w-4 h-4 border-[2px] border-gold-400/40 border-t-gold-600 rounded-full animate-spin" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  )}
                  <span className="relative">{isTryOnRouting ? "Preparing preview…" : vtonAvailable ? "2D Try-On" : "2D Try-On unavailable"}</span>
                  <span className="relative text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-forest-900/10 text-forest-700 border border-forest-900/10">
                    Photo
                  </span>
                </button>

                {!vtonAvailable && product.hostedServiceAvailability?.VTON_2D?.state === "QUOTA_EXHAUSTED" && (
                  <p className="text-xs text-center text-forest-700/60" role="status">
                    2D try-on is temporarily unavailable because this retailer has reached this period&apos;s limit.
                  </p>
                )}

                <Manikan3DTryOn product={product} />
                <ManikanRecommendWidget
                  productId={product.id}
                  retailerKey={product.hostedServiceKeys?.RECOMMENDATION}
                  availability={product.hostedServiceAvailability}
                />
              </div>
            </div>
            <FitToolsOnboarding productName={product.name} manualTrigger={manualGuideTrigger} />
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
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              EGP 50 Flat Shipping
            </div>
          </div>
        </div>
      </div>

      {/* ── Reviews Section ── */}
      <section className="mt-20 pt-12 border-t border-forest-900/5">
        <h2 className="font-display text-3xl font-semibold text-forest-950 mb-10">Customer Reviews</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Existing Reviews */}
          <div className="flex flex-col gap-6">
            {reviewsLoading ? (
              <span className="inline-block w-6 h-6 border-[2px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
            ) : reviews.length === 0 ? (
              <p className="text-forest-700/60 text-sm">No reviews yet. Be the first to share your thoughts!</p>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl p-6 border border-forest-900/5 shadow-soft">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {r.customer?.avatarUrl ? (
                        <img src={r.customer.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-forest-100 flex items-center justify-center text-forest-900 font-semibold uppercase">
                          {r.customer?.firstName?.[0] || "?"}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-forest-950">
                          {r.customer?.firstName} {r.customer?.lastName}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StarRating rating={r.rating} />
                          {r.isVerified && (
                            <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">✓ Verified</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {r.title && <h4 className="font-semibold text-forest-950 mt-2">{r.title}</h4>}
                  {r.comment && <p className="text-sm text-forest-700/80 mt-1 leading-relaxed">{r.comment}</p>}
                  <p className="text-xs text-forest-700/40 mt-3">{new Date(r.createdAt).toLocaleDateString("en-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
              ))
            )}
          </div>

          {/* Submit a Review */}
          <div className="bg-forest-50 rounded-3xl p-8">
            <h3 className="font-display text-xl font-semibold text-forest-950 mb-6">Write a Review</h3>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-forest-900 mb-2">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setReviewForm((p) => ({ ...p, rating: s }))}
                      className="transition-transform hover:scale-110"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill={s <= reviewForm.rating ? "#C89666" : "none"} stroke="#C89666" strokeWidth="1.5">
                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                placeholder="Review title (optional)"
                value={reviewForm.title}
                onChange={(e) => setReviewForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-white text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors"
              />
              <textarea
                placeholder="Share your experience..."
                rows={4}
                value={reviewForm.comment}
                onChange={(e) => setReviewForm((p) => ({ ...p, comment: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-white text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors resize-none"
              />
              {reviewMsg && (
                <p className={`text-sm ${reviewMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{reviewMsg}</p>
              )}
              <button
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="flex items-center justify-center gap-2 w-full bg-forest-900 text-white rounded-xl py-3 font-medium text-sm hover:bg-forest-800 transition-all duration-300 disabled:opacity-70"
              >
                {submittingReview ? <span className="inline-block w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" /> : "Submit Review"}
              </button>
              <p className="text-xs text-forest-700/50 text-center">Reviews require a verified purchase (DELIVERED order).</p>
            </div>
          </div>
        </div>
      </section>

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

      <Modal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Sign In Required"
      >
        <div className="flex flex-col gap-4">
          <p className="text-forest-700">
            Please sign in or create an account to write a review.
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
    </div>
  );
}
