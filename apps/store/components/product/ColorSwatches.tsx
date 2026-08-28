"use client";

import { useRouter } from "next/navigation";

type ColorSibling = {
  id: string;
  slug: string;
  garmentColorHex: string | null;
  imageUrl: string;
};

/**
 * Circular colour swatches that navigate to the sibling product page for
 * that colour. Only renders when siblings exist
 */
export default function ColorSwatches({
  currentColorHex,
  siblings,
}: {
  currentColorHex: string | null;
  siblings: ColorSibling[];
}) {
  const router = useRouter();

  if (!siblings || siblings.length === 0) return null;

  // Build the full swatch list: current product first, then siblings.
  const allColors: { hex: string | null; slug: string | null; isCurrent: boolean }[] = [
    { hex: currentColorHex, slug: null, isCurrent: true },
    ...siblings.map((s) => ({
      hex: s.garmentColorHex,
      slug: s.slug,
      isCurrent: false,
    })),
  ];

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: "175ms" }}>
      <h3 className="text-sm font-semibold text-forest-950 mb-3">Color</h3>
      <div className="flex flex-wrap gap-2.5">
        {allColors.map((c, i) => {
          if (!c.hex) return null;
          return (
            <button
              key={c.hex + i}
              type="button"
              title={c.isCurrent ? "Current color" : "View this color"}
              onClick={() => {
                if (!c.isCurrent && c.slug) {
                  router.push(`/store/${c.slug}`);
                }
              }}
              className={`
                relative w-8 h-8 rounded-full border-2 transition-all duration-300
                hover:scale-110 hover:shadow-soft
                ${c.isCurrent
                  ? "border-forest-900 ring-2 ring-forest-900/20 scale-105"
                  : "border-forest-200 hover:border-forest-400 cursor-pointer"
                }
              `}
            >
              <span
                className="absolute inset-[3px] rounded-full"
                style={{ backgroundColor: c.hex }}
              />
              {c.isCurrent && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isLightColor(c.hex) ? "#1a1a1a" : "#ffffff"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Quick luminance check to pick a contrasting check-mark colour. */
function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}
