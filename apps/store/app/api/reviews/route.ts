import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";

// ─── POST /api/reviews ─── create a review (verified purchase check)
export async function POST(request: NextRequest) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
        productId?: string;
        rating?: number;
        title?: string;
        comment?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { productId, rating, title, comment } = body;

    if (!productId || typeof rating !== "number") {
        return NextResponse.json(
            { error: "productId and a numeric rating are required" },
            { status: 400 }
        );
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return NextResponse.json(
            { error: "rating must be an integer between 1 and 5" },
            { status: 400 }
        );
    }

    // Check if product exists and is active
    const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, isActive: true },
    });

    if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!product.isActive) {
        return NextResponse.json(
            { error: "This product is no longer available for reviews" },
            { status: 410 }
        );
    }

    // Check for a verified purchase — customer must have delivered order containing this product
    const verifiedOrder = await prisma.orderItem.findFirst({
        where: {
            productId,
            order: {
                customerId: customer.sub,
                status: "DELIVERED",
            },
        },
        select: { id: true },
    });

    if (!verifiedOrder) {
        return NextResponse.json(
            { error: "You must have a delivered order for this product to write a review." },
            { status: 403 }
        );
    }

    const isVerified = true;

    // Upsert review (one review per customer per product)
    const review = await prisma.review.upsert({
        where: {
            customerId_productId: {
                customerId: customer.sub,
                productId,
            },
        },
        create: {
            customerId: customer.sub,
            productId,
            rating,
            title: title ?? null,
            comment: comment ?? null,
            isVerified,
        },
        update: {
            rating,
            title: title ?? null,
            comment: comment ?? null,
            isVerified,
        },
    });

    return NextResponse.json({ review }, { status: 201 });
}
