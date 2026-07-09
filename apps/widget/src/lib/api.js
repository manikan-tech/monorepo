/* ─────────────────────────────────────────────────────────────────────────
   Body Service API client

   Talks directly to services-python/body-service for now (dev/local mode).
   Per MANIKAN_PROJECT.md the widget should ultimately call the Store
   service instead (which proxies to body-service internally) — swap
   BODY_API_URL for a Store endpoint here when that proxy route exists;
   no component code needs to change.
   ───────────────────────────────────────────────────────────────────────── */

const BODY_API_URL = import.meta.env.VITE_BODY_API_URL || 'http://localhost:8001'

async function postForGlb(path, payload, { timeoutMs = 120_000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${BODY_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `Server error: ${response.status}`)
    }

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } finally {
    clearTimeout(timeout)
  }
}

/** Generate a bare A-pose body avatar. Returns an object URL to a .glb. */
export function generateAvatar(measurements) {
  return postForGlb('/generate-avatar', measurements)
}

/** Generate a body avatar wearing a garment. Returns an object URL to a .glb. */
export function generateDressedAvatar(payload) {
  return postForGlb('/generate-dressed-avatar', payload)
}
