import { NextRequest, NextResponse } from "next/server";
import { authorizeWidgetRequest, consumeQuota } from "../../../lib/widget-auth";
import { assessFitRange, buildFitRangeResponse } from "../../../lib/fit-range";
import { asksForProductDetails, buildProductDetailsResponse } from "../../../lib/product-details";
import { buildBodyFitChartCsv } from "../../../lib/size-chart";
import { prisma } from "../../../lib/prisma";

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
        betas?: unknown;
        product_id?: string;
        intent?: string;
        selected_category?: string;
        available_categories?: string[];
        catalog_products?: unknown[];
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    // size_chart is intentionally not read from the body at all — see below.
    const { session_id, messages, betas, product_id, intent, selected_category, available_categories, catalog_products } = body;
    if (!session_id || !Array.isArray(messages)) {
        return NextResponse.json(
            { error: "session_id and messages are required" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    // ── Build the size chart server-side ──
    // size_chart used to come straight from the client, which handed the
    // server the exact data it then used to compute a recommendation for that
    // same client — nothing stopped a fabricated chart from manipulating its
    // own result, and a success here also bills consumeQuota. Never accept it
    // from the client now; product_id gets the same ownership check applied
    // to every other product/variant lookup in this codebase (404, not 403,
    // on a mismatch — never reveal another tenant's product id).
    let sizeChart: string | undefined;
    if (product_id) {
        const product = await prisma.product.findUnique({
            where: { id: product_id },
            select: {
                retailerId: true,
                name: true,
                category: true,
                fabric: true,
                description: true,
            },
        });
        if (!product || product.retailerId !== retailer.id) {
            return NextResponse.json(
                { error: "Product not found" },
                { status: 404, headers: CORS_HEADERS }
            );
        }

        // Product facts are already in Store's trusted database. Answer clear
        // detail questions here so a prior sizing result cannot hide the
        // selected item's description, material, or catalog colour metadata.
        if (asksForProductDetails(messages)) {
            return NextResponse.json(
                { success: true, ...buildProductDetailsResponse(product) },
                { status: 200, headers: CORS_HEADERS }
            );
        }

        // Product exists and is this retailer's — it may still have no
        // ingested body-fit data yet (builder returns null then). That is
        // not an error: omitting size_chart routes the agent to its
        // ask-for-measurements branch instead of a fabricated match.
        const csv = await buildBodyFitChartCsv(product_id, retailer.id);
        if (csv) sizeChart = csv;
    }

    // The recommendation service remains responsible for normal matching and
    // conversation. Before proxying, however, handle a deterministic product
    // fact it cannot explain precisely: measurements outside this product's
    // published chart. This prevents a generic "View items" fallback and
    // gives the shopper the relevant size, limit, and difference.
    if (sizeChart) {
        const fitRange = assessFitRange(betas, sizeChart);
        if (fitRange) {
            return NextResponse.json(
                { success: true, ...buildFitRangeResponse(fitRange) },
                { status: 200, headers: CORS_HEADERS }
            );
        }
    }

    // ── Proxy to the Recommendation Service ──
    // retailer_id and size_chart both come from server-side lookups, never
    // the client — same "server resolves identity, never trusts the caller"
    // rule /api/tryon applies to product/variant data.
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
                retailer_id: retailer.id,
                intent,
                selected_category,
                available_categories,
                catalog_products,
                ...(sizeChart ? { size_chart: sizeChart } : {}),
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
