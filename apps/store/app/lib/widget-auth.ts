import { NextRequest, NextResponse } from "next/server";
import type { Retailer } from "@prisma/client";
import { prisma } from "./prisma";
import { checkRateLimit } from "./rate-limit";

// ─── Widget security gate (Phase 3b) ────────────────────────────────────
// Runs before any product/engine logic on the widget proxy routes. Enforces,
// in order:
//   1. X-Manikan-Key header present ................ else 401
//   2. Origin header present (FAIL-CLOSED) ......... else 403
//   3. Key resolves to an ACTIVE retailer .......... else 403
//   4. Origin ∈ retailer.widgetSettings.allowedOrigins  else 403
//   5. Per-retailer rate limit (stub) .............. else 429
//
// The key is PUBLIC by design; it is not a secret. Security comes from the
// pairing of (key → known active retailer) AND (Origin → retailer's allowlist),
// plus the rate-limit speed bump. This is NOT airtight against a caller that
// forges BOTH a valid key and an allowed Origin server-side — that residual
// risk is closed by the enterprise short-lived-token system. See
// docs/enterprise-roadmap.md § Security.
//
// Failure responses use a GENERIC 403 body so we never leak WHICH check failed
// (no key-enumeration / origin-probing oracle).

export type WidgetAuthResult =
    | { ok: true; retailer: Retailer }
    | { ok: false; response: NextResponse };

function forbidden(cors: Record<string, string>): NextResponse {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
}

// Normalise to `scheme://host[:port]` — lowercased host, no trailing slash.
function normalizeOrigin(origin: string): string {
    try {
        const u = new URL(origin);
        const port = u.port ? `:${u.port}` : "";
        return `${u.protocol}//${u.hostname.toLowerCase()}${port}`;
    } catch {
        return origin.trim().toLowerCase().replace(/\/+$/, "");
    }
}

export async function authorizeWidgetRequest(
    request: NextRequest,
    cors: Record<string, string>
): Promise<WidgetAuthResult> {
    // 1. Public retailer key (sent by the widget as X-Manikan-Key).
    const key = request.headers.get("x-manikan-key");
    if (!key) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Missing X-Manikan-Key" },
                { status: 401, headers: cors }
            ),
        };
    }

    // 2. FAIL-CLOSED: a real browser always sends Origin on a cross-origin POST.
    //    A missing Origin means a non-browser (server-to-server) caller → reject.
    const origin = request.headers.get("origin");
    if (!origin) {
        return { ok: false, response: forbidden(cors) };
    }

    // 3. Resolve the key to an active retailer.
    const retailer = await prisma.retailer.findUnique({ where: { apiKey: key } });
    if (!retailer || !retailer.isActivated) {
        return { ok: false, response: forbidden(cors) };
    }

    // 4. Origin allowlist (stored in retailer.widgetSettings.allowedOrigins).
    const settings =
        (retailer.widgetSettings as unknown as { allowedOrigins?: unknown }) ?? {};
    const rawOrigins = settings.allowedOrigins;
    const allowed = Array.isArray(rawOrigins)
        ? rawOrigins
              .filter((o): o is string => typeof o === "string")
              .map(normalizeOrigin)
        : [];
    if (!allowed.includes(normalizeOrigin(origin))) {
        return { ok: false, response: forbidden(cors) };
    }

    // 5. Rate limit (per-retailer fixed-window stub).
    const rl = checkRateLimit(retailer.id);
    if (!rl.allowed) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Too many requests" },
                {
                    status: 429,
                    headers: { ...cors, "Retry-After": String(rl.retryAfter) },
                }
            ),
        };
    }

    return { ok: true, retailer };
}
