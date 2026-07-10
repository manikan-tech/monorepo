import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";

// ─── POST /api/tryon ───
// Orchestrator proxy for the embeddable widget's 3D virtual try-on.
// The widget NEVER calls the Python Body Service directly (MANIKAN_PROJECT.md).
//
// Flow:
//   1. Validate the incoming measurements + product/size.
//   2. Resolve the product + variant from the DB — the DB is the source of
//      truth for garment colour/measurements (not trusted from the client).
//   3. Proxy to the Body Service /generate-dressed-avatar (returns a .glb).
//   4. Persist a MeasurementSession (retailerId derived server-side from the
//      product; customerId best-effort from the cookie).
//   5. Stream the .glb back to the widget with CORS headers.

const BODY_SERVICE_URL = process.env.BODY_SERVICE_URL || "http://localhost:8001";

// Embeddable widget runs cross-origin on retailer sites → permissive CORS.
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Manikan-Session-Id",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
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

    // ── 5. Persist MeasurementSession (customerId best-effort) ──
    let sessionId = "none";
    try {
        const customer = await getCustomerFromCookies();
        const session = await prisma.measurementSession.create({
            data: {
                retailerId: product.retailerId,
                customerId: customer?.sub ?? null,
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
