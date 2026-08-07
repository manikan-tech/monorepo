import { NextRequest, NextResponse } from "next/server";
import { authorizeWidgetRequest, consumeQuota } from "../../../lib/widget-auth";

// ─── POST /api/widget/recommend ───
// Thin proxy for the embeddable recommendation-service widget. Enforces the
// same "widget never calls the Python service directly" rule the body/tryon
// widgets already follow, gated by the same security gate (key + fail-closed
// Origin + allowlist + quota + rate limit) as every other widget route.

const RECOMMENDATION_SERVICE_URL =
    process.env.RECOMMENDATION_SERVICE_URL || "http://localhost:8002";
// Shared secret recommendation-service verifies on every call — proves this
// request came from this proxy, not just from something that can reach the URL.
const RECOMMENDATION_SERVICE_KEY = process.env.RECOMMENDATION_SERVICE_KEY || "";

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Manikan-Key",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
    // ── Security gate (key + fail-closed Origin + allowlist + quota + rate limit) ──
    const auth = await authorizeWidgetRequest(request, CORS_HEADERS, "RECOMMENDATION");
    if (!auth.ok) {
        return auth.response;
    }
    const { retailer } = auth;

    let body: {
        session_id?: string;
        messages?: unknown[];
        betas?: number[];
        product_id?: string;
        size_chart?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const { session_id, messages, betas, product_id, size_chart } = body;
    if (!session_id || !Array.isArray(messages)) {
        return NextResponse.json(
            { error: "session_id and messages are required" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    // ── Proxy to the Recommendation Service ──
    // retailer_id comes from the authenticated retailer, never the client —
    // same "server resolves identity, never trusts the caller" rule /api/tryon
    // applies to product/variant data.
    try {
        const upstream = await fetch(`${RECOMMENDATION_SERVICE_URL}/recommend`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Manikan-Internal-Key": RECOMMENDATION_SERVICE_KEY,
            },
            body: JSON.stringify({
                session_id,
                messages,
                betas,
                product_id,
                size_chart,
                retailer_id: retailer.id,
            }),
        });

        const payload = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
            return NextResponse.json(
                { error: payload.detail || "Recommendation service error" },
                { status: upstream.status, headers: CORS_HEADERS }
            );
        }

        // ── Deduct Quota ──
        if (auth.subscription) {
            await consumeQuota(auth.subscription.id, "RECOMMENDATION");
        }

        return NextResponse.json(payload, { status: 200, headers: CORS_HEADERS });
    } catch (error) {
        console.error("Recommendation service unreachable:", error);
        return NextResponse.json(
            { error: "Recommendation service unreachable" },
            { status: 502, headers: CORS_HEADERS }
        );
    }
}
