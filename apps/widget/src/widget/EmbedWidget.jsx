import { useState } from 'react'
import ManikanWidget from '../components/ManikanWidget'

/* ─────────────────────────────────────────────────────────────────────────
   Embed Root — the only new UI Phase 3 introduces.

   ManikanWidget itself is an unmodified full-screen modal with no built-in
   trigger (the dev demo opens it from a product-grid click). For a real
   embed there's nothing to click without one, so this renders a small
   floating "Try It On" bubble that opens ManikanWidget exactly as-is; its
   own onClose prop closes it back down to just the bubble.
   ───────────────────────────────────────────────────────────────────────── */
export default function EmbedWidget({ product, retailerKey }) {
  const [open, setOpen] = useState(false)

  if (open) {
    return <ManikanWidget product={product} onClose={() => setOpen(false)} />
  }

  return (
    <button
      onClick={() => setOpen(true)}
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
