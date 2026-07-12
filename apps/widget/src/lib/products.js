/* ─────────────────────────────────────────────────────────────────────────
   Product data — fetched live from the Store (real DB), not static.

   Replaces reading garment/display data out of the static src/data/products.js
   fixture. The Store returns the product shaped for the widget, including
   `isTryOnEnabled` so the UI can show the 3D flow vs. a "coming soon" state.

   Auth: the public retailer key (X-Manikan-Key) from config.js — the same key
   the try-on requests use. The browser attaches the Origin automatically; the
   Store validates both (see app/lib/widget-auth.ts).
   ───────────────────────────────────────────────────────────────────────── */

import { getRetailerKey } from './config'

const STORE_API_URL = import.meta.env.VITE_STORE_API_URL || 'http://localhost:3000'

/** Fetch a single product by id. Throws with a friendly message on failure. */
export async function fetchProduct(productId) {
  const response = await fetch(
    `${STORE_API_URL}/api/widget/products/${encodeURIComponent(productId)}`,
    { headers: { 'X-Manikan-Key': getRetailerKey() ?? '' } }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Failed to load product (${response.status})`)
  }

  return response.json()
}
