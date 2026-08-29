"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "../app/lib/supabase/client";
import { useCart } from "./CartContext";
import { useWishlist } from "./WishlistContext";

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
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
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

const shopperNavLinks = [
  { name: "Collection", href: "/store" },
  { name: "Virtual Try-On", href: "/visualize" },
  { name: "Size Assistant", href: "#" },
  { name: "For Business", href: "/business" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount } = useCart();
  const { items: wishlistItems } = useWishlist();
  const wishlistCount = wishlistItems?.length || 0;

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<any>(null);
  const [isRetailer, setIsRetailer] = useState(false);
  const [showTryOnLoginModal, setShowTryOnLoginModal] = useState(false);
  const [pendingTryOnHref, setPendingTryOnHref] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  const checkRole = async (email: string | undefined) => {
    if (!email) {
      setIsRetailer(false);
      return;
    }
    try {
      const res = await fetch(`/api/retailer/me`);
      const data = await res.json();
      setIsRetailer(data.isRetailer === true);
    } catch {
      setIsRetailer(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      setUser(u);
      checkRole(u?.email);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      checkRole(u?.email);
    });

    return () => subscription.unsubscribe();
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
    await fetch("/api/auth/logout", { method: "POST" });
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleNavTryOnClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (user) return;

    e.preventDefault();
    setPendingTryOnHref(href);
    setShowTryOnLoginModal(true);
  };

  const handleContinueToLogin = () => {
    const href = pendingTryOnHref || "/visualize";
    setShowTryOnLoginModal(false);
    setPendingTryOnHref(null);
    router.push(`/login?next=${encodeURIComponent(href)}`);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-manikan-border/50 shadow-[0_4px_30px_rgba(18,52,59,0.03)] backdrop-blur-xl transition-all duration-300">
      <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] w-full bg-transparent overflow-hidden">
        <div className="w-full h-full bg-[linear-gradient(90deg,transparent,rgba(200,150,102,0.8),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 h-24 flex items-center justify-between">
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
          {!isRetailer &&
            shopperNavLinks.map((link) => {
              const isActive = pathname === link.href;
              const isTryOn = link.href === "/visualize";
              const isSizeAssistant = link.name === "Size Assistant";
              return (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => {
                    if (isSizeAssistant) {
                      e.preventDefault();
                      if (typeof window !== "undefined" && (window as any).ManikanWidget) {
                        (window as any).ManikanWidget.open();
                      }
                    } else if (isTryOn) {
                      handleNavTryOnClick(e, link.href);
                    }
                  }}
                  className={`relative font-sans text-[15px] font-medium tracking-wide transition-all duration-300 group py-2 cursor-pointer ${
                    isActive ? "text-forest-900" : "text-forest-700/80 hover:text-gold-600"
                  }`}
                >
                  {link.name}
                  <span
                    className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] bg-gold-500 transition-all duration-300 ease-out ${
                      isActive ? "w-full" : "w-0 group-hover:w-full"
                    }`}
                  />
                </a>
              );
            })}
        </div>

        {showTryOnLoginModal &&
          isClient &&
          typeof window !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
              <div
                className="absolute inset-0 bg-[#5C3E21]/20 backdrop-blur-[2px]"
                onClick={() => {
                  setShowTryOnLoginModal(false);
                  setPendingTryOnHref(null);
                }}
              />
              <div className="relative w-full max-w-md rounded-[28px] border border-[#8C6239]/20 bg-[#FDFBF7]/98 p-6 shadow-[0_30px_100px_rgba(92,62,33,0.25)] backdrop-blur-xl text-[#5C3E21] animate-fade-in-up">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#8C6239]/10 text-3xl">
                    🧵
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[22px] font-semibold leading-tight text-[#5C3E21]">Backstage pass needed</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#5C3E21]/80">
                      Clothes need a backstage pass — please sign in first 😄
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleContinueToLogin}
                    className="inline-flex items-center justify-center rounded-2xl bg-[#8C6239] px-5 py-3 text-sm font-semibold text-[#FDFBF7] transition-all hover:bg-[#5C3E21] hover:-translate-y-0.5"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTryOnLoginModal(false);
                      setPendingTryOnHref(null);
                    }}
                    className="inline-flex items-center justify-center rounded-2xl border border-[#8C6239]/20 bg-white/70 px-5 py-3 text-sm font-semibold text-[#5C3E21] transition-all hover:bg-white hover:-translate-y-0.5"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Icons & Sign In */}
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
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-forest-900 text-white rounded-r-xl hover:bg-forest-800 transition-colors"
                >
                  <SearchIcon />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform"
              >
                <SearchIcon />
              </button>
            )}
            {!isRetailer && (
              <>
                <Link
                  href="/wishlist"
                  className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform relative cursor-pointer block"
                >
                  <WishlistIcon />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-gold-500 text-forest-950 text-[10px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-sm animate-fade-in-up">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/cart"
                  className="text-forest-900/60 hover:text-gold-600 transition-colors duration-300 hover:-translate-y-0.5 transform relative cursor-pointer block"
                >
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
              <div className="relative group">
                <button className="flex items-center justify-center w-11 h-11 rounded-full bg-forest-50 border border-forest-200 text-forest-700 hover:bg-forest-100 hover:text-gold-600 transition-colors focus:outline-none">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </button>
                
                {/* Dropdown Menu */}
                <div className="absolute right-0 top-full pt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-50">
                  <div className="bg-white/95 backdrop-blur-xl border border-forest-900/10 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-2 flex flex-col gap-1">
                    <div className="px-3 py-2 mb-1">
                      <p className="text-xs font-semibold text-forest-900/40 uppercase tracking-wider">My Account</p>
                    </div>
                    {isRetailer ? (
                      <Link href="/dashboard" className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-forest-800 rounded-xl hover:bg-forest-50 hover:text-gold-600 transition-colors">
                        <DashboardIcon />
                        Dashboard
                      </Link>
                    ) : (
                      <Link href="/account" className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-forest-800 rounded-xl hover:bg-forest-50 hover:text-gold-600 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        Profile
                      </Link>
                    )}
                    <div className="h-px w-full bg-forest-900/5 my-1" />
                    <button onClick={handleSignOut} className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 transition-colors text-left w-full">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" x2="9" y1="12" y2="12" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
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
