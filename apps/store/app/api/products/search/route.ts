import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get("q");
        const rawLimit = parseInt(searchParams.get("limit") || "10", 10);
        // Guard: clamp limit to 1–100, default 10
        const limit = isNaN(rawLimit) || rawLimit < 1 ? 10 : Math.min(rawLimit, 100);

        if (!query || !query.trim()) {
            return NextResponse.json(
                { error: query !== null ? "Search query cannot be empty or whitespace" : "Search query parameter 'q' is required" },
                { status: 400 }
            );
        }

        const cleanQuery = query.trim();

        const products = await prisma.product.findMany({
            where: {
                isActive: true,
                OR: [
                    { name: { contains: cleanQuery, mode: "insensitive" } },
                    { brand: { contains: cleanQuery, mode: "insensitive" } },
                    { description: { contains: cleanQuery, mode: "insensitive" } },
                    { fabric: { contains: cleanQuery, mode: "insensitive" } },
                ],
            },
            take: limit,
            include: {
                variants: true,
                categoryRef: {
                    select: {
                        name: true,
                        slug: true,
                    },
                },
            },
        });

        return NextResponse.json({ products }, { status: 200 });
    } catch (error) {
        console.error("Failed to search products:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
