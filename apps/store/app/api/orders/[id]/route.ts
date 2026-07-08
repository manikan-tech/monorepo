import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCustomerFromCookies } from "../../../lib/auth";

// ─── GET /api/orders/[id] ─── single order details
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const order = await prisma.order.findUnique({
        where: { id },
        include: {
            items: {
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            imageUrl: true,
                            brand: true,
                        },
                    },
                    variant: {
                        select: {
                            id: true,
                            sizeLabel: true,
                            sku: true,
                        },
                    },
                },
            },
            address: true,
        },
    });

    if (!order || order.customerId !== customer.sub) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order }, { status: 200 });
}

// ─── PATCH /api/orders/[id] ─── cancel order (only if PENDING)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    let body: { status?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Only CANCELLED is allowed as an update from the customer side
    if (body.status !== "CANCELLED") {
        return NextResponse.json(
            { error: "Only status 'CANCELLED' is permitted" },
            { status: 400 }
        );
    }

    const order = await prisma.order.findUnique({
        where: { id },
        select: { customerId: true, status: true },
    });

    if (!order || order.customerId !== customer.sub) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "PENDING") {
        return NextResponse.json(
            {
                error: `Cannot cancel an order with status '${order.status}'. Only PENDING orders can be cancelled.`,
            },
            { status: 409 }
        );
    }

    const updated = await prisma.order.update({
        where: { id },
        data: { status: "CANCELLED" },
    });

    return NextResponse.json({ order: updated }, { status: 200 });
}
