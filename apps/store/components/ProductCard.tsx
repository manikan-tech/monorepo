"use client";

import Image from "next/image";
import Link from "next/link";
import { useWishlist } from "./WishlistContext";

export default function ProductCard({ product }: { product: any }) {
  const { isWishlisted, toggle } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  return (
    <Link href={`/store/${product.slug || product.id}`} className="group flex flex-col gap-4 cursor-pointer">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[#F3F7F7] shadow-soft transition-all duration-500 group-hover:shadow-lift group-hover:-translate-y-2">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.08]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-forest-900/30 font-display">No Image</div>
        )}

        {/* Hover Dark Overlay */}
        <div className="absolute inset-0 bg-forest-950/0 transition-colors duration-300 group-hover:bg-forest-950/10 pointer-events-none" />

        {/* Wishlist Button */}
        <button
          className={`absolute top-4 right-4 p-2.5 rounded-full bg-white/90 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-110 shadow-sm z-10 ${wishlisted ? "text-gold-500" : "text-forest-900 hover:text-gold-500"}`}
          onClick={(e) => {
            e.preventDefault();
            toggle(product.id);
          }}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </button>

        {/* Quick Add / Try-On Badge */}
        <div className="absolute bottom-4 left-4 right-4 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 z-10 flex gap-2">
          <div className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-forest-900/95 backdrop-blur-md text-white text-[13px] font-medium rounded-xl hover:bg-forest-950 shadow-soft transition-colors">
            <span>Virtual Try-On</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-1">
        <span className="text-[11px] font-bold text-forest-700/50 uppercase tracking-widest">{product.brand}</span>
        <h3 className="font-sans text-[15px] font-medium text-forest-950 truncate transition-colors group-hover:text-gold-600">{product.name}</h3>
        <span className="font-sans text-[15px] text-forest-900 font-semibold mt-1">EGP {product.priceEgp?.toLocaleString()}</span>
      </div>
    </Link>
  );
}
