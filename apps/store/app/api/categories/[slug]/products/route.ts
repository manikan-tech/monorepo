import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        if (!slug) {
            return NextResponse.json(
                { error: "Category slug is required" },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "12", 10);
        const brand = searchParams.get("brand");
        const sort = searchParams.get("sort");

        const skip = (page - 1) * limit;

        // Find the category and all sub-categories
        const category = await prisma.category.findUnique({
            where: { slug: slug.toLowerCase().trim() },
            include: { children: true },
        });

        if (!category) {
            return NextResponse.json(
                { error: "Category not found" },
                { status: 404 }
            );
        }

        const categoryIds = [
            category.id,
            ...category.children.map((c) => c.id),
        ];

        // Build query filters
        const where: Prisma.ProductWhereInput = {
            isActive: true,
            categoryId: { in: categoryIds },
        };

        if (brand) {
            where.brand = { equals: brand, mode: "insensitive" };
        }

        // Determine sorting criteria
        let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" };
        if (sort === "price_asc") {
            orderBy = { priceEgp: "asc" };
        } else if (sort === "price_desc") {
            orderBy = { priceEgp: "desc" };
        } else if (sort === "newest") {
            orderBy = { createdAt: "desc" };
        }

        // Run count and find queries in parallel
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                orderBy,
                skip,
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
            }),
            prisma.product.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return NextResponse.json(
            {
                products,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Failed to fetch products for category:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
