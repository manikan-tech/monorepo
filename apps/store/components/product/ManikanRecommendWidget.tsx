"use client";

import { useEffect } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   Recommendation widget launcher — recommendation-service

   Unlike Manikan3DTryOn (which loads a library exposing window.Manikan.mount
   and mounts/unmounts on demand), recommend-widget.js is a self-contained
   script: it reads data-retailer-key/data-product-id off its own <script>
   tag and mounts itself (floating chat bubble + window.ManikanWidget) the
   moment it *executes* -- there's no remount API. On a real (usually
   multi-page) retailer site that's fine: one script tag, one page, one
   mount. This is a client-side-routed Next.js catalog though, so navigating
   between products doesn't reload the page -- we tear down the previous
   mount and re-inject the script fresh on every product change instead of
   trying to patch a script that was never designed to be remounted.

   Bundle: services-python/recommendation-service/widget/widget.js, copied to
   apps/store/public/recommend-widget.js. Rebuild + recopy on change (same
   deploy step Manikan3DTryOn's comment describes for its own bundle).
   ───────────────────────────────────────────────────────────────────────── */

const WIDGET_SRC = "/recommend-widget.js";

// Public by design — same model as Manikan3DTryOn's RETAILER_KEY. Falls back
// to the local demo retailer's RECOMMENDATION ServiceApiKey so dev works out
// of the box; set NEXT_PUBLIC_MANIKAN_RECOMMEND_KEY for anything past local
// dev (and if that key is ever rotated from the dashboard, update this too).
const RETAILER_KEY =
  process.env.NEXT_PUBLIC_MANIKAN_RECOMMEND_KEY ||
  "pk_live_ef208d3d1b767eeddef67e6ff9402bb11526b14e2aed9689";

function teardownExistingWidget() {
  document.querySelector(".ai-widget-container")?.remove();
  delete (window as unknown as { ManikanWidget?: unknown }).ManikanWidget;
  document
    .querySelectorAll('script[data-manikan-recommend="1"]')
    .forEach((s) => s.remove());
}

export default function ManikanRecommendWidget({ productId }: { productId: string }) {
  useEffect(() => {
    // Deferred by a tick so React Strict Mode's dev-only synchronous
    // mount -> cleanup -> mount cancels the first pass's pending injection
    // instead of racing two copies of a script that mounts itself once,
    // imperatively (reads document.currentScript, appends its own DOM), with
    // no remount/update API to make a second copy a safe no-op. Without this,
    // both copies end up bound to whichever <button id="widgetToggle"> is
    // first in document order via getElementById, while the *other* copy's
    // visually-on-top button (same fixed position) has no handler at all --
    // the bubble renders, but clicking it does nothing.
    const timer = setTimeout(() => {
      teardownExistingWidget();

      const script = document.createElement("script");
      script.src = WIDGET_SRC;
      script.async = true;
      script.dataset.retailerKey = RETAILER_KEY;
      script.dataset.productId = productId;
      script.dataset.manikanRecommend = "1";
      document.body.appendChild(script);
    }, 0);

    return () => {
      clearTimeout(timer);
      teardownExistingWidget();
    };
  }, [productId]);

  return null;
}
