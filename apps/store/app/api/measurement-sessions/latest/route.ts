import { NextResponse } from "next/server";

import { getCustomerFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET() {
    const customer = await getCustomerFromCookies();

    if (!customer) {
        return NextResponse.json(
            {
                found: false,
                authenticated: false,
            },
            { status: 401 }
        );
    }

    const latestSession = await prisma.measurementSession.findFirst({
        where: {
            customerId: customer.sub,
        },
        orderBy: {
            createdAt: "desc",
        },
        select: {
            id: true,
            productId: true,
            heightCm: true,
            weightKg: true,
            chestCm: true,
            waistCm: true,
            hipsCm: true,
            recommendedSize: true,
            confidenceScore: true,
            createdAt: true,
            product: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!latestSession) {
        return NextResponse.json({
            found: false,
            authenticated: true,
        });
    }

    return NextResponse.json({
        found: true,
        authenticated: true,

        heightCm: latestSession.heightCm,
        weightKg: latestSession.weightKg,
        chestCm: latestSession.chestCm,
        waistCm: latestSession.waistCm,
        hipsCm: latestSession.hipsCm,

        recommendedSize: latestSession.recommendedSize,
        confidenceScore: latestSession.confidenceScore,

        productId: latestSession.productId,
        productName: latestSession.product.name,

        createdAt: latestSession.createdAt,
    });
}