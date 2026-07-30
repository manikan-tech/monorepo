import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";
import { authorizeWidgetRequest } from "../../lib/widget-auth";

// ─── POST /api/tryon ───
// Orchestrator proxy for the embeddable widget's 3D virtual try-on.
// The widget NEVER calls the Python Body Service directly (MANIKAN_PROJECT.md).
//
// Flow:
//   0. Security gate (Phase 3b): key + fail-closed Origin + allowlist + rate
//      limit — see lib/widget-auth.ts.
//   1. Validate the incoming measurements + product/size.
//   2. Resolve the product + variant from the DB — the DB is the source of
//      truth for garment colour/measurements (not trusted from the client) —
//      and verify it belongs to the authenticated retailer (tenant isolation).
//   3. Proxy to the Body Service /generate-dressed-avatar (returns a .glb).
//   4. Persist a MeasurementSession (retailerId from the authenticated retailer;
//      customerId best-effort from the cookie; shopperRef = the widget's
//      anonymous visitor token).
//   5. Stream the .glb back to the widget with CORS headers.

const BODY_SERVICE_URL = process.env.BODY_SERVICE_URL || "http://localhost:8001";

// Embeddable widget runs cross-origin on retailer sites → CORS must allow the
// key header. NOTE: CORS is NOT the security boundary (it's browser-enforced);
// the server-side Origin allowlist in widget-auth.ts is. See § Security docs.
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Manikan-Key",
    "Access-Control-Expose-Headers": "X-Manikan-Session-Id",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
    // ── 0. Security gate (key + fail-closed Origin + allowlist + rate limit) ──
    const auth = await authorizeWidgetRequest(request, CORS_HEADERS, "BODY_MODELING");
    if (!auth.ok) {
        return auth.response;
    }
    const { retailer } = auth;

    // ── 1. Parse body ──
    let body: {
        product_id?: string;
        size?: string;
        sex?: string;
        height_cm?: number;
        weight_kg?: number;
        chest_cm?: number;
        waist_cm?: number;
        hips_cm?: number;
        recommended_size?: string;
        shopper_ref?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const {
        product_id,
        size,
        sex,
        height_cm,
        weight_kg,
        chest_cm,
        waist_cm,
        hips_cm,
        recommended_size,
        shopper_ref,
    } = body;

    // ── 2. Validate required inputs ──
    if (!product_id || !size) {
        return NextResponse.json(
            { error: "product_id and size are required" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const measurements = { sex, height_cm, weight_kg, chest_cm, waist_cm, hips_cm };
    for (const [key, value] of Object.entries(measurements)) {
        if (value === undefined || value === null) {
            return NextResponse.json(
                { error: `Missing measurement: ${key}` },
                { status: 400, headers: CORS_HEADERS }
            );
        }
    }

    // ── 3. Resolve product + variant (DB is source of truth for garment data) ──
    const product = await prisma.product.findUnique({
        where: { id: product_id },
        include: { variants: true },
    });

    if (!product || !product.isActive) {
        return NextResponse.json(
            { error: "Product not found" },
            { status: 404, headers: CORS_HEADERS }
        );
    }

    // Tenant isolation: the product must belong to the authenticated retailer.
    // 404 (not 403) so we don't reveal that another tenant's product exists.
    if (product.retailerId !== retailer.id) {
        return NextResponse.json(
            { error: "Product not found" },
            { status: 404, headers: CORS_HEADERS }
        );
    }

    const variant = product.variants.find((v) => v.sizeLabel === size);
    if (!variant) {
        return NextResponse.json(
            { error: `Size "${size}" not available for this product` },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    // Garment data must be present for a 3D try-on (only try-on-enabled products qualify)
    if (
        product.tshirtColorHex === null ||
        variant.garmentChestCm === null ||
        variant.garmentLengthCm === null ||
        variant.garmentSleeveCm === null ||
        variant.garmentShoulderCm === null
    ) {
        return NextResponse.json(
            { error: "This product is not enabled for virtual try-on" },
            { status: 422, headers: CORS_HEADERS }
        );
    }

    // ── 4. Proxy to the Body Service ──
    // Resolve the product photo to an ABSOLUTE URL so the Body Service (which has
    // no catalog/DB access) can fetch it for garment texturing. Demo t-shirts use
    // a relative path served from this app's /public; the rest of the catalog uses
    // absolute Supabase Storage URLs — normalize both to absolute here.
    const productImageUrl = product.imageUrl
        ? product.imageUrl.startsWith("http")
            ? product.imageUrl
            : new URL(product.imageUrl, request.nextUrl.origin).toString()
        : null;

    let glb: ArrayBuffer;
    try {
        const upstream = await fetch(`${BODY_SERVICE_URL}/generate-dressed-avatar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sex,
                height_cm,
                weight_kg,
                chest_cm,
                waist_cm,
                hips_cm,
                tshirt_color_hex: product.tshirtColorHex,
                garment_chest_cm: variant.garmentChestCm,
                garment_length_cm: variant.garmentLengthCm,
                garment_sleeve_cm: variant.garmentSleeveCm,
                garment_shoulder_cm: variant.garmentShoulderCm,
                product_id: product.id,
                product_image_url: productImageUrl,
            }),
        });

        if (!upstream.ok) {
            const detail = await upstream.json().catch(() => ({}));
            return NextResponse.json(
                { error: detail.detail || "Body service error" },
                { status: upstream.status, headers: CORS_HEADERS }
            );
        }

        glb = await upstream.arrayBuffer();
    } catch (error) {
        console.error("Body service unreachable:", error);
        return NextResponse.json(
            { error: "Body service unreachable" },
            { status: 502, headers: CORS_HEADERS }
        );
    }

    // ── 5. Persist MeasurementSession ──
    // Identity, in precedence order:
    //   customerId  → our own storefront Customer (best-effort, from cookie;
    //                 usually null for cross-origin embeds).
    //   shopperRef  → anonymous visitor token from the widget's localStorage
    //                 (MVP Tier 2). Lets a returning shopper's sessions link
    //                 without any login.
    // ─── TODO(Enterprise — Tier 3 Identity): NOT YET IMPLEMENTED ───
    //   When a retailer passes a signed `customerRef` (HMAC over their own
    //   logged-in customer id, verified with a per-retailer shared secret),
    //   it should TAKE PRECEDENCE over the anonymous shopperRef and enable
    //   cross-device continuity. See docs/enterprise-roadmap.md § Identity.
    let sessionId = "none";
    try {
        const customer = await getCustomerFromCookies();
        const session = await prisma.measurementSession.create({
            data: {
                retailerId: retailer.id,
                customerId: customer?.sub ?? null,
                shopperRef: shopper_ref ?? null,
                productId: product.id,
                heightCm: height_cm!,
                weightKg: weight_kg!,
                chestCm: chest_cm!,
                waistCm: waist_cm!,
                hipsCm: hips_cm!,
                recommendedSize: recommended_size ?? null,
            },
        });
        sessionId = session.id;
    } catch (error) {
        // A persistence failure must not break the shopper's try-on experience.
        console.error("Failed to save MeasurementSession:", error);
    }

    // ── 5.5 Deduct Quota ──
    if (auth.subscription) {
        const { consumeQuota } = await import("../../lib/widget-auth");
        await consumeQuota(auth.subscription.id, "BODY_MODELING");
    }

    // ── 6. Stream the .glb back ──
    return new NextResponse(glb, {
        status: 200,
        headers: {
            ...CORS_HEADERS,
            "Content-Type": "model/gltf-binary",
            "X-Manikan-Session-Id": sessionId,
        },
    });
}
