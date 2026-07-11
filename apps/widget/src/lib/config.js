/* ─────────────────────────────────────────────────────────────────────────
   Widget runtime config — the public retailer key

   Set once at mount from the embed script's `data-retailer-key` (embeddable
   build), or from VITE_MANIKAN_KEY (dev demo). api.js reads it to attach the
   `X-Manikan-Key` header on every request — this avoids prop-drilling the key
   through every component.

   The key is PUBLIC by design (it lives in the retailer's page HTML). The
   server pairs it with an Origin allowlist check, so exposure is expected and
   safe. See docs/enterprise-roadmap.md § Security.
   ───────────────────────────────────────────────────────────────────────── */

let retailerKey = import.meta.env.VITE_MANIKAN_KEY || null

export function setRetailerKey(key) {
  if (key) retailerKey = key
}

export function getRetailerKey() {
  return retailerKey
}
