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
//  4b. (Optional) Monthly billing quota ............ else 429
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
    | { ok: true; retailer: Retailer; subscription?: { id: string } }
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

/**
 * @param scope — Optional service scope (e.g. "BODY_MODELING", "VTON_2D",
 *   "RECOMMENDATION"). When provided the gate enforces the monthly billing
 *   quota defined on the retailer's active Plan *before* the per-minute
 *   rate-limit. This keeps billing enforcement (quota-per-month) cleanly
 *   separated from abuse prevention (rate-per-minute).
 */
export async function authorizeWidgetRequest(
    request: NextRequest,
    cors: Record<string, string>,
    scope?: string,
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

    // 4b. Monthly billing quota (only when a scope is provided).
    //     This is a BILLING concern — "has the retailer exceeded their monthly
    //     allocation?" — and is entirely separate from the per-minute rate-limit
    //     in step 5 which is an ABUSE-PREVENTION concern.
    let activeSubscription: { id: string } | undefined = undefined;

    if (scope) {
        const subscription = await prisma.subscription.findFirst({
            where: { retailerId: retailer.id, status: "ACTIVE" },
            include: { plan: true },
            orderBy: { createdAt: "desc" },
        });

        if (!subscription || !subscription.plan) {
            // No active subscription → no quota at all.
            return {
                ok: false,
                response: NextResponse.json(
                    {
                        error: "No active subscription. Please subscribe to a plan.",
                        code: "NO_SUBSCRIPTION",
                    },
                    { status: 429, headers: cors }
                ),
            };
        }

        const quotas = (subscription.plan.quotas ?? {}) as Record<string, number>;
        const maxAllowed = quotas[scope] ?? 0;

        const usage = (subscription.currentPeriodUsage ?? {}) as Record<string, number>;
        const currentUsage = usage[scope] ?? 0;

        if (currentUsage >= maxAllowed) {
            return {
                ok: false,
                response: NextResponse.json(
                    {
                        error: "Quota exceeded. Upgrade your plan to continue using this service.",
                        code: "QUOTA_EXCEEDED",
                        usage: currentUsage,
                        limit: maxAllowed,
                        scope,
                    },
                    { status: 429, headers: cors }
                ),
            };
        }

        activeSubscription = { id: subscription.id };
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

    return { ok: true, retailer, subscription: activeSubscription };
}

/**
 * Safely increments the currentPeriodUsage for a specific scope on the active subscription,
 * and upserts a daily rollup log.
 * This is executed asynchronously (best-effort) so it NEVER blocks the upstream API response.
 */
export function consumeQuota(subscriptionId: string, scope: string) {
    if (!subscriptionId || !scope) return;

    // Fire and forget
    Promise.resolve().then(async () => {
        try {
            const sub = await prisma.subscription.findUnique({
                where: { id: subscriptionId },
                select: { currentPeriodUsage: true, retailerId: true }
            });

            if (!sub) return;

            const currentUsage = (sub.currentPeriodUsage ?? {}) as Record<string, number>;
            const updatedUsage = {
                ...currentUsage,
                [scope]: (currentUsage[scope] || 0) + 1
            };

            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            await Promise.all([
                prisma.subscription.update({
                    where: { id: subscriptionId },
                    data: { currentPeriodUsage: updatedUsage }
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

