"use client";

import { useEffect, useState } from "react";
import type { DocHeading } from "../_lib/mdx";

export default function TableOfContents({ headings }: { headings: DocHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Among headings currently intersecting the trigger band, the one
        // closest to the top of the viewport is "current" -- picking the
        // first intersecting entry alone flickers between adjacent short
        // sections as they enter/leave together.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
          setActiveId(top.target.id);
        }
      },
      { rootMargin: "-88px 0px -70% 0px", threshold: 0 }
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-manikan-muted dark:text-cream-300">On this page</p>
      <ul className="flex flex-col gap-1.5 border-l border-manikan-border dark:border-forest-800">
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: h.depth === 3 ? "1.5rem" : "0.9rem" }}>
            <a
              href={`#${h.id}`}
              className={`block border-l-2 py-0.5 pl-2.5 -ml-px transition-colors ${
                activeId === h.id
                  ? "border-gold-400 font-medium text-manikan-text dark:text-cream-50"
                  : "border-transparent text-manikan-muted hover:text-manikan-text dark:text-cream-300 dark:hover:text-cream-50"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
