import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { authorizeWidgetRequest } from "../../../../../lib/widget-auth";

// ─── GET /api/widget/products/[id]/colors ───
// Returns colour siblings for a product — same name, category, and retailer,
// different colour. Used by the widget's outfit-layering card to let the shopper
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Manikan-Key",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authorizeWidgetRequest(request, CORS_HEADERS, "BODY_MODELING");
    if (!auth.ok) {
        return auth.response;
    }
    const { retailer } = auth;

    const { id: productIdentifier } = await params;

    const product = await prisma.product.findFirst({
        where: {
            retailerId: retailer.id,
            isActive: true,
            OR: [{ id: productIdentifier }, { productCode: productIdentifier }],
        },
        select: {
            id: true,
            name: true,
            category: true,
            retailerId: true,
            garmentColorHex: true,
            styleCode: true,
        },
    });

    if (!product) {
        return NextResponse.json(
            { error: "Product not found" },
            { status: 404, headers: CORS_HEADERS }
        );
    }

    // Find sibling products (same styleCode, or same name if no styleCode)
    const siblings = await prisma.product.findMany({
        where: {
            retailerId: product.retailerId,
            category: product.category,
            isActive: true,
            id: { not: product.id },
            ...(product.styleCode
                ? { styleCode: product.styleCode }
                : { name: product.name }
            ),
        },
        select: {
            id: true,
            garmentColorHex: true,
            imageUrl: true,
            name: true,
        },
        orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
        {
            currentColorHex: product.garmentColorHex,
            siblings: siblings.map((s) => ({
                id: s.id,
                color_hex: s.garmentColorHex,
                image: s.imageUrl,
                name: s.name,
            })),
        },
        { status: 200, headers: CORS_HEADERS }
    );
}
