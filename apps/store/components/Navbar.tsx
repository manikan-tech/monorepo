"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { useCart } from "./CartContext";

// ── Icons ─────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const WishlistIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const CartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const navLinks = [
  { name: "Collection", href: "/store" },
  { name: "Virtual Try-On", href: "/visualize" },
  { name: "My Wardrobe", href: "/wardrobe" },
  { name: "For Business", href: "/business" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { cartCount } = useCart();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-manikan-border/50 shadow-[0_4px_30px_rgba(18,52,59,0.03)] backdrop-blur-xl transition-all duration-300">
      {/* ── Edge Light ── */}
      <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] w-full bg-transparent overflow-hidden">
        <div className="w-full h-full bg-[linear-gradient(90deg,transparent,rgba(200,150,102,0.8),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 h-24 flex items-center justify-between">
        
        {/* ── Logo ── */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative w-56 h-16 transition-transform duration-500 group-hover:scale-105 group-hover:-translate-y-0.5">
            <Image 
              src="/logo.png" 
              alt="Manikan Logo" 
              fill 
              sizes="(max-width: 768px) 150px, 200px"
              className="object-contain object-left animate-logo-shine"
              priority
            />
          </div>
        </Link>

        <div className="hidden lg:flex items-center gap-10">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.name} 
                href={link.href}
                className={`relative font-sans text-[15px] font-medium tracking-wide transition-all duration-300 group py-2 ${
                  isActive ? "text-forest-900" : "text-forest-700/80 hover:text-gold-600"
                }`}
              >
                {link.name}
                <span 
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] bg-gold-500 transition-all duration-300 ease-out ${
                    isActive ? "w-full" : "w-0 group-hover:w-full"
                  }`} 
                />
              </Link>
            );
          })}
        </div>

        {/* ── Icons & Sign In ── */}
        <div className="flex items-center gap-6">
          
          <div className="hidden md:flex items-center gap-5 pr-4 border-r border-manikan-border/60">
            <button className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform">
              <SearchIcon />
            </button>
            <button className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform">
              <WishlistIcon />
            </button>
            <Link href="/cart" className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform relative cursor-pointer block">
              <CartIcon />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-gold-500 text-forest-950 text-[10px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-sm animate-fade-in-up">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link 
              href="/login" 
              className="relative overflow-hidden flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-forest-600 rounded-xl hover:bg-forest-700 btn-glow shadow-soft hover:shadow-card transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <div className="absolute inset-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
              <span className="relative z-10">Sign In</span>
            </Link>
          </div>

        </div>
      </div>
    </nav>
  );
}
