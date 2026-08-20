import React from "react";
import { getAuthFromCookies } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { redirect } from "next/navigation";
import SidebarNav from "./SidebarNav";

// Retailer pages depend on the authenticated request and live tenant data.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthFromCookies();

  if (!user) {
    redirect("/login");
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { isActivated: true },
  });

  return (
    <div className="flex min-h-screen bg-manikan-bg text-manikan-text">
      {/* Sidebar */}
      <aside className="w-64 bg-forest-950 text-white flex flex-col shadow-lift">
        <div className="px-6 py-7 border-b border-forest-800">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C8966A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a2 2 0 0 1 2 2c0 1-.8 1.7-1.7 2L20 14H4l7.7-7C10.8 6.7 10 6 10 5a2 2 0 0 1 2-2Z"/>
                <path d="M4 14c0 3 1.7 4 8 4s8-1 8-4"/>
              </svg>
              <span className="font-display text-[10px] font-medium tracking-[0.3em] text-gold-400 uppercase">
                Retailer
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight" style={{ background: "linear-gradient(135deg, #C8966A 0%, #F0C080 50%, #C8966A 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Dashboard
            </h2>
            <div className="h-[2px] w-12 rounded-full mt-1" style={{ background: "linear-gradient(90deg, #C8966A, transparent)" }} />
          </div>
        </div>

        <SidebarNav isActivated={retailer?.isActivated ?? false} />

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
        <div className="p-10 flex-1 animate-fade-up">
          {children}
        </div>
      </main>
    </div>
  );
}
