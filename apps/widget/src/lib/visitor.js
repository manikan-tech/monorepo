/* ─────────────────────────────────────────────────────────────────────────
   Anonymous visitor identity — MVP Tier 2 (Anonymous Server Token)

   Generates a stable, opaque id stored in the browser's localStorage so a
   returning shopper's MeasurementSessions can be linked WITHOUT any login.
   The id carries no PII.

   Embedded-context note: localStorage is partitioned by the top-level site,
   so a shopper's id on storeA.com is independent from storeB.com — the desired
   privacy behaviour (no cross-retailer tracking).

   TODO(Enterprise — Tier 3 Identity): when a retailer passes a signed
   `customerRef` (HMAC over their own logged-in customer id), that should take
   precedence over this anonymous id for cross-device continuity.
   See docs/enterprise-roadmap.md § Identity.
   ───────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'manikan_visitor_id'

/**
 * Returns a stable anonymous visitor id, creating and persisting one on first
 * use. Returns null if storage is unavailable (private mode, disabled storage,
 * SSR) — callers must treat a null shopper ref as "anonymous, not remembered".
 */
export function getVisitorId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = generateId()
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    // Strict-privacy browsers / disabled storage → no persistent id this session.
    return null
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for older / non-secure contexts where crypto.randomUUID is absent.
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
