import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";
import { OrderStatus } from "@prisma/client";

// ─── GET /api/orders ─── list customer orders with optional status filter
export async function GET(request: NextRequest) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");

    // Validate status filter if provided
    const validStatuses = Object.values(OrderStatus);
    const status =
        statusParam && validStatuses.includes(statusParam as OrderStatus)
            ? (statusParam as OrderStatus)
            : undefined;

    const orders = await prisma.order.findMany({
        where: {
            customerId: customer.sub,
            ...(status ? { status } : {}),
        },
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
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ orders }, { status: 200 });
}
