import { mount } from './mount.jsx'

/* ─────────────────────────────────────────────────────────────────────────
   Manikan Widget — Embeddable Library Entry

   Built by vite.lib.config.js into a single IIFE (dist-lib/manikan-widget.js)
   that a retailer embeds with one script tag:

     <script src="https://cdn.manikan.io/widget.js"
             data-retailer-id="RETAILER_ID"
             data-product-id="PRODUCT_ID"></script>

   On load it auto-mounts a floating trigger bubble (see EmbedWidget.jsx).
   window.Manikan.mount() is also exposed for retailers who want to control
   placement/trigger themselves instead of relying on auto-init.
   ───────────────────────────────────────────────────────────────────────── */
function autoInit() {
  const script = document.currentScript
  if (!script) {
    console.warn(
      'Manikan widget: could not detect the embed <script> tag for auto-init; ' +
      'use window.Manikan.mount(target, { productId, retailerId }) instead.'
    )
    return
  }

  const { productId, retailerId } = script.dataset
  if (!productId) {
    console.warn('Manikan widget: missing data-product-id on the embed <script> tag.')
    return
  }

  const host = document.createElement('div')
  document.body.appendChild(host)

  mount(host, { productId, retailerId })
}

if (typeof document !== 'undefined') {
  autoInit()
}

if (typeof window !== 'undefined') {
  window.Manikan = { ...(window.Manikan || {}), mount }
}
