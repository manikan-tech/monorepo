import Link from "next/link";
import type { NavCategory } from "../../../content/docs/nav";
import type { SearchEntry } from "../_lib/nav-utils";
import SearchBox from "./SearchBox";
import ThemeToggle from "./ThemeToggle";
import MobileNav from "./MobileNav";

export default function TopBar({ categories, searchIndex }: { categories: NavCategory[]; searchIndex: SearchEntry[] }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-manikan-border bg-manikan-card/90 px-4 backdrop-blur-md dark:border-forest-800 dark:bg-forest-950/90 sm:px-6">
      <MobileNav categories={categories} />
      <Link href="/docs" className="flex items-center gap-2 whitespace-nowrap">
        <span className="font-display text-xl font-medium text-forest-900 dark:text-cream-50">Manikan</span>
        <span className="rounded-md bg-gold-100 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gold-800 dark:bg-forest-800 dark:text-gold-300">Docs</span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <SearchBox index={searchIndex} />
        <ThemeToggle />
      </div>
    </header>
  );
}
