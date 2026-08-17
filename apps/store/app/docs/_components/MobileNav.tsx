"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import type { NavCategory } from "../../../content/docs/nav";

export default function MobileNav({ categories }: { categories: NavCategory[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Close automatically on navigation -- without this, tapping a sidebar
  // link on mobile would navigate underneath a drawer that stays open.
  useEffect(() => setOpen(false), [pathname]);

  const drawer = open && (
    // Portalled to document.body deliberately: TopBar (this component's
    // natural parent in the tree) has `backdrop-blur-md`, and
    // backdrop-filter on an ancestor makes IT the containing block for any
    // `position: fixed` descendant instead of the viewport -- confirmed by
    // measuring it directly (the drawer rendered at 63px tall, exactly
    // TopBar's own h-16, instead of the screen height). Portalling out from
    // under that ancestor is the fix, not a height hack.
    <div className="fixed inset-0 z-40 flex">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={() => setOpen(false)}
        className="flex-1 bg-forest-950/40 backdrop-blur-sm"
      />
      <div className="h-full w-72 max-w-[85vw] overflow-y-auto border-l border-manikan-border bg-manikan-card p-4 shadow-lift dark:border-forest-800 dark:bg-forest-950">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-lg text-forest-900 dark:text-cream-50">Docs</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-manikan-muted hover:bg-manikan-bg dark:text-cream-300 dark:hover:bg-forest-900"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" suppressHydrationWarning>
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <Sidebar categories={categories} />
      </div>
    </div>
  );

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-manikan-border text-manikan-text-secondary dark:border-forest-800 dark:text-cream-200"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" suppressHydrationWarning>
          <path d="M3.5 6h17M3.5 12h17M3.5 18h17" strokeLinecap="round" />
        </svg>
      </button>
      {mounted && drawer && createPortal(drawer, document.body)}
    </div>
  );
}
