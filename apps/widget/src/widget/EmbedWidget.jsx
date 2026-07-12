import { useState } from 'react'
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
export default function EmbedWidget({ productId, retailerKey }) {
  const [open, setOpen] = useState(false)
  const [product, setProduct] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)

  const handleOpen = async () => {
    setOpen(true)
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

  const close = () => setOpen(false)

  if (open) {
    if (status === 'ready' && product) {
      return <ManikanWidget product={product} onClose={close} />
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
