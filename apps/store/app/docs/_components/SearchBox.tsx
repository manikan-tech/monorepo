"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchEntry } from "../_lib/nav-utils";

type Match = { entry: SearchEntry; matchedHeading?: string };

/** Plain case-insensitive substring match over title, description, and
 *  headings -- deliberately not a fuzzy-search library. The brief calls
 *  for "doesn't need full-text search infrastructure", and at doc-site
 *  scale (a handful to a few dozen pages) a real index buys nothing a
 *  human notices. */
function search(entries: SearchEntry[], query: string): Match[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: Match[] = [];
  for (const entry of entries) {
    if (entry.title.toLowerCase().includes(q) || entry.description?.toLowerCase().includes(q)) {
      results.push({ entry });
      continue;
    }
    const heading = entry.headings.find((h) => h.toLowerCase().includes(q));
    if (heading) results.push({ entry, matchedHeading: heading });
  }
  return results;
}

export default function SearchBox({ index }: { index: SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => search(index, query), [index, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        containerRef.current?.querySelector("input")?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-manikan-muted dark:text-cream-300"
          aria-hidden="true"
          suppressHydrationWarning
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search docs…"
          aria-label="Search documentation"
          className="w-full rounded-lg border border-manikan-border bg-manikan-input-bg py-1.5 pl-9 pr-12 text-sm text-manikan-text placeholder:text-manikan-muted focus:outline-none focus:ring-2 focus:ring-gold-400 dark:border-forest-800 dark:bg-forest-900 dark:text-cream-50 dark:placeholder:text-cream-300"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-manikan-border px-1.5 py-0.5 text-[10px] text-manikan-muted dark:border-forest-800 dark:text-cream-300">
          &#8984;K
        </kbd>
      </div>
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-lg border border-manikan-border bg-manikan-card shadow-lift dark:border-forest-800 dark:bg-forest-900">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-manikan-muted dark:text-cream-300">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.entry.slug}>
                  <Link
                    href={`/docs/${r.entry.slug}`}
                    onClick={() => setOpen(false)}
                    className="block border-b border-manikan-border px-4 py-2.5 last:border-none hover:bg-manikan-bg dark:border-forest-800 dark:hover:bg-forest-800"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-gold-600 dark:text-gold-400">{r.entry.category}</div>
                    <div className="text-sm font-medium text-manikan-text dark:text-cream-50">{r.entry.title}</div>
                    {r.matchedHeading && (
                      <div className="text-xs text-manikan-muted dark:text-cream-300">under &ldquo;{r.matchedHeading}&rdquo;</div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
