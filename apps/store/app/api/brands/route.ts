import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const distinctProducts = await prisma.product.findMany({
            select: { brand: true },
            distinct: ['brand'],
            where: { 
                isActive: true,
                retailer: { isActivated: true },
                brand: { not: null } 
            }
        });

        const brands = distinctProducts
            .filter(p => p.brand && p.brand.trim() !== "")
            .map(p => p.brand.trim())
            .sort((a, b) => a.localeCompare(b));

        return NextResponse.json({ brands }, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch brands:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
