import type { Metadata } from "next";
import DocsThemeProvider from "./_components/DocsThemeProvider";
import TopBar from "./_components/TopBar";
import Sidebar from "./_components/Sidebar";
import { sortedNav, buildSearchIndex } from "./_lib/nav-utils";

export const metadata: Metadata = {
  title: { default: "Docs — Manikan", template: "%s — Manikan Docs" },
  description: "Manikan technical documentation.",
};

// Docs-specific chrome: top bar + persistent left sidebar. Deliberately its
// own layout, not a variant of the storefront/dashboard shells -- no
// shopping nav, no dashboard sidebar, and it can freely diverge from both
// without risking either. Shares only the root layout's fonts (loaded
// globally, not re-declared here) and Tailwind config.
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const categories = sortedNav();
  const searchIndex = await buildSearchIndex();

  return (
    <DocsThemeProvider>
      <div className="min-h-screen bg-manikan-bg font-body text-manikan-text dark:bg-forest-950 dark:text-cream-50">
        <TopBar categories={categories} searchIndex={searchIndex} />
        <div className="mx-auto flex max-w-[1440px]">
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-manikan-border p-4 dark:border-forest-800 lg:block">
            <Sidebar categories={categories} />
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </DocsThemeProvider>
  );
}
