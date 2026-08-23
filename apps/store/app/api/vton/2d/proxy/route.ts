import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCustomerFromCookies } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { checkServiceQuota, consumeQuota } from "../../../../lib/widget-auth";

const MAX_HUMAN_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const CUSTOMER_RATE_LIMIT_MAX = 5;
const CUSTOMER_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function jsonError(requestId: string, status: number, error: string) {
    return NextResponse.json({ error, requestId }, { status });
}

function isSameOriginBrowserRequest(request: NextRequest): boolean {
    const origin = request.headers.get("origin");
    return origin === request.nextUrl.origin;
}

/**
 * Storefront-only gateway for 2D try-on.
 *
 * The browser authenticates with its HttpOnly customer session; this route
 * resolves the selected product on the server and injects the server-only
 * VTON_2D key when forwarding to the protected service route. In particular,
 * it never accepts garment_image_url or X-Manikan-Key from the browser.
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get("x-request-id") || randomUUID();

    // Cookie-authenticated POST endpoints need a CSRF boundary. A browser fetch
    // from this origin sends Origin; cross-origin forms/fetches do not match it.
    if (!isSameOriginBrowserRequest(request)) {
        return jsonError(requestId, 403, "Forbidden");
    }

    const customer = await getCustomerFromCookies();
    if (!customer) {
        return jsonError(requestId, 401, "Unauthorized");
    }

    // The service credential protects the internal route, but a valid customer
    // session is still a costly capability. Limit it independently so a single
    // compromised account cannot exhaust the AI provider allowance.
    const rateLimit = checkRateLimit(
        `vton-2d:customer:${customer.sub}`,
        CUSTOMER_RATE_LIMIT_MAX,
        CUSTOMER_RATE_LIMIT_WINDOW_MS
    );
    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many virtual try-on requests. Please try again later.", requestId },
            { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
        );
    }

    try {
        const formData = await request.formData();
        const humanImage = formData.get("human_image");
        const productId = formData.get("product_id");

        if (!(humanImage instanceof File)) {
            return jsonError(requestId, 400, "human_image is required.");
        }
        if (!humanImage.type.startsWith("image/") || humanImage.size <= 0) {
            return jsonError(requestId, 400, "human_image must be a non-empty image file.");
        }
        if (humanImage.size > MAX_HUMAN_IMAGE_SIZE_BYTES) {
            return jsonError(requestId, 400, "human_image must be 5MB or smaller.");
        }
        if (typeof productId !== "string" || !productId.trim()) {
            return jsonError(requestId, 400, "product_id is required.");
        }

        // Resolve before invoking the expensive service. The client can only
        // choose an active catalog product, never an arbitrary remote URL.
        const product = await prisma.product.findFirst({
            where: { id: productId, isActive: true },
            select: { id: true, retailerId: true },
        });
        if (!product) {
            return jsonError(requestId, 404, "Product not found.");
        }

        // ── Enforce Retailer Quota (VTON_2D specifically -- independent of
        //     any BODY_MODELING/RECOMMENDATION subscription this retailer
        //     may or may not also have). Shared with the widget gate's
        //     identical check (app/lib/widget-auth.ts) rather than a second
        //     hand-rolled copy -- this route just arrives via a different
        //     auth model (customer session, not a retailer X-Manikan-Key).
        const quotaCheck = await checkServiceQuota(product.retailerId, "VTON_2D");
        if (!quotaCheck.ok) {
            return quotaCheck.response;
        }
        const subscription = quotaCheck.subscription;

        const serviceKey = process.env.VTON_2D_SERVICE_KEY;
        if (!serviceKey) {
            console.error("VTON_2D_SERVICE_KEY is not configured");
            return jsonError(requestId, 503, "Virtual try-on is temporarily unavailable.");
        }

        const upstreamFormData = new FormData();
        upstreamFormData.append("human_image", humanImage);
        upstreamFormData.append("product_id", product.id);
        upstreamFormData.append("session_id", customer.sub);

        const upstream = await fetch(new URL("/api/vton/2d", request.url), {
            method: "POST",
            headers: {
                "X-Manikan-Key": serviceKey,
                "X-Request-Id": requestId,
            },
            body: upstreamFormData,
            cache: "no-store",
        });

        if (upstream.ok) {
            // Deduct quota on success
            await consumeQuota(subscription.id, "VTON_2D");
        }

        const headers = new Headers({
            "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
        });
        return new NextResponse(upstream.body, { status: upstream.status, headers });
    } catch (error) {
        console.error("VTON storefront proxy error [%s]:", requestId, error);
        return jsonError(requestId, 502, "Virtual try-on service unreachable.");
    }
}
