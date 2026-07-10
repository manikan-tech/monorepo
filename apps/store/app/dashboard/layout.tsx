import React from "react";
import Link from "next/link";
import { getAuthFromCookies } from "../lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthFromCookies();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-manikan-bg text-manikan-text">
      {/* Sidebar */}
      <aside className="w-64 bg-forest-950 text-white flex flex-col shadow-lift">
        <div className="p-6">
          <h2 className="font-display text-2xl tracking-wide text-gold-300">
            Manikan<span className="text-white">.io</span>
          </h2>
          <p className="text-forest-200 text-sm mt-1 opacity-80">Retailer Dashboard</p>
        </div>

        <nav className="flex-1 mt-6 px-4 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-forest-800 transition-colors duration-200 text-forest-50 hover:text-white"
          >
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span className="font-medium">Overview</span>
          </Link>
          
          <Link
            href="/dashboard/products"
            className="flex items-center space-x-3 px-4 py-3 rounded-xl bg-forest-800 text-white shadow-soft"
          >
            <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="font-medium">Products</span>
          </Link>

          <Link
            href="/dashboard/analytics"
            className="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-forest-800 transition-colors duration-200 text-forest-50 hover:text-white"
          >
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-medium">Analytics</span>
          </Link>
        </nav>

        <div className="p-6 border-t border-forest-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-forest-700 flex items-center justify-center border border-forest-600">
              <span className="text-sm font-semibold">{user.name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-forest-300 truncate w-32">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto bg-cream-50/50">
        <header className="h-20 flex items-center justify-between px-10 border-b border-manikan-border bg-white/60 backdrop-blur-md sticky top-0 z-10">
          <h1 className="text-xl font-display font-medium text-forest-900">Dashboard</h1>
          <div className="flex items-center space-x-4">
             <button className="text-manikan-text-secondary hover:text-manikan-teal transition-colors">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
               </svg>
             </button>
          </div>
        </header>

        <div className="p-10 flex-1 animate-fade-up">
          {children}
        </div>
      </main>
    </div>
  );
}
