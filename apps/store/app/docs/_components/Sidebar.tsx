"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavCategory } from "../../../content/docs/nav";

export default function Sidebar({ categories }: { categories: NavCategory[] }) {
  const pathname = usePathname();
  const activeSlug = pathname?.replace(/^\/docs\//, "") ?? "";

  // Every category containing the active doc starts expanded; the rest
  // start expanded too by default since there's only ever a handful of
  // categories -- collapsing is for the reader's choice, not a default
  // meant to hide most of the tree.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <nav aria-label="Docs navigation" className="flex flex-col gap-1">
      {categories.map((category) => {
        const isCollapsed = collapsed.has(category.title);
        const hasActive = category.docs.some((d) => d.slug === activeSlug);
        return (
          <div key={category.title}>
            <button
              type="button"
              onClick={() => toggle(category.title)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-manikan-muted transition-colors hover:text-manikan-text dark:text-cream-300 dark:hover:text-cream-50"
            >
              {category.title}
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
                className={`transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`}
                aria-hidden="true"
                suppressHydrationWarning
              >
                <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {!isCollapsed && (
              <ul className="mt-0.5 flex flex-col gap-0.5 border-l border-manikan-border pl-3 dark:border-forest-800">
                {category.docs.length === 0 && (
                  <li className="px-2 py-1 text-sm italic text-manikan-muted dark:text-cream-300">Nothing published yet</li>
                )}
                {category.docs.map((doc) => {
                  const active = doc.slug === activeSlug;
                  return (
                    <li key={doc.slug}>
                      <Link
                        href={`/docs/${doc.slug}`}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-gold-50 font-medium text-forest-900 dark:bg-forest-800 dark:text-gold-300"
                            : "text-manikan-text-secondary hover:bg-manikan-bg hover:text-manikan-text dark:text-cream-200 dark:hover:bg-forest-900 dark:hover:text-cream-50"
                        }`}
                      >
                        {doc.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
