"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { createClient } from "../lib/supabase/client";

export default function SidebarNav({ isActivated = true }: { isActivated?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col flex-1">
      <nav className="flex-1 mt-6 px-4 space-y-2">
        <Link
        href="/dashboard"
        className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
          pathname === "/dashboard"
            ? "bg-forest-800 text-white shadow-soft"
            : "text-forest-50 hover:bg-forest-800 hover:text-white"
        }`}
      >
        <svg className={`w-5 h-5 ${pathname === "/dashboard" ? "text-gold-400" : "opacity-70"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <span className="font-medium">Overview</span>
      </Link>

      {isActivated && (
        <>
          <Link
            href="/dashboard/products"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
              pathname.startsWith("/dashboard/products")
                ? "bg-forest-800 text-white shadow-soft"
                : "text-forest-50 hover:bg-forest-800 hover:text-white"
            }`}
          >
            <svg className={`w-5 h-5 ${pathname.startsWith("/dashboard/products") ? "text-gold-400" : "opacity-70"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="font-medium">Products</span>
          </Link>

          <Link
            href="/dashboard/orders"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
              pathname.startsWith("/dashboard/orders")
                ? "bg-forest-800 text-white shadow-soft"
                : "text-forest-50 hover:bg-forest-800 hover:text-white"
            }`}
          >
            <svg className={`w-5 h-5 ${pathname.startsWith("/dashboard/orders") ? "text-gold-400" : "opacity-70"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span className="font-medium">Orders</span>
          </Link>

          <Link
            href="/dashboard/analytics"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
              pathname.startsWith("/dashboard/analytics")
                ? "bg-forest-800 text-white shadow-soft"
                : "text-forest-50 hover:bg-forest-800 hover:text-white"
            }`}
          >
            <svg className={`w-5 h-5 ${pathname.startsWith("/dashboard/analytics") ? "text-gold-400" : "opacity-70"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-medium">Analytics</span>
          </Link>

          <Link
            href="/dashboard/widget"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
              pathname.startsWith("/dashboard/widget")
                ? "bg-forest-800 text-white shadow-soft"
                : "text-forest-50 hover:bg-forest-800 hover:text-white"
            }`}
          >
            <svg className={`w-5 h-5 ${pathname.startsWith("/dashboard/widget") ? "text-gold-400" : "opacity-70"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span className="font-medium">Widget Settings</span>
          </Link>

          <Link
            href="/dashboard/vton-cache"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
              pathname.startsWith("/dashboard/vton-cache")
                ? "bg-forest-800 text-white shadow-soft"
                : "text-forest-50 hover:bg-forest-800 hover:text-white"
            }`}
          >
            <svg className={`w-5 h-5 ${pathname.startsWith("/dashboard/vton-cache") ? "text-gold-400" : "opacity-70"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <span className="font-medium">VTON Cache</span>
          </Link>

          <Link
            href="/dashboard/settings"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
              pathname.startsWith("/dashboard/settings")
                ? "bg-forest-800 text-white shadow-soft"
                : "text-forest-50 hover:bg-forest-800 hover:text-white"
            }`}
          >
            <svg className={`w-5 h-5 ${pathname.startsWith("/dashboard/settings") ? "text-gold-400" : "opacity-70"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium">Settings</span>
          </Link>
        </>
      )}
    </nav>
    <div className="flex flex-col mt-auto pb-4 px-4 space-y-1 pt-6 border-t border-forest-800">
      <Link
        href="/"
        className="flex items-center space-x-3 px-4 py-3 rounded-xl text-forest-50/80 hover:bg-forest-800/70 hover:text-white transition-all duration-200"
      >
        <svg className="w-5 h-5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span className="font-medium text-sm">Storefront</span>
      </Link>
      <button
        onClick={handleLogout}
        disabled={isPending}
        className="flex items-center space-x-3 w-full px-4 py-3 rounded-xl text-red-400/80 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200 disabled:opacity-50"
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        <span className="font-medium text-sm">{isPending ? "Signing out..." : "Sign Out"}</span>
      </button>
    </div>
    </div>
  );
}