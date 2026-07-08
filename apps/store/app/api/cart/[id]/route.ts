import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCustomerFromCookies } from "../../../lib/auth";

// ─── PATCH /api/cart/[id] ─── update item quantity (quantity=0 removes the item)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    let body: { quantity?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { quantity } = body;

    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0) {
        return NextResponse.json(
            { error: "quantity must be a non-negative integer" },
            { status: 400 }
        );
    }

    // Fetch the cart item and verify ownership
    const existing = await prisma.cartItem.findUnique({
        where: { id },
        include: {
            variant: { select: { stock: true } },
        },
    });

    if (!existing || existing.customerId !== customer.sub) {
        return NextResponse.json(
            { error: "Cart item not found" },
            { status: 404 }
        );
    }

    // quantity=0 means remove the item from cart
    if (quantity === 0) {
        await prisma.cartItem.delete({ where: { id } });
        return NextResponse.json(
            { message: "Item removed from cart" },
            { status: 200 }
        );
    }

    // Check available stock
    if (existing.variant.stock < quantity) {
        return NextResponse.json(
            { error: `Only ${existing.variant.stock} items available in stock` },
            { status: 409 }
        );
    }

    const cartItem = await prisma.cartItem.update({
        where: { id },
        data: { quantity },
    });

    return NextResponse.json({ cartItem }, { status: 200 });
}


// ─── DELETE /api/cart/[id] ─── remove a single item from cart
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const existing = await prisma.cartItem.findUnique({
        where: { id },
        select: { customerId: true },
    });

    if (!existing || existing.customerId !== customer.sub) {
        return NextResponse.json(
            { error: "Cart item not found" },
            { status: 404 }
        );
    }

    await prisma.cartItem.delete({ where: { id } });

    return NextResponse.json(
        { message: "Item removed from cart" },
        { status: 200 }
    );
}
