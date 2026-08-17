"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";

/** Renders one ```mermaid fence's raw source (piped in via mdx.ts's
 *  remarkMermaidBlocks, which routes it here instead of Shiki) into an SVG
 *  in the browser -- mermaid needs a real DOM to lay diagrams out, so this
 *  can't run at compile time the way rehype-pretty-code's syntax highlighting
 *  does. Re-renders on theme change so a diagram matches light/dark instead
 *  of staying stuck in whichever theme was active on first mount. */
export default function Mermaid({ source }: { source: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: resolvedTheme === "dark" ? "dark" : "default",
        securityLevel: "strict",
        fontFamily: "var(--font-sans, inherit)",
      });
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${reactId}`, source);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
    // resolvedTheme is undefined on the very first client render (next-themes
    // hasn't resolved localStorage/system preference yet); this re-runs once
    // it does, which is the re-render that actually matters here.
  }, [source, resolvedTheme, reactId]);

  if (error) {
    return (
      <div className="not-prose my-6 rounded-lg border border-manikan-error/40 bg-manikan-error/5 p-4 text-sm text-manikan-error">
        Diagram failed to render: {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="not-prose my-6 flex justify-center rounded-lg border border-manikan-border bg-manikan-card p-6 dark:border-forest-800 dark:bg-forest-900">
        <span className="text-sm text-manikan-muted dark:text-cream-300">Rendering diagram…</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="not-prose my-6 flex justify-center overflow-x-auto rounded-lg border border-manikan-border bg-manikan-card p-6 dark:border-forest-800 dark:bg-forest-900 [&_svg]:max-w-full"
      // svg comes from mermaid's own renderer, not user input reaching this
      // page -- the doc source itself is reviewed-before-publish content.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
