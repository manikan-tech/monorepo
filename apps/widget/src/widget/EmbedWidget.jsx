import { useEffect, useState } from 'react'
import ManikanWidget from '../components/ManikanWidget'
import { fetchProduct } from '../lib/products'

/* ─────────────────────────────────────────────────────────────────────────
   Embed Root — the floating trigger + product loader.

   ManikanWidget itself is an unmodified full-screen modal. For a real embed
   there's nothing to click without a trigger, so this renders a small floating
   "Try It On" bubble. On click it fetches the real product from the Store
   (/api/widget/products/[id]) and then opens ManikanWidget with it — which in
   turn shows the 3D try-on flow or a "coming soon" state depending on the
   product's `isTryOnEnabled` flag.
   ───────────────────────────────────────────────────────────────────────── */
export default function EmbedWidget({
  productId,
  retailerKey,
  recommendationKey,
  // Pre-resolved product, already in the /api/widget/products/[id] shape.
  // When supplied the network fetch is skipped entirely. This is what a
  // FIRST-PARTY host (our own storefront) passes: the page has already loaded
  // the product, and a same-origin GET carries no Origin header, which
  // widget-auth rejects fail-closed by design. Injecting sidesteps that
  // without weakening the cross-origin security model retailers rely on.
  product: injectedProduct = null,
  // Open immediately and render no floating trigger. For hosts that supply
  // their own button (see the store's Manikan3DTryOn launcher).
  autoOpen = false,
  // Notifies the host when the user closes the widget, so it can unmount.
  onClose,
}) {
  const [open, setOpen] = useState(autoOpen)
  const [product, setProduct] = useState(injectedProduct)
  const [status, setStatus] = useState(injectedProduct ? 'ready' : 'idle') // idle | loading | ready | error
  const [error, setError] = useState(null)

  const loadProduct = async () => {
    if (product) return // already loaded — reopen instantly
    setStatus('loading')
    setError(null)
    try {
      setProduct(await fetchProduct(productId))
      setStatus('ready')
    } catch (e) {
      setError(e.message || 'Could not load this product.')
      setStatus('error')
    }
  }

  const handleOpen = async () => {
    setOpen(true)
    await loadProduct()
  }

  // autoOpen with no injected product still needs one fetch on mount.
  useEffect(() => {
    if (autoOpen && !injectedProduct) void loadProduct()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    setOpen(false)
    onClose?.()
  }

  if (open) {
    if (status === 'ready' && product) {
      return <ManikanWidget product={product} recommendationKey={recommendationKey} onClose={close} />
    }
    return (
      <div className="mw-overlay" onClick={close}>
        <div className="mw-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
          <div className="mw-body" style={{ textAlign: 'center', padding: '48px 24px' }}>
            {status === 'loading' ? (
              <>
                <div className="tryon-loading-spinner" style={{ margin: '0 auto 16px' }} />
                <p className="mw-section-desc">Loading…</p>
              </>
            ) : (
              <>
                <p className="mw-welcome-title" style={{ fontSize: 18 }}>Couldn’t load this product</p>
                <p className="mw-section-desc">{error}</p>
                <button onClick={close} className="mw-reset-btn" style={{ marginTop: 16 }}>Close</button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Host supplies its own trigger -> never render the floating bubble.
  if (autoOpen) return null

  return (
    <button
      onClick={handleOpen}
      className="mw-primary-btn"
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999999 }}
      id="manikan-trigger"
      data-retailer-key={retailerKey}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      Try It On
    </button>
  )
}
