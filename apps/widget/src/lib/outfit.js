/* ─────────────────────────────────────────────────────────────────────────
   Currently-worn outfit

   The widget mounts fresh per product, so without this the shopper silently
   loses whatever they were already wearing the moment they open a different
   product — try pants, then a tee, and the pants vanish with no explanation.

   Stored as an outfit KEYED BY CATEGORY ({ tshirt: {...}, pants: {...} }),
   not a single garment: a shopper wearing a tee AND pants is wearing two
   things, and a one-slot store cannot represent that — it would silently
   forget one of them as soon as the second was put on.

   sessionStorage (not localStorage) on purpose: "what I'm currently trying
   on" is a browsing-session idea, not a durable profile. Closing the tab
   should start clean, unlike `manikan_profile` (the body measurements),
   which is deliberately long-lived.

   Only ids, sizes and display names are kept. The garment's colour and
   measurements are never stored here — the Store re-resolves those from the
   DB on every request, so a tampered value cannot change what gets rendered.
   ───────────────────────────────────────────────────────────────────────── */

const KEY = 'manikan_outfit'

/** @returns {Record<string, {product_id:string,size:string,name:string}>} */
export function getOutfit() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}   // private mode / disabled storage: layering just stays off
  }
}

function save(outfit) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(outfit))
  } catch {
    /* non-fatal — the shopper simply won't get layering suggestions */
  }
}

/** Put a garment on, replacing whatever was in that category slot. */
export function wearGarment(category, { product_id, size, name, color_hex, color_name }) {
  if (!category || !product_id || !size) return
  const outfit = getOutfit()
  outfit[category] = { product_id, size, name, color_hex, color_name }
  save(outfit)
}

/** Take off whatever is in this category slot. */
export function removeGarment(category) {
  const outfit = getOutfit()
  delete outfit[category]
  save(outfit)
}

/**
 * The worn garment that can be layered with the product being viewed: one in
 * a DIFFERENT category (one top + one bottom), and not this same product.
 * Same category means the shopper is swapping, not layering, so the old one
 * is simply replaced rather than offered alongside.
 */
export function getLayerableGarment(currentProductId, currentCategory) {
  const outfit = getOutfit()
  for (const [category, garment] of Object.entries(outfit)) {
    if (category === currentCategory) continue
    if (!garment?.product_id || garment.product_id === currentProductId) continue
    return { ...garment, category }
  }
  return null
}
