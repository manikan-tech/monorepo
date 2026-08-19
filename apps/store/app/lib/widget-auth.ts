import { NextRequest, NextResponse } from "next/server";
import type { Retailer } from "@prisma/client";
import { prisma } from "./prisma";
import { checkRateLimit } from "./rate-limit";
import { Service } from "./service-keys";

// ─── Widget security gate (Phase 3b) ────────────────────────────────────
// Runs before any product/engine logic on the widget proxy routes. Enforces,
// in order:
//   1. X-Manikan-Key header present ................ else 401
//   2. Origin header present (FAIL-CLOSED) ......... else 403
//   3. Key resolves to a ServiceApiKey for THIS scope,
//      belonging to an ACTIVE retailer .............. else 403
//   4. Origin ∈ retailer.widgetSettings.allowedOrigins  else 403
//   5. Active subscription + quota for THIS scope ... else 429
//   6. Per-retailer rate limit (stub) .............. else 429
//
// The key is PUBLIC by design; it is not a secret. Security comes from the
// pairing of (key → known active retailer, scoped to one service) AND
// (Origin → retailer's allowlist), plus the rate-limit speed bump. This is
// NOT airtight against a caller that forges BOTH a valid key and an allowed
// Origin server-side — that residual risk is closed by the enterprise
// short-lived-token system. See docs/enterprise-roadmap.md § Security.
//
// Each service (BODY_MODELING / VTON_2D / RECOMMENDATION) has its own key AND
// its own subscription -- a retailer may use just one, some, or all three,
// and a key minted for one service can never authorize another.
//
// Failure responses use a GENERIC 403 body so we never leak WHICH check failed
// (no key-enumeration / origin-probing oracle).

export type WidgetAuthResult =
    | { ok: true; retailer: Retailer; subscription?: { id: string } }
    | { ok: false; response: NextResponse };

function forbidden(cors: Record<string, string>): NextResponse {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
}

// Normalise to `scheme://host[:port]` — lowercased host, no trailing slash.
// Browsers may open a local Store through either `localhost` or `127.0.0.1`.
// Treat those loopback aliases as the same host so an allowlist entry for one
// does not reject the identical local server reached through the other.
function normalizeOrigin(origin: string): string {
    try {
        const u = new URL(origin);
        const port = u.port ? `:${u.port}` : "";
        const rawHostname = u.hostname.toLowerCase();
        const hostname =
            rawHostname === "127.0.0.1" ||
            rawHostname === "::1" ||
            rawHostname === "[::1]"
                ? "localhost"
                : rawHostname;
        return `${u.protocol}//${hostname}${port}`;
    } catch {
        return origin.trim().toLowerCase().replace(/\/+$/, "");
    }
}

export type QuotaCheckResult =
    | { ok: true; subscription: { id: string } }
    | { ok: false; response: NextResponse };

/**
 * The monthly billing quota check for one retailer + one service: is there
 * an active subscription for this service, and has it exceeded its plan's
 * quota? Shared by authorizeWidgetRequest (the X-Manikan-Key widget gate) and
 * the cookie-authenticated storefront VTON proxy (app/api/vton/2d/proxy),
 * which needs the identical billing check but arrives via a completely
 * different auth model (customer session, not a retailer widget key) — so it
 * calls this directly rather than the full widget gate.
 */
export async function checkServiceQuota(
    retailerId: string,
    scope: Service,
    cors: Record<string, string> = {},
): Promise<QuotaCheckResult> {
    const subscription = await prisma.subscription.findFirst({
        where: { retailerId, service: scope, status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
    });

    if (!subscription || !subscription.plan) {
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error: `No active subscription for ${scope}. Please subscribe to a plan.`,
                    code: "NO_SUBSCRIPTION",
                    scope,
                },
                { status: 429, headers: cors }
            ),
        };
    }

    if (subscription.currentPeriodUsage >= subscription.plan.quota) {
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error: "Quota exceeded. Upgrade your plan to continue using this service.",
                    code: "QUOTA_EXCEEDED",
                    usage: subscription.currentPeriodUsage,
                    limit: subscription.plan.quota,
                    scope,
                },
                { status: 429, headers: cors }
            ),
        };
    }

    return { ok: true, subscription: { id: subscription.id } };
}

/**
 * @param scope — Which service this request is for ("BODY_MODELING",
 *   "VTON_2D", or "RECOMMENDATION"). Required: a key is scoped to exactly one
 *   service, so there is no way to authorize a request without knowing which
 *   service it claims to be for. Enforces the monthly billing quota defined
 *   on the retailer's active Plan for *this* service *before* the per-minute
 *   rate-limit, keeping billing enforcement (quota-per-month) cleanly
 *   separated from abuse prevention (rate-per-minute).
 */
export async function authorizeWidgetRequest(
    request: NextRequest,
    cors: Record<string, string>,
    scope: Service,
): Promise<WidgetAuthResult> {
    // 1. Public per-service key (sent by the widget as X-Manikan-Key).
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

    // 3. Resolve the key → its ServiceApiKey row → its retailer. A key minted
    //    for one service can never authorize a different one: this is what
    //    makes the three services genuinely independent, not just separately
    //    billed with a shared credential.
    const serviceKey = await prisma.serviceApiKey.findUnique({
        where: { apiKey: key },
        include: { retailer: true },
    });
    if (!serviceKey || !serviceKey.isActive || serviceKey.service !== scope || !serviceKey.retailer.isActivated) {
        return { ok: false, response: forbidden(cors) };
    }
    const retailer = serviceKey.retailer;

    // 4. Origin allowlist (stored in retailer.widgetSettings.allowedOrigins).
    //    Shared across all three services -- it's the same storefront domain
    //    regardless of which services that retailer has subscribed to.
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

    // 5. Monthly billing quota for THIS service specifically.
    //     This is a BILLING concern — "has the retailer exceeded their monthly
    //     allocation for this service?" — and is entirely separate from the
    //     per-minute rate-limit in step 6 which is an ABUSE-PREVENTION concern.
    const quotaCheck = await checkServiceQuota(retailer.id, scope, cors);
    if (!quotaCheck.ok) {
        return quotaCheck;
    }
    const activeSubscription = quotaCheck.subscription;

    // 6. Rate limit (per-retailer fixed-window stub).
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

    return { ok: true, retailer, subscription: activeSubscription };
}

/**
 * Safely increments currentPeriodUsage on the (already single-service) active
 * subscription, and upserts a daily rollup log.
 * This is executed asynchronously (best-effort) so it NEVER blocks the upstream API response.
 */
export function consumeQuota(subscriptionId: string, scope: Service) {
    if (!subscriptionId || !scope) return;

    // Fire and forget
    Promise.resolve().then(async () => {
        try {
            const sub = await prisma.subscription.findUnique({
                where: { id: subscriptionId },
                select: { retailerId: true }
            });

            if (!sub) return;

            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            await Promise.all([
                prisma.subscription.update({
                    where: { id: subscriptionId },
                    data: { currentPeriodUsage: { increment: 1 } }
                }),
                prisma.serviceUsageDailyRollup.upsert({
                    where: {
                        retailerId_service_date: {
                            retailerId: sub.retailerId,
                            service: scope,
                            date: today
                        }
                    },
                    update: { count: { increment: 1 } },
                    create: {
                        retailerId: sub.retailerId,
                        service: scope,
                        date: today,
                        count: 1
                    }
                })
            ]);
        } catch (error) {
            console.error("Failed to meter service usage:", error);
        }
    });
}
