// ─── Rate limiter (Phase 3b — MVP STUB) ─────────────────────────────────
// Fixed-window, in-memory limiter. Acts as a "speed bump" against a single
// valid key being hammered (e.g. server-to-server spoofing with a leaked key).
//
// ⚠️ STUB LIMITATIONS (see docs/enterprise-roadmap.md § Security):
//   • Per-process memory only → resets on redeploy.
//   • Does NOT coordinate across serverless instances (Vercel runs many
//     lambdas), so the effective limit is per-instance, not global.
//   • Keyed on the (validated) retailer id, so the map is bounded by the
//     number of real retailers — no memory-growth attack from bogus keys.
// Production: replace with a shared store (Upstash/Redis) sliding window.

interface WindowState {
    count: number;
    windowStart: number;
}

const RATE_LIMIT_MAX = 30; // requests…
const RATE_LIMIT_WINDOW_MS = 60_000; // …per 60 seconds, per retailer

const buckets = new Map<string, WindowState>();

export interface RateLimitResult {
    allowed: boolean;
    retryAfter: number; // seconds until the window resets (0 when allowed)
}

export function checkRateLimit(
    id: string,
    max: number = RATE_LIMIT_MAX,
    windowMs: number = RATE_LIMIT_WINDOW_MS
): RateLimitResult {
    const now = Date.now();
    const bucket = buckets.get(id);

    // New window (first request, or the previous window has fully elapsed).
    if (!bucket || now - bucket.windowStart >= windowMs) {
        buckets.set(id, { count: 1, windowStart: now });
        return { allowed: true, retryAfter: 0 };
    }

    if (bucket.count >= max) {
        const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
        return { allowed: false, retryAfter };
    }

    bucket.count += 1;
    return { allowed: true, retryAfter: 0 };
}
