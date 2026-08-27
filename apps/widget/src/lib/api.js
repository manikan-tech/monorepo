/* ─────────────────────────────────────────────────────────────────────────
   Store Service API client

   The widget talks to the Store service (Next.js), which orchestrates and
   proxies to the Python Body Service. Per MANIKAN_PROJECT.md the widget must
   NEVER call the Body Service directly — the Store is the single entry point
   (validation, MeasurementSession persistence, rate limiting, hidden URLs).
   ───────────────────────────────────────────────────────────────────────── */

import { getVisitorId } from './visitor'
import { getRetailerKey } from './config'

const STORE_API_URL = import.meta.env.VITE_STORE_API_URL || 'http://localhost:3000'

async function postForGlb(path, payload, { timeoutMs = 120_000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${STORE_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Public retailer key — the Store verifies it + the request Origin (Phase 3b).
        'X-Manikan-Key': getRetailerKey() ?? '',
      },
      signal: controller.signal,
      // shopper_ref (anonymous visitor token) is attached transparently to
      // every call, so components never need to know about identity. See visitor.js.
      body: JSON.stringify({ ...payload, shopper_ref: getVisitorId() }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || errorData.detail || `Server error: ${response.status}`)
    }

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } finally {
    clearTimeout(timeout)
  }
}

/** Generate a bare A-pose body avatar via the Store proxy. Returns an object URL to a .glb. */
export function generateAvatar(measurements) {
  return postForGlb('/api/avatar', measurements)
}

/** Generate a garment try-on via the Store proxy. Returns an object URL to a .glb. */
export function generateDressedAvatar(payload) {
  return postForGlb('/api/tryon', payload)
}

async function postJson(path, payload, { timeoutMs = 30_000, apiKey } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${STORE_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Manikan-Key': apiKey ?? getRetailerKey() ?? '',
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`)
    return data
  } finally {
    clearTimeout(timeout)
  }
}

/** Request the Store's recommendation + 3D orchestration workflow. */
export function processWidgetFit({ productId, measurements, recommendationKey }) {
  if (!recommendationKey) {
    return Promise.reject(new Error('Recommendation service is not configured for this retailer'))
  }
  return postJson('/api/widget/process', { productId, measurements }, { apiKey: recommendationKey })
}

/** Upload an optional shopper photo for a 2D virtual try-on preview. */
export async function uploadVirtualTryOn(productId, photo, { timeoutMs = 120_000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const formData = new FormData()
  formData.append('product_id', productId)
  formData.append('human_image', photo)

  try {
    const response = await fetch(`${STORE_API_URL}/api/widget/vton`, {
      method: 'POST',
      headers: { 'X-Manikan-Key': getRetailerKey() ?? '' },
      signal: controller.signal,
      body: formData,
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Virtual try-on failed (${response.status})`)
    }
    return URL.createObjectURL(await response.blob())
  } finally {
    clearTimeout(timeout)
  }
}
