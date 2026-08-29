import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";
import {
    authorizeWidgetRequest,
    commitQuotaReservation,
    releaseQuotaReservation,
    reserveQuota,
} from "../../lib/widget-auth";
import { isProductTryOnEnabled, garmentFieldsFor } from "../../lib/tryon-status";

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
// Shared secret body-service verifies on every call — proves this request
// came from this proxy, not just from something that can reach the URL.
const BODY_SERVICE_KEY = process.env.BODY_SERVICE_KEY || "";
// When Store sits behind a reverse proxy, Next's internal bind address can be
// different from the browser-facing origin. Product photos must use the
// latter because Body fetches the URL independently. Keep this server-only:
// it is deployment configuration, not a browser API.
const STORE_PUBLIC_URL = process.env.STORE_PUBLIC_URL?.replace(/\/$/, "");

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

/**
 * Resolve a product+variant for try-on, applying EVERY gate the primary
 * garment gets: existence, active, tenant isolation (404 not 403, so another
 * tenant's ids stay unguessable), the size existing, and category-correct
 * garment measurements actually being present on that variant.
 *
 * Shared by the primary garment and by `also_wear` deliberately — a layered
 * request must not be able to reach a product the caller could not request
 * on its own.
 */
async function resolveGarment(
    productId: string,
    size: string,
    retailerId: string,
    origin: string
) {
    const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { variants: true },
    });
    if (!product || !product.isActive || product.retailerId !== retailerId) {
        return { ok: false as const, status: 404, error: "Product not found" };
    }
    const variant = product.variants.find((v) => v.sizeLabel === size);
    if (!variant) {
        return {
            ok: false as const,
            status: 400,
            error: `Size "${size}" not available for this product`,
        };
    }
    const requiredFields = garmentFieldsFor(product.category);
    const variantHasGarmentData =
        requiredFields.length > 0 &&
        requiredFields.every(
            (f) => (variant as unknown as Record<string, number | null>)[f] !== null
        );
    if (!isProductTryOnEnabled(product) || !variantHasGarmentData) {
        return {
            ok: false as const,
            status: 422,
            error: "This product is not enabled for virtual try-on",
        };
    }
    // Body-service has no DB/catalog access, so the photo must be absolute.
    const imageUrl = product.imageUrl
        ? product.imageUrl.startsWith("http")
            ? product.imageUrl
            : new URL(product.imageUrl, origin).toString()
        : null;
    return { ok: true as const, product, variant, imageUrl };
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
        // Optional second garment worn at the same time (e.g. keep your pants
        // on while trying a tee). Only ids/sizes come from the client — the
        // garment's colour and measurements are resolved from the DB exactly
        // like the primary one, so a layered request cannot smuggle in values.
        also_wear?: { product_id?: string; size?: string };
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
    const publicOrigin = STORE_PUBLIC_URL || request.nextUrl.origin;
    const primary = await resolveGarment(
        product_id, size, retailer.id, publicOrigin);
    if (!primary.ok) {
        return NextResponse.json(
            { error: primary.error },
            { status: primary.status, headers: CORS_HEADERS }
        );
    }
    const { product, variant, imageUrl: productImageUrl } = primary;

    // ── 3b. Optional second garment (layered outfit) ──
    // Same resolution path, so it inherits every gate above. Must be a
    // different category: body-service layers exactly one upper over one
    // lower, and two of the same category has no meaningful drape.
    //
    // A malformed/partial `also_wear` (missing id or size, or not an object)
    // is deliberately IGNORED rather than rejected: the request then renders
    // the primary garment exactly as it always did. Failing the whole try-on
    // because an optional extra was malformed would turn a cosmetic problem
    // into a broken feature for the shopper. A well-formed one that cannot be
    // used (unknown product, wrong tenant, wrong size, not try-on-enabled)
    // still errors loudly below, so genuine mistakes are not hidden.
    let alsoWear: Record<string, unknown> | null = null;
    if (body.also_wear?.product_id && body.also_wear?.size) {
        const second = await resolveGarment(
            body.also_wear.product_id, body.also_wear.size,
            retailer.id, request.nextUrl.origin);
        if (!second.ok) {
            return NextResponse.json(
                { error: `Second garment: ${second.error}` },
                { status: second.status, headers: CORS_HEADERS }
            );
        }
        if (second.product.category === product.category) {
            return NextResponse.json(
                { error: "The second garment must be a different category" },
                { status: 400, headers: CORS_HEADERS }
            );
        }
        alsoWear = {
            category: second.product.category,
            color_hex: second.product.garmentColorHex,
            garment_chest_cm: second.variant.garmentChestCm,
            garment_waist_cm: second.variant.garmentWaistCm,
            product_id: second.product.id,
            product_image_url: second.imageUrl,
        };
    }

    // ── 4. Proxy to the Body Service ──

    const reservation = await reserveQuota(
        auth.subscription.id,
        "BODY_MODELING",
        request.headers.get("x-request-id") || randomUUID(),
        CORS_HEADERS,
    );
    if (!reservation.ok) return reservation.response;

    let glb: ArrayBuffer;
    try {
        const upstream = await fetch(`${BODY_SERVICE_URL}/generate-dressed-avatar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Manikan-Internal-Key": BODY_SERVICE_KEY,
            },
            body: JSON.stringify({
                sex,
                height_cm,
                weight_kg,
                chest_cm,
                waist_cm,
                hips_cm,
                // Wire key stays tshirt_color_hex — that's body-service's existing
                // Pydantic contract, unrelated to this DB column's name.
                tshirt_color_hex: product.garmentColorHex,
                // Category tells body-service which garment pipeline to run.
                // Defaults to tshirt there, so tee callers are unaffected.
                category: product.category,
                garment_chest_cm: variant.garmentChestCm,
                garment_length_cm: variant.garmentLengthCm,
                garment_sleeve_cm: variant.garmentSleeveCm,
                garment_shoulder_cm: variant.garmentShoulderCm,
                garment_waist_cm: variant.garmentWaistCm,
                garment_hip_cm: variant.garmentHipCm,
                garment_inseam_cm: variant.garmentInseamCm,
                garment_rise_cm: variant.garmentRiseCm,
                product_id: product.id,
                product_image_url: productImageUrl,
                // Omitted entirely when there is no second garment, so the
                // body-service request is byte-identical to before for every
                // existing single-garment caller.
                ...(alsoWear ? { also_wear: alsoWear } : {}),
            }),
        });

        if (!upstream.ok) {
            const detail = await upstream.json().catch(() => ({}));
            await releaseQuotaReservation(reservation.reservation.id);
            return NextResponse.json(
                { error: detail.detail || "Body service error" },
                { status: upstream.status, headers: CORS_HEADERS }
            );
        }

        glb = await upstream.arrayBuffer();
    } catch (error) {
        await releaseQuotaReservation(reservation.reservation.id);
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

    await commitQuotaReservation(reservation.reservation.id);

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
