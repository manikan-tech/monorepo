"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { garmentFieldsFor, isProductTryOnEnabled } from "../../app/lib/tryon-status";

/* ─────────────────────────────────────────────────────────────────────────
   3D Try-On launcher — body-service (Pipeline 2)

   The 3D body-modelling try-on, distinct from the 2D "Virtual Try-On" button
   that routes to /visualize + the VTON service. Both sit on the product page;
   neither touches the other.

   This does NOT reimplement a viewer. apps/widget is already the purpose-built
   3D front-end (react-three-fiber, AvatarViewer/TryOnViewer) and ships an
   embeddable IIFE that mounts itself into a shadow root, so its Tailwind build
   and the store's styles cannot leak into each other.

   Two things make the embed work from a FIRST-PARTY page:

     autoOpen  ManikanWidget is itself a full-screen modal. Without this the
               embed renders its floating "Try It On" bubble and we'd end up
               with a modal inside a bubble inside a modal.

     product   A same-origin GET carries no Origin header, and widget-auth is
               fail-closed on a missing Origin (correctly — that check is what
               stops server-to-server callers). Rather than weaken a security
               control the retailer embed depends on, we hand the widget the
               product the page has already loaded, so that fetch never happens.
               The try-on POST still goes through widget-auth normally, since
               browsers do send Origin on POST.

   Bundle: apps/widget `vite build --config vite.lib.config.js` -> dist-lib/
   manikan-widget.js, copied to apps/store/public. Rebuild + recopy on change.
   ───────────────────────────────────────────────────────────────────────── */

const WIDGET_SRC = "/manikan-widget.js";

// Public by design — it lives in retailer page HTML and is paired with an
// Origin allowlist server-side. Configurable per deployment; falls back to the
// local demo retailer's BODY_MODELING ServiceApiKey so dev works out of the
// box. NOTE: this fallback goes stale if that key is ever rotated from the
// dashboard (Services > Body Modeling > Regenerate Key) -- for anything past
// local dev, set NEXT_PUBLIC_MANIKAN_WIDGET_KEY instead of relying on this.
const RETAILER_KEY =
  process.env.NEXT_PUBLIC_MANIKAN_WIDGET_KEY || "pk_live_618be0c3849d6587048cc81bb490c4d10aaf2c72e9e04330";

type MountResult = { unmount: () => void } | null;
type WidgetProduct = {
  id: string;
  name: string;
  image: string | null;
  price: number | null;
  category: string | null;
  color_hex: string | null;
  color_name: string | null;
  isTryOnEnabled: boolean;
  sizes: Record<string, Record<string, number | null>>;
};

declare global {
  interface Window {
    Manikan?: {
      mount: (
        target: string | HTMLElement,
        options: {
          productId: string;
          retailerKey?: string;
          product?: WidgetProduct;
          autoOpen?: boolean;
          onClose?: () => void;
        }
      ) => MountResult;
    };
  }
}

type StoreVariant = Record<string, number | null> & { sizeLabel: string };
type StoreProduct = {
  id: string;
  name: string;
  imageUrl?: string | null;
  priceEgp?: number | null;
  category?: string | null;
  garmentColorHex?: string | null;
  variants?: StoreVariant[];
};

/** Store product -> the shape /api/widget/products/[id] would have returned.
 *  Mirrors that route's category-aware size payload exactly. */
function toWidgetProduct(p: StoreProduct): WidgetProduct {
  const variants = p.variants ?? [];
  const isPants = p.category === "pants";
  const sizes: Record<string, Record<string, number | null>> = {};
  for (const v of variants) {
    sizes[v.sizeLabel] = isPants
      ? {
          waist_width_cm: v.garmentWaistCm ?? null,
          hip_width_cm: v.garmentHipCm ?? null,
          inseam_cm: v.garmentInseamCm ?? null,
          rise_cm: v.garmentRiseCm ?? null,
        }
      : {
          chest_width_cm: v.garmentChestCm ?? null,
          body_length_cm: v.garmentLengthCm ?? null,
          sleeve_length_cm: v.garmentSleeveCm ?? null,
          shoulder_width_cm: v.garmentShoulderCm ?? null,
        };
  }
  return {
    id: p.id,
    name: p.name,
    image: p.imageUrl ?? null,
    price: p.priceEgp ?? null,
    category: p.category ?? null,
    color_hex: p.garmentColorHex ?? null,
    color_name: null, // no colour-name column in the DB (display only)
    isTryOnEnabled: isProductTryOnEnabled({
      category: p.category,
      garmentColorHex: p.garmentColorHex ?? null,
      variants,
    }),
    sizes,
  };
}

