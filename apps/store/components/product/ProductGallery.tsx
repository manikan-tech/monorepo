import Image from "next/image";
import { useState } from "react";

export default function ProductGallery({ imageUrl, productName }: { imageUrl: string; productName: string }) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="relative aspect-[3/4] w-full rounded-3xl overflow-hidden bg-[#F3F7F7] shadow-card">
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={productName}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className={`object-cover animate-slow-zoom transition-opacity duration-700 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          priority
          onLoad={() => setImageLoaded(true)}
        />
      )}

      {/* Floating Badge */}
      <div className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full shadow-soft animate-float z-10">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-500 animate-pulse">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        <span className="text-xs font-semibold text-forest-900">Try-On Ready</span>
      </div>
    </div>
  );
}
