import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";

// ─── POST /api/measurement-sessions ─── log a size recommendation
// Auth is OPTIONAL here by design: MeasurementSession.customerId is
// nullable and shopperRef exists specifically for anonymous visitors
// (see schema.prisma), so guests can use the Size Assistant without
// signing in first.
export async function POST(request: NextRequest) {
    const customer = await getCustomerFromCookies();

    let body: {
        productId?: string;
        shopperRef?: string;
        heightCm?: number;
        weightKg?: number;
        chestCm?: number;
        waistCm?: number;
        hipsCm?: number;
        recommendedSize?: string;
        confidenceScore?: number;
        explanation?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
        productId,
        shopperRef,
        heightCm,
        weightKg,
        chestCm,
        waistCm,
        hipsCm,
        recommendedSize,
        confidenceScore,
        explanation,
    } = body;

    if (!productId) {
        return NextResponse.json({ error: "productId is required" }, { status: 400 });
    }

    const requiredNumbers: Record<string, number | undefined> = {
        heightCm,
        weightKg,
        chestCm,
        waistCm,
        hipsCm,
    };
    for (const [key, value] of Object.entries(requiredNumbers)) {
        if (typeof value !== "number" || Number.isNaN(value)) {
            return NextResponse.json(
                { error: `${key} is required and must be a number` },
                { status: 400 }
            );
        }
    }

    if (!customer && !shopperRef) {
        return NextResponse.json(
            { error: "shopperRef is required for guest (non-logged-in) sessions" },
            { status: 400 }
        );
    }

    // Look up the product ourselves to get its retailerId - never trust
    // a retailerId sent by the client.
    const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, retailerId: true },
    });

    if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const session = await prisma.measurementSession.create({
        data: {
            retailerId: product.retailerId,
            productId,
            customerId: customer?.sub ?? null,
            shopperRef: customer ? null : shopperRef,
            heightCm: heightCm as number,
            weightKg: weightKg as number,
            chestCm: chestCm as number,
            waistCm: waistCm as number,
            hipsCm: hipsCm as number,
            recommendedSize: recommendedSize ?? null,
            confidenceScore: confidenceScore ?? null,
            explanation: explanation ?? null,
        },
    });

    return NextResponse.json({ session }, { status: 201 });
}