import { NextRequest, NextResponse } from "next/server";
import { Prisma, UsageReservationStatus, type Retailer } from "@prisma/client";
import { prisma } from "./prisma";
import { checkRateLimit } from "./rate-limit";
import { Service } from "./service-keys";
import { FREE_TIER_GLOBAL_CONCURRENCY_LIMITS } from "./free-tier";

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
    | { ok: true; retailer: Retailer; subscription: { id: string } }
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

export type QuotaReservationResult =
    | { ok: true; reservation: { id: string; subscriptionId: string; requestId: string } }
    | { ok: false; response: NextResponse };

// The only measured end-to-end service p95 is Body Modeling at 973.3ms.
// VTON is explicitly allowed to run for 150s (120s polling + 30s buffer), so
// reservations must safely outlive that route. 180s leaves a bounded 30s
// commit/release window without holding capacity indefinitely after a crash.
export const QUOTA_RESERVATION_TTL_MS = 180_000;
const SERIALIZATION_RETRIES = 3;

function quotaExceededResponse(
    scope: Service,
    usage: number,
    limit: number,
    cors: Record<string, string>,
): NextResponse {
    return NextResponse.json(
        {
            error: "Quota exceeded. Upgrade your plan to continue using this service.",
            code: "QUOTA_EXCEEDED",
            usage,
            limit,
            scope,
        },
        { status: 429, headers: cors },
    );
}

function freeTierCapacityResponse(
    scope: Service,
    cors: Record<string, string>,
): NextResponse {
    return NextResponse.json(
        {
            error: "The Free tier is temporarily at capacity. Please try again shortly or upgrade for priority access.",
            code: "FREE_TIER_AT_CAPACITY",
            scope,
        },
        { status: 429, headers: { ...cors, "Retry-After": "5" } },
    );
}

function isSerializationFailure(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function serializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < SERIALIZATION_RETRIES; attempt++) {
        try {
            return await prisma.$transaction(operation, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5_000,
                timeout: 10_000,
            });
        } catch (error) {
            lastError = error;
            if (!isSerializationFailure(error) || attempt === SERIALIZATION_RETRIES - 1) throw error;
        }
    }
    throw lastError;
}

async function expireStaleReservations(
    tx: Prisma.TransactionClient,
    subscriptionId: string,
    now: Date,
): Promise<void> {
    const stale = await tx.serviceUsageReservation.findMany({
        where: {
            subscriptionId,
            status: UsageReservationStatus.PENDING,
            expiresAt: { lt: now },
        },
        select: { id: true },
    });
    if (stale.length === 0) return;

    await tx.serviceUsageReservation.updateMany({
        where: { id: { in: stale.map(({ id }) => id) }, status: UsageReservationStatus.PENDING },
        data: { status: UsageReservationStatus.EXPIRED, releasedAt: now },
    });
    await tx.subscription.update({
        where: { id: subscriptionId },
        data: { currentPeriodReserved: { decrement: stale.length } },
    });
}

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

    // This is an inexpensive early rejection only. `reserveQuota()` below is
    // the authoritative concurrent admission point and also reclaims expired
    // reservations; counting reserved units here could permanently block a
    // retailer before that cleanup gets a chance to run.
    if (subscription.currentPeriodUsage >= subscription.plan.quota) {
        return {
            ok: false,
            response: quotaExceededResponse(scope, subscription.currentPeriodUsage, subscription.plan.quota, cors),
        };
    }

    return { ok: true, subscription: { id: subscription.id } };
}

/**
 * Atomically holds one quota unit before Store invokes an AI service. The
 * reservation is committed only after a successful response, so failed calls
 * are not billed. A request id is idempotent within one subscription.
 */
