import React from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../lib/admin-auth";
import AdminSidebarNav from "./AdminSidebarNav";

export const metadata = {
  title: "Admin | Manikan Platform",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-manikan-bg text-manikan-text">
      <aside className="w-64 bg-forest-950 text-white flex flex-col shadow-lift flex-shrink-0">
        <div className="px-6 py-7 border-b border-forest-800">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C8966A"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a2 2 0 0 1 2 2c0 1-.8 1.7-1.7 2L20 14H4l7.7-7C10.8 6.7 10 6 10 5a2 2 0 0 1 2-2Z" />
                <path d="M4 14c0 3 1.7 4 8 4s8-1 8-4" />
              </svg>
              <span className="font-display text-[10px] font-medium tracking-[0.3em] text-gold-400 uppercase">
                Platform
              </span>
            </div>
            <h2
              className="font-display text-2xl font-bold tracking-tight"
              style={{
                background: "linear-gradient(135deg, #C8966A 0%, #F0C080 50%, #C8966A 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Admin
            </h2>
            <div
              className="h-[2px] w-12 rounded-full mt-1"
              style={{ background: "linear-gradient(90deg, #C8966A, transparent)" }}
            />
          </div>
        </div>
        <AdminSidebarNav />
        <div className="px-6 pb-6">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "rgba(200,150,102,0.08)", border: "1px solid rgba(200,150,102,0.15)" }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #C8966A, #F0C080)" }}
            />
            <span className="text-xs font-medium text-gold-400/80 truncate">
              Manikan Admin
            </span>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-y-auto bg-cream-50/50">
        <div className="p-10 flex-1 animate-fade-up">
          {children}
        </div>
      </main>
    </div>
  );
}
