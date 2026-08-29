import { NextRequest, NextResponse } from "next/server";

import { authorizeWidgetRequest, consumeQuota } from "../../../lib/widget-auth";
import { assessFitRange, buildFitRangeResponse } from "../../../lib/fit-range";
import { asksForProductDetails, buildProductDetailsContext } from "../../../lib/product-details";
import { buildBodyFitChartCsv } from "../../../lib/size-chart";
import { prisma } from "../../../lib/prisma";
import { getCustomerFromCookies } from "../../../lib/auth";

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

function isUserMessage(value: unknown): value is { role: string; content?: unknown } {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as { role?: unknown }).role === "user"
    );
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
    // ── Security gate (key + fail-closed Origin + allowlist + quota + rate limit) ──
    const auth = await authorizeWidgetRequest(
        request,
        CORS_HEADERS,
        "RECOMMENDATION"
    );

    if (!auth.ok) {
        return auth.response;
    }

    const { retailer } = auth;
    const customer = await getCustomerFromCookies();

    let body: {
        session_id?: string;
        messages?: unknown[];
        betas?: unknown;
        product_id?: string;
        product_name?: string;
        intent?: string;
        selected_category?: string;
        available_categories?: string[];
        catalog_products?: unknown[];
        pending_state?: any;
        shown_product_ids?: string[];
        active_search?: any;
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
    const {
        session_id,
        messages,
        betas,
        product_id,
        product_name,
        intent,
        selected_category,
        available_categories,
        catalog_products,
        pending_state,
        shown_product_ids,
        active_search,
    } = body;

    if (!session_id || !Array.isArray(messages)) {
        return NextResponse.json(
            { error: "session_id and messages are required" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    // ── Build trusted safe profile context server-side ──
    let profileContext:
        | {
              first_name?: string;
              saved_measurements?: {
                  height_cm: number;
                  weight_kg: number;
                  chest_cm: number;
                  waist_cm: number;
                  hips_cm: number;
              };
              previous_product_size?: string;
              recent_fit_history: Array<{
                  product_id: string;
                  product_name?: string;
                  recommended_size?: string;
                  confidence_score?: number;
                  created_at?: string;
              }>;
          }
        | undefined;

    if (customer) {
        const recentSessions = await prisma.measurementSession.findMany({
            where: {
                customerId: customer.sub,
                retailerId: retailer.id,
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 5,
            select: {
                productId: true,
                heightCm: true,
                weightKg: true,
                chestCm: true,
                waistCm: true,
                hipsCm: true,
                recommendedSize: true,
                confidenceScore: true,
                createdAt: true,
                product: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        const latestSession = recentSessions[0];

        const previousProductSession = product_id
            ? recentSessions.find(
                  (session) =>
                      session.productId === product_id &&
                      Boolean(session.recommendedSize)
              )
            : undefined;

        profileContext = {
            first_name: customer.firstName ?? undefined,

            saved_measurements: latestSession
                ? {
                      height_cm: latestSession.heightCm,
                      weight_kg: latestSession.weightKg,
                      chest_cm: latestSession.chestCm,
                      waist_cm: latestSession.waistCm,
                      hips_cm: latestSession.hipsCm,
                  }
                : undefined,

            previous_product_size:
                previousProductSession?.recommendedSize ?? undefined,

            recent_fit_history: recentSessions.map((session) => ({
                product_id: session.productId,
                product_name: session.product.name,
                recommended_size: session.recommendedSize ?? undefined,
                confidence_score: session.confidenceScore ?? undefined,
                created_at: session.createdAt.toISOString(),
            })),
        };
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
    let productDetailsContext: string | undefined;
    let isProductDetailsQuestion = false;

    if (product_id) {
        const product = await prisma.product.findUnique({
            where: { id: product_id },
            select: {
                retailerId: true,
                name: true,
                category: true,
                brand: true,
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

        // Let the existing AI answer the product-detail question, but give it
        // a trusted selected-product brief so each question can receive a
        // context-specific answer instead of a repeated static summary.
        if (asksForProductDetails(messages)) {
            isProductDetailsQuestion = true;
            productDetailsContext = buildProductDetailsContext(product);
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
    if (sizeChart && !productDetailsContext) {
        const lastUserMsg = messages.slice().reverse().find(isUserMessage);

        const query = typeof lastUserMsg?.content === "string"
            ? lastUserMsg.content.toLowerCase().trim()
            : "";

        const explicitSizingPhrases = [
            "use my saved measurements",
            "use my measurements",
            "what size fits me",
            "what size would fit me",
            "find my size",
            "calculate my size",
            "recommend my size",
            "check my fit"
        ];

        const isSizingIntent =
            query.startsWith("my measurements:") ||
            explicitSizingPhrases.some(phrase => query.includes(phrase));

        if (isSizingIntent) {
            const fitRange = assessFitRange(betas, sizeChart);

            if (fitRange) {
                return NextResponse.json(
                    { success: true, ...buildFitRangeResponse(fitRange) },
                    { status: 200, headers: CORS_HEADERS }
                );
            }
        }
    }

    // ── Proxy to the Recommendation Service ──

    // retailer_id and size_chart both come from server-side lookups, never
    // the client — same "server resolves identity, never trusts the caller"
    // rule /api/tryon applies to product/variant data.
    try {
        console.time("Prisma Categories");
        const distinctCategories = await prisma.product.findMany({ select: { category: true }, distinct: ['category'], where: { isActive: true, retailerId: retailer.id } });
        const authCategories = distinctCategories.filter(c => c.category).map(c => c.category as string);
        console.timeEnd("Prisma Categories");
        
        console.time("Prisma Departments");
        const distinctDepartments = await prisma.product.findMany({ select: { gender: true }, distinct: ['gender'], where: { isActive: true, retailerId: retailer.id } });
        const authDepartments = distinctDepartments.filter(c => c.gender).map(c => c.gender as string);
        console.timeEnd("Prisma Departments");
        
        console.time("Prisma Brands");
        const distinctBrands = await prisma.product.findMany({ select: { brand: true }, distinct: ['brand'], where: { isActive: true, retailerId: retailer.id } });
        const authBrands = distinctBrands.filter(c => c.brand).map(c => c.brand as string);
        console.timeEnd("Prisma Brands");
        
        console.time("Prisma Mapping");
        const categoryGenders = await prisma.product.findMany({ select: { category: true, gender: true }, distinct: ['category', 'gender'], where: { isActive: true, retailerId: retailer.id } });
        const categoryDepartmentMapping: Record<string, string[]> = {};
        categoryGenders.forEach(p => {
            if (p.category && p.gender) {
                const departments = categoryDepartmentMapping[p.category] ?? [];
                departments.push(p.gender);
                categoryDepartmentMapping[p.category] = departments;
            }
        });
        console.timeEnd("Prisma Mapping");

        console.time("Fetch FastAPI");
        const upstream = await fetch(
            `${RECOMMENDATION_SERVICE_URL}/recommend`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Manikan-Internal-Key": RECOMMENDATION_SERVICE_KEY,
                },
                body: JSON.stringify({
                    session_id,

                    // Store appends this trusted system message after client chat
                    // history so it takes precedence over generic fit context for
                    // product-information questions. The Python workflow remains unchanged.
                    messages: productDetailsContext
                        ? [
                              ...messages,
                              {
                                  role: "system",
                                  content: productDetailsContext,
                              },
                          ]
                        : messages,

                    betas,
                    product_id,
                    product_name,
                    retailer_id: retailer.id,
                    profile_context: profileContext,
                    product_detail_question: isProductDetailsQuestion,
                    intent,
                    selected_category,
                    available_categories: authCategories.length > 0 ? authCategories : available_categories,
                    available_departments: authDepartments,
                    available_brands: authBrands,
                    category_department_mapping: categoryDepartmentMapping,
                    catalog_products,
                    pending_state,
                    shown_product_ids,
                    active_search,

                    ...(sizeChart ? { size_chart: sizeChart } : {}),
                }),
            }
        );

        const payload = await upstream.json().catch(() => ({}));
        console.timeEnd("Fetch FastAPI");

        if (!upstream.ok) {
            return NextResponse.json(
                {
                    error:
                        payload.detail || "Recommendation service error",
                },
                {
                    status: upstream.status,
                    headers: CORS_HEADERS,
                }
            );
        }

        // ── Deduct Quota ──
        if (auth.subscription) {
            await consumeQuota(
                auth.subscription.id,
                "RECOMMENDATION"
            );
        }

        return NextResponse.json(payload, {
            status: 200,
            headers: CORS_HEADERS,
        });
    } catch (error) {
        console.error("Recommendation service unreachable:", error);

        return NextResponse.json(
            { error: "Recommendation service unreachable" },
            { status: 502, headers: CORS_HEADERS }
        );
    }
}