export async function reserveQuota(
    subscriptionId: string,
    scope: Service,
    requestId: string,
    cors: Record<string, string> = {},
): Promise<QuotaReservationResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + QUOTA_RESERVATION_TTL_MS);

    try {
        const result = await serializableTransaction(async (tx) => {
            const existing = await tx.serviceUsageReservation.findUnique({
                where: { subscriptionId_requestId: { subscriptionId, requestId } },
                select: { id: true, status: true },
            });
            if (existing) {
                if (existing.status === UsageReservationStatus.PENDING) {
                    return { kind: "in-progress" as const };
                }
                return { kind: "already-finished" as const };
            }

            await expireStaleReservations(tx, subscriptionId, now);
            const subscription = await tx.subscription.findUnique({
                where: { id: subscriptionId },
                include: { plan: true },
            });
            if (!subscription || subscription.status !== "ACTIVE" || subscription.service !== scope || !subscription.plan) {
                return { kind: "no-subscription" as const };
            }
            if (subscription.currentPeriodUsage + subscription.currentPeriodReserved >= subscription.plan.quota) {
                return {
                    kind: "exhausted" as const,
                    usage: subscription.currentPeriodUsage,
                    limit: subscription.plan.quota,
                };
            }

            const isFreePlan = subscription.plan.priceEgpMonthly === 0;
            const perRetailerLimit = subscription.plan.concurrentRequestLimit;
            if (isFreePlan && perRetailerLimit !== null && subscription.currentPeriodReserved >= perRetailerLimit) {
                return { kind: "at-capacity" as const };
            }

            if (isFreePlan) {
                // Count only live reservations. A stale reservation is safe to
                // ignore here because it cannot consume the shared Free lane
                // after its TTL; the owning subscription clears it before its
                // next admission attempt.
                const liveFreeReservations = await tx.serviceUsageReservation.count({
                    where: {
                        service: scope,
                        status: UsageReservationStatus.PENDING,
                        expiresAt: { gte: now },
                        subscription: { plan: { priceEgpMonthly: 0 } },
                    },
                });
                if (liveFreeReservations >= FREE_TIER_GLOBAL_CONCURRENCY_LIMITS[scope]) {
                    return { kind: "at-capacity" as const };
                }
            }

            const reservation = await tx.serviceUsageReservation.create({
                data: { subscriptionId, service: scope, requestId, expiresAt },
                select: { id: true },
            });
            await tx.subscription.update({
                where: { id: subscriptionId },
                data: { currentPeriodReserved: { increment: 1 } },
            });
            return { kind: "reserved" as const, id: reservation.id };
        });

        if (result.kind === "reserved") {
            return { ok: true, reservation: { id: result.id, subscriptionId, requestId } };
        }
        if (result.kind === "exhausted") {
            return { ok: false, response: quotaExceededResponse(scope, result.usage, result.limit, cors) };
        }
        if (result.kind === "at-capacity") {
            return { ok: false, response: freeTierCapacityResponse(scope, cors) };
        }
        const isDuplicateRequest = result.kind === "already-finished" || result.kind === "in-progress";
        const message = result.kind === "in-progress"
            ? "This request is already being processed."
            : result.kind === "already-finished"
                ? "This request was already completed. Start a new request to generate another result."
                : `No active subscription for ${scope}. Please subscribe to a plan.`;
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error: message,
                    code: result.kind === "in-progress"
                        ? "REQUEST_IN_PROGRESS"
                        : result.kind === "already-finished"
                            ? "REQUEST_ALREADY_COMPLETED"
                            : "NO_SUBSCRIPTION",
                    scope,
                },
                { status: isDuplicateRequest ? 409 : 429, headers: cors },
            ),
        };
    } catch (error) {
        console.error("Failed to reserve service quota:", error);
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Unable to reserve service quota. Please try again.", code: "QUOTA_UNAVAILABLE", scope },
                { status: 503, headers: cors },
            ),
        };
    }
}

/** Commit a pending reservation and its reporting rollup before responding. */
export async function commitQuotaReservation(reservationId: string): Promise<void> {
    await serializableTransaction(async (tx) => {
        const reservation = await tx.serviceUsageReservation.findUnique({
            where: { id: reservationId },
            include: { subscription: { select: { retailerId: true } } },
        });
        if (!reservation || reservation.status === UsageReservationStatus.COMMITTED) return;
        if (reservation.status !== UsageReservationStatus.PENDING) {
            throw new Error(`Cannot commit quota reservation in ${reservation.status} state`);
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        await tx.serviceUsageReservation.update({
            where: { id: reservation.id },
            data: { status: UsageReservationStatus.COMMITTED, committedAt: new Date() },
        });
        await tx.subscription.update({
            where: { id: reservation.subscriptionId },
            data: {
                currentPeriodReserved: { decrement: 1 },
                currentPeriodUsage: { increment: 1 },
            },
        });
        await tx.serviceUsageDailyRollup.upsert({
            where: {
                retailerId_service_date: {
                    retailerId: reservation.subscription.retailerId,
                    service: reservation.service,
                    date: today,
                },
            },
            update: { count: { increment: 1 } },
            create: {
                retailerId: reservation.subscription.retailerId,
                service: reservation.service,
                date: today,
                count: 1,
            },
        });
    });
}

/** Release a pending reservation after validation/upstream failure. */
export async function releaseQuotaReservation(reservationId: string): Promise<void> {
    await serializableTransaction(async (tx) => {
        const reservation = await tx.serviceUsageReservation.findUnique({
            where: { id: reservationId },
            select: { id: true, subscriptionId: true, status: true },
        });
        if (!reservation || reservation.status !== UsageReservationStatus.PENDING) return;

        await tx.serviceUsageReservation.update({
            where: { id: reservation.id },
            data: { status: UsageReservationStatus.RELEASED, releasedAt: new Date() },
        });
        await tx.subscription.update({
            where: { id: reservation.subscriptionId },
            data: { currentPeriodReserved: { decrement: 1 } },
        });
    });
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
    //    Same-origin GET requests (like fetching layer products when the widget
    //    is embedded in our own store) omit Origin, but still send Referer.
    //    A completely missing Origin AND Referer means a non-browser caller → reject.
    const originHeader = request.headers.get("origin") || request.headers.get("referer");
    if (!originHeader) {
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
    const callerOrigin = normalizeOrigin(originHeader);
    // The hosted Manikan Store is a first-party channel. It must be able to
    // use the owning retailer's public key without asking every retailer to
    // manually add Manikan's own domain to their external-site allowlist.
    // Third-party embeds still require an explicit retailer allowlist entry.
    const isFirstPartyStorefront = callerOrigin === normalizeOrigin(request.nextUrl.origin);
    if (!isFirstPartyStorefront && !allowed.includes(callerOrigin)) {
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
