import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";

// ─── POST /api/checkout ───
// Body: { addressId, paymentMethod, notes? }
// 1. Validates cart is not empty
// 2. Rejects inactive/deleted products (NEW)
// 3. Pre-flight stock validation
// 4. Creates Order + OrderItems in a transaction
// 5. Decrements stock with database-level race-condition guard (NEW)
//    — uses updateMany with stock >= quantity; throws if count = 0 (item sold out mid-checkout)
// 6. Clears the customer's cart
export async function POST(request: NextRequest) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
        addressId?: string;
        paymentMethod?: string;
        notes?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { addressId, paymentMethod, notes } = body;

    // ── 1. Fetch cart items ──
    const cartItems = await prisma.cartItem.findMany({
        where: { customerId: customer.sub },
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    priceEgp: true,
                    discountPct: true,
                    isActive: true,   // NEW: needed to reject inactive products
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
    });

    if (cartItems.length === 0) {
        return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });
    }

    // ── 2. Validate address if provided ──
    if (addressId) {
        const address = await prisma.address.findUnique({
            where: { id: addressId },
            select: { customerId: true },
        });

        if (!address || address.customerId !== customer.sub) {
            return NextResponse.json(
                { error: "Address not found" },
                { status: 404 }
            );
        }
    }

    // ── 3. Pre-flight validation: inactive products + stock ──
    const validationErrors: string[] = [];

    for (const item of cartItems) {
        // NEW: reject unavailable products
        if (!item.product.isActive) {
            validationErrors.push(
                `"${item.product.name}" is no longer available and must be removed from your cart`
            );
            continue; // skip stock check for unavailable products
        }

        if (item.variant.stock < item.quantity) {
            validationErrors.push(
                `"${item.product.name}" (${item.variant.sizeLabel}): only ${item.variant.stock} left in stock, you requested ${item.quantity}`
            );
        }
    }

    if (validationErrors.length > 0) {
        return NextResponse.json(
            { error: "Some items cannot be ordered", details: validationErrors },
            { status: 409 }
        );
    }

    // ── 4. Calculate totals ──
    const SHIPPING_FEE = 50; // flat rate in EGP
    let subtotal = 0;

    const orderItemsData = cartItems.map((item) => {
        const basePrice = item.variant.priceOverride ?? item.product.priceEgp;
        const unitPrice = basePrice * (1 - item.product.discountPct / 100);
        subtotal += unitPrice * item.quantity;

        return {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPriceEgp: unitPrice,
            sizeLabel: item.variant.sizeLabel,
        };
    });

    const totalEgp = subtotal + SHIPPING_FEE;

    // ── 5. Atomic transaction ──
    // Race condition fix: inside the transaction, stock is decremented ONLY if
    // `stock >= quantity` at the moment of update (database-level check).
    // If two checkouts race for the last item, only one will succeed —
    // the other's updateMany will return count=0, triggering a rollback.
    const order = await prisma.$transaction(async (tx) => {
        // Create order + items first
        const newOrder = await tx.order.create({
            data: {
                customerId: customer.sub,
                addressId: addressId ?? null,
                subtotalEgp: subtotal,
                shippingEgp: SHIPPING_FEE,
                totalEgp,
                paymentMethod: paymentMethod ?? null,
                notes: notes ?? null,
                status: "PENDING",
                items: {
                    create: orderItemsData,
                },
            },
            include: { items: true },
        });

        // Decrement stock with race-condition guard
        for (const item of cartItems) {
            const result = await tx.productVariant.updateMany({
                where: {
                    id: item.variantId,
                    stock: { gte: item.quantity }, // GUARD: only update if enough stock remains
                },
                data: { stock: { decrement: item.quantity } },
            });

            if (result.count === 0) {
                // Another request claimed the last stock between our check and now
                throw new Error(
                    `SOLD_OUT:${item.product.name} (${item.variant.sizeLabel}) sold out during checkout`
                );
            }
        }

        // Mark measurement sessions as purchased (for analytics)
        for (const item of cartItems) {
            await tx.measurementSession.updateMany({
                where: {
                    customerId: customer.sub,
                    productId: item.productId,
                    isPurchased: false,
                },
                data: { isPurchased: true },
            });
        }

        // Clear the cart
        await tx.cartItem.deleteMany({
            where: { customerId: customer.sub },
        });

        return newOrder;
    }).catch((err: Error) => {
        if (err.message.startsWith("SOLD_OUT:")) {
            return { soldOut: err.message.replace("SOLD_OUT:", "") };
        }
        throw err;
    });

    // Surface sold-out race condition error to the client
    if ("soldOut" in order) {
        return NextResponse.json(
            {
                error: "An item sold out while your order was being processed. Please update your cart and try again.",
                details: order.soldOut,
            },
            { status: 409 }
        );
    }

    return NextResponse.json({ order }, { status: 201 });
}