let scriptPromise: Promise<void> | null = null;

/** Load the embed bundle once per page, shared by every launcher instance. */
function loadWidgetScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Manikan) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load the 3D try-on widget"));
    document.head.appendChild(s);
  }).catch((e) => {
    scriptPromise = null; // allow a retry on the next click
    throw e;
  });

  return scriptPromise;
}

export default function Manikan3DTryOn({ product }: { product: StoreProduct }) {
  const [status, setStatus] = useState<"idle" | "loading" | "open" | "error">("idle");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<MountResult>(null);

  const teardown = useCallback(() => {
    try {
      instanceRef.current?.unmount();
    } catch {
      /* already torn down */
    }
    instanceRef.current = null;
    hostRef.current?.remove();
    hostRef.current = null;
    document.body.style.overflow = "";
    setStatus("idle");
  }, []);

  useEffect(() => teardown, [teardown]);

  const open = useCallback(async () => {
    if (status === "loading" || status === "open") return;
    setStatus("loading");
    try {
      await loadWidgetScript();
      if (!window.Manikan) throw new Error("widget unavailable");

      // The widget renders its own full-screen overlay, so it just needs a
      // bare shadow host at the end of <body> — no wrapper chrome from us.
      const host = document.createElement("div");
      host.setAttribute("data-manikan-3d", "");
      document.body.appendChild(host);
      hostRef.current = host;
      document.body.style.overflow = "hidden";

      instanceRef.current = window.Manikan.mount(host, {
        productId: product.id,
        retailerKey: RETAILER_KEY,
        product: toWidgetProduct(product),
        autoOpen: true,
        onClose: teardown,
      });
      setStatus("open");
    } catch {
      setStatus("error");
      hostRef.current?.remove();
      hostRef.current = null;
      document.body.style.overflow = "";
    }
  }, [product, status, teardown]);

  const enabled = isProductTryOnEnabled({
    category: product.category,
    garmentColorHex: product.garmentColorHex ?? null,
    variants: product.variants ?? [],
  });

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
        className="w-full group relative flex items-center justify-center gap-3 py-3 px-6 rounded-2xl font-medium text-sm text-white bg-forest-900 hover:bg-forest-800 shadow-soft hover:shadow-card transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait overflow-hidden"
      >
        {/* gold sheen on hover — signals premium/3D without shouting */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(200,150,102,0.35),transparent_60%)]"
        />
        {status === "loading" ? (
          <span className="relative w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="relative"
          >
            {/* cube — reads as 3D at 16px, unlike the 2D expand arrows */}
            <path d="M12 2 3 7v10l9 5 9-5V7Z" />
            <path d="M3 7l9 5 9-5" />
            <path d="M12 12v10" />
          </svg>
        )}
        <span className="relative">
          {status === "loading" ? "Preparing 3D fit…" : "3D Fit Preview"}
        </span>
        <span className="relative text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gold-400/20 text-gold-300 border border-gold-400/30">
          Beta
        </span>
      </button>

      {status === "error" && (
        <p className="mt-2 text-xs text-center text-forest-700/70">
          Couldn&apos;t load the 3D preview — check the body service is running.
        </p>
      )}
      {!enabled && status === "idle" && (
        <p className="mt-2 text-xs text-center text-forest-700/60">
          3D preview needs {garmentFieldsFor(product.category ?? "tshirt").length} garment
          measurements on every size, plus a garment colour.
        </p>
      )}
    </>
  );
}
