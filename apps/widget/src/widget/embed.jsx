import { mount } from './mount.jsx'

/* ─────────────────────────────────────────────────────────────────────────
   Manikan Widget — Embeddable Library Entry

   Built by vite.lib.config.js into a single IIFE (dist-lib/manikan-widget.js)
   that a retailer embeds with one script tag:

     <script src="https://cdn.manikan.io/widget.js"
             data-retailer-key="RETAILER_PUBLIC_KEY"
             data-product-code="YOUR_PRODUCT_CODE"></script>

   On load it auto-mounts a floating trigger bubble (see EmbedWidget.jsx).
   window.Manikan.mount() is also exposed for retailers who want to control
   placement/trigger themselves instead of relying on auto-init.
   ───────────────────────────────────────────────────────────────────────── */
function autoInit() {
  const script = document.currentScript
  if (!script) {
    console.warn(
      'Manikan widget: could not detect the embed <script> tag for auto-init; ' +
      'use window.Manikan.mount(target, { productId, retailerKey }) instead.'
    )
    return
  }

  // productCode is the preferred retailer-owned external identifier. Keep
  // productId as a compatibility alias for existing UUID-based embeds.
  const { productCode, productId, retailerKey } = script.dataset
  const productIdentifier = productCode || productId
  if (!productIdentifier) {
    // A tag with NO data attributes at all is a first-party host loading the
    // library to drive window.Manikan.mount() itself (see the store's
    // Manikan3DTryOn launcher) -- that is intentional, not a misconfiguration,
    // so stay quiet. Warn only when the tag looks like a retailer embed that
    // simply forgot the product id.
    const looksLikeRetailerEmbed = Object.keys(script.dataset).length > 0
    if (looksLikeRetailerEmbed) {
      console.warn('Manikan widget: missing data-product-code on the embed <script> tag.')
    }
    return
  }

  const host = document.createElement('div')
  document.body.appendChild(host)

  mount(host, { productId: productIdentifier, retailerKey })
}

if (typeof document !== 'undefined') {
  autoInit()
}

if (typeof window !== 'undefined') {
  window.Manikan = { ...(window.Manikan || {}), mount }
}
