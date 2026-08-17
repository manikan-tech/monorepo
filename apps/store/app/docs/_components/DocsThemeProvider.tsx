"use client";

import { ThemeProvider } from "next-themes";

/** Scoped to app/docs only -- mounted from app/docs/layout.tsx, not the
 *  root layout, so the rest of the store is untouched. next-themes still
 *  manages the `.dark` class on <html> by default (this is standard and
 *  not worth fighting), but that's inert everywhere outside /docs: no
 *  other route in this app uses a single `dark:` class, verified before
 *  building this (see the tailwind.config.ts comment on `darkMode`). */
export default function DocsThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
