"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Overview",
    exact: true,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    ),
  },
  {
    href: "/admin/retailers",
    label: "Retailers",
    exact: false,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    ),
  },
  {
    href: "/admin/inquiries",
    label: "B2B Inquiries",
    exact: false,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    ),
  },
] as const;

export default function AdminSidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col flex-1">
      <nav className="flex-1 mt-6 px-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-forest-800 text-white shadow-soft"
                  : "text-forest-50/80 hover:bg-forest-800/70 hover:text-white"
              }`}
            >
              <svg
                className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-gold-400" : "opacity-60"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {item.icon}
              </svg>
              <span className="font-medium text-sm">{item.label}</span>
              {isActive && (
                <span
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: "linear-gradient(135deg, #C8966A, #F0C080)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-forest-800">
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
