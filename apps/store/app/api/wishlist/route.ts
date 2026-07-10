import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";

// ─── GET /api/wishlist ─── list all saved products for the current customer
export async function GET() {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wishlist = await prisma.wishlist.findMany({
        where: { customerId: customer.sub },
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    brand: true,
                    priceEgp: true,
                    discountPct: true,
                    imageUrl: true,
                    isActive: true,
                    categoryRef: {
                        select: { name: true, slug: true },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ wishlist }, { status: 200 });
}

// ─── POST /api/wishlist ─── save a product to the wishlist
export async function POST(request: NextRequest) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { productId?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { productId } = body;
    if (!productId) {
        return NextResponse.json(
            { error: "productId is required" },
            { status: 400 }
        );
    }

    // Verify product exists and is active
    const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true, isActive: true },
    });

    if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!product.isActive) {
        return NextResponse.json(
            { error: `"${product.name}" is no longer available` },
            { status: 410 }
        );
    }

    // Upsert to avoid duplicate entries (schema enforces unique [customerId, productId])
    await prisma.wishlist.upsert({
        where: {
            customerId_productId: {
                customerId: customer.sub,
                productId,
            },
        },
        create: {
            customerId: customer.sub,
            productId,
        },
        update: {}, // no-op if already exists
    });

    // Fetch the full item with product details for the frontend optimistic update
    const wishlistItem = await prisma.wishlist.findUnique({
        where: {
            customerId_productId: {
                customerId: customer.sub,
                productId,
            },
        },
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    brand: true,
                    priceEgp: true,
                    discountPct: true,
                    imageUrl: true,
                    isActive: true,
                },
            },
        },
    });

    return NextResponse.json({ wishlistItem }, { status: 201 });
}
