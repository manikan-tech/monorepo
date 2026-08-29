import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { authorizeWidgetRequest } from "../../../../lib/widget-auth";
import { isProductTryOnEnabled } from "../../../../lib/tryon-status";

// ─── GET /api/widget/products/[id] ───
// Public, CORS-enabled product endpoint for the embeddable widget. Gated by the
// SAME auth as /api/tryon (X-Manikan-Key + fail-closed Origin allowlist + rate
// limit). Returns the product shaped for the widget, including `isTryOnEnabled`
// so the widget can pick the 3D try-on flow vs. a "coming soon" state WITHOUT
// firing a request that would 422. Kept in our own /api/widget namespace so we
// never have to add CORS to the storefront's own /api/products routes.

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Manikan-Key",
};

// Render size pills in a sensible order rather than DB/insertion order.
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // ── Security gate (key + fail-closed Origin + allowlist + rate limit) ──
    // Scoped to BODY_MODELING, not RECOMMENDATION -- the only real callers of
    // this route are the 3D try-on widget's product picker (App.jsx) and the
    // embeddable widget (EmbedWidget.jsx), both of which follow this call
    // straight into /api/tryon or /api/avatar, which are BODY_MODELING-scoped.
    // A retailer subscribed only to Body Modeling (not Recommendation) was
    // getting a 403 here before ever reaching the try-on flow itself.
    const auth = await authorizeWidgetRequest(request, CORS_HEADERS, "BODY_MODELING");
    if (!auth.ok) {
        return auth.response;
    }
    const { retailer } = auth;

    const { id } = await params;

    const product = await prisma.product.findUnique({
        where: { id },
        include: { variants: true },
    });

    // Existence + tenant isolation. 404 (not 403) so we never reveal that
    // another tenant's product exists.
    if (!product || !product.isActive || product.retailerId !== retailer.id) {
        return NextResponse.json(
            { error: "Product not found" },
            { status: 404, headers: CORS_HEADERS }
        );
    }

    // Try-on-enabled only if the product has a garment colour AND every variant
    // carries the flat garment measurements the 3D engine needs for THIS
    // product's category (matches the requirements /api/tryon enforces).
    // Shared with the retailer routes via CATEGORY_GARMENT_FIELDS so the two
    // can never drift apart.
    const isTryOnEnabled = isProductTryOnEnabled(product);

    // Map DB shape → the shape the widget components already consume.
    const sortedVariants = [...product.variants].sort(
        (a, b) => SIZE_ORDER.indexOf(a.sizeLabel) - SIZE_ORDER.indexOf(b.sizeLabel)
    );
    // Size payload is category-shaped: the widget needs the measurements that
    // actually drive that category's fit, not a tee-shaped object with nulls.
    const sizes: Record<string, Record<string, number | null>> = {};
    for (const v of sortedVariants) {
        sizes[v.sizeLabel] =
            product.category === "pants"
                ? {
                      waist_width_cm: v.garmentWaistCm,
                      hip_width_cm: v.garmentHipCm,
                      inseam_cm: v.garmentInseamCm,
                      rise_cm: v.garmentRiseCm,
                  }
                : {
                      chest_width_cm: v.garmentChestCm,
                      body_length_cm: v.garmentLengthCm,
                      sleeve_length_cm: v.garmentSleeveCm,
                      shoulder_width_cm: v.garmentShoulderCm,
                  };
    }

    return NextResponse.json(
        {
            id: product.id,
            name: product.name,
            image: product.imageUrl,
            price: product.priceEgp,
            category: product.category,
            color_hex: product.garmentColorHex,
            color_name: null, // no colour name column in the DB (display-only)
            isTryOnEnabled,
            sizes,
        },
        { status: 200, headers: CORS_HEADERS }
    );
}
