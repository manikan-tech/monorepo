import React from "react";
import Link from "next/link";
import { getAuthFromCookies } from "../lib/auth";
import { redirect } from "next/navigation";
import SidebarNav from "./SidebarNav";

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

        <SidebarNav />

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
