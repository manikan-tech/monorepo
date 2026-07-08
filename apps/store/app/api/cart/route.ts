import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";

// ─── GET /api/cart ─── list all cart items for the current customer
export async function GET() {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cartItems = await prisma.cartItem.findMany({
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
                },
            },
            variant: {
                select: {
                    id: true,
                    sizeLabel: true,
                    sku: true,
                    stock: true,
                    priceOverride: true,
                },
            },
        },
        orderBy: { createdAt: "asc" },
    });

    // Calculate totals
    const subtotal = cartItems.reduce((sum, item) => {
        const basePrice = item.variant.priceOverride ?? item.product.priceEgp;
        const discountedPrice = basePrice * (1 - item.product.discountPct / 100);
        return sum + discountedPrice * item.quantity;
    }, 0);

    return NextResponse.json({ cartItems, subtotal }, { status: 200 });
}

// ─── POST /api/cart ─── add item to cart (upserts if already exists)
export async function POST(request: NextRequest) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { productId?: string; variantId?: string; quantity?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { productId, variantId, quantity = 1 } = body;

    if (!productId || !variantId) {
        return NextResponse.json(
            { error: "productId and variantId are required" },
            { status: 400 }
        );
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        return NextResponse.json(
            { error: "quantity must be a positive integer" },
            { status: 400 }
        );
    }

    // Validate variant exists and belongs to the product
    const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: { product: { select: { name: true, isActive: true } } },
    });

    if (!variant || variant.productId !== productId) {
        return NextResponse.json(
            { error: "Product variant not found" },
            { status: 404 }
        );
    }

    // Reject inactive products
    if (!variant.product.isActive) {
        return NextResponse.json(
            { error: `"${variant.product.name}" is no longer available` },
            { status: 410 }
        );
    }

    if (variant.stock === 0) {
        return NextResponse.json(
            { error: `"${variant.product.name}" (${variant.sizeLabel}) is out of stock` },
            { status: 409 }
        );
    }

    if (variant.stock < quantity) {
        return NextResponse.json(
            { error: `Only ${variant.stock} items left in stock` },
            { status: 409 }
        );
    }

    // Upsert cart item (increment quantity if already added with same variant)
    const existing = await prisma.cartItem.findUnique({
        where: {
            customerId_productId_variantId: {
                customerId: customer.sub,
                productId,
                variantId,
            },
        },
    });

    let cartItem;
    if (existing) {
        const newQuantity = existing.quantity + quantity;

        if (variant.stock < newQuantity) {
            return NextResponse.json(
                {
                    error: `Cannot add ${quantity} more. Only ${variant.stock - existing.quantity} additional items available.`,
                },
                { status: 409 }
            );
        }

        cartItem = await prisma.cartItem.update({
            where: { id: existing.id },
            data: { quantity: newQuantity },
        });
    } else {
        cartItem = await prisma.cartItem.create({
            data: {
                customerId: customer.sub,
                productId,
                variantId,
                quantity,
            },
        });
    }

    return NextResponse.json({ cartItem }, { status: 201 });
}

// ─── DELETE /api/cart ─── clear the entire cart
export async function DELETE() {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.cartItem.deleteMany({
        where: { customerId: customer.sub },
    });

    return NextResponse.json(
        { message: "Cart cleared successfully" },
        { status: 200 }
    );
}
