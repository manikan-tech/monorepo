"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../app/lib/supabase/client";
import { useCart } from "./CartContext";
import { useWishlist } from "./WishlistContext";

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

const DashboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
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
  const router = useRouter();
  const { cartCount, refreshCart } = useCart();
  const { items: wishlistItems, refresh: refreshWishlist } = useWishlist();
  const wishlistCount = wishlistItems?.length || 0;

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<any>(null);
  const [isRetailer, setIsRetailer] = useState(false);

  // ── Check if the logged-in user is a Retailer ────────────────────
  const checkRole = async (email: string | undefined) => {
    if (!email) { setIsRetailer(false); return; }
    try {
      const res = await fetch(`/api/retailer/me`);
      setIsRetailer(res.ok);
    } catch {
      setIsRetailer(false);
    }
  };

  useEffect(() => {
    const supabase = createClient();


    // Initial fetch
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      setUser(u);
      checkRole(u?.email);
    });

    // Subscribe to auth state changes — refreshes cart/wishlist on login/logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      checkRole(u?.email);
      // Refresh data stores whenever auth state changes
      void refreshCart();
      void refreshWishlist();
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/store?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery("");
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

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
                className={`relative font-sans text-[15px] font-medium tracking-wide transition-all duration-300 group py-2 ${isActive ? "text-forest-900" : "text-forest-700/80 hover:text-gold-600"
                  }`}
              >
                {link.name}
                <span
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] bg-gold-500 transition-all duration-300 ease-out ${isActive ? "w-full" : "w-0 group-hover:w-full"
                    }`}
                />
              </Link>
            );
          })}
        </div>

        {/* ── Icons & Sign In ── */}
        <div className="flex items-center gap-6">

          <div className="hidden md:flex items-center gap-5 pr-4 border-r border-manikan-border/60">
            {isSearchOpen ? (
              <form onSubmit={handleSearch} className="flex items-center">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={() => !searchQuery && setIsSearchOpen(false)}
                  className="w-48 px-3 py-1.5 text-sm bg-forest-50 border border-forest-900/10 rounded-l-xl focus:outline-none focus:border-gold-400 text-forest-900"
                />
                <button type="submit" className="px-3 py-1.5 bg-forest-900 text-white rounded-r-xl hover:bg-forest-800 transition-colors">
                  <SearchIcon />
                </button>
              </form>
            ) : (
              <button onClick={() => setIsSearchOpen(true)} className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform">
                <SearchIcon />
              </button>
            )}
            {!isRetailer && (
              <>
                <Link href="/wishlist" className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform relative cursor-pointer block">
                  <WishlistIcon />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-gold-500 text-forest-950 text-[10px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-sm animate-fade-in-up">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
                <Link href="/cart" className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform relative cursor-pointer block">
                  <CartIcon />
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-gold-500 text-forest-950 text-[10px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-sm animate-fade-in-up">
                      {cartCount}
                    </span>
                  )}
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Dashboard button — only shown to Retailers */}
                {isRetailer ? (
                  <Link
                    href="/dashboard"
                    className="hidden md:flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gold-700 bg-gold-50 border border-gold-200 rounded-xl hover:bg-gold-100 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    <DashboardIcon />
                    Dashboard
                  </Link>
                ) : (
                  <Link
                    href="/account"
                    className="hidden md:flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-forest-700 bg-forest-50 border border-forest-200 rounded-xl hover:bg-forest-100 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    Profile
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="relative overflow-hidden flex items-center justify-center px-6 py-2.5 text-sm font-medium text-forest-900 bg-white border border-forest-200 rounded-xl hover:bg-forest-50 shadow-soft transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="relative overflow-hidden flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-forest-600 rounded-xl hover:bg-forest-700 btn-glow shadow-soft hover:shadow-card transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <div className="absolute inset-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
                <span className="relative z-10">Sign In</span>
              </Link>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}
