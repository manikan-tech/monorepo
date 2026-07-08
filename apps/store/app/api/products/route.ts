import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "12", 10);
        const gender = searchParams.get("gender");
        const categorySlug = searchParams.get("category");
        const brand = searchParams.get("brand");
        const sort = searchParams.get("sort");

        const skip = (page - 1) * limit;

        // Build query filters
        const where: Prisma.ProductWhereInput = {
            isActive: true,
        };

        if (gender) {
            where.gender = { equals: gender, mode: "insensitive" };
        }

        if (brand) {
            where.brand = { equals: brand, mode: "insensitive" };
        }

        if (categorySlug) {
            // Find category and its immediate child categories to support hierarchical filters
            const targetCategory = await prisma.category.findUnique({
                where: { slug: categorySlug.toLowerCase().trim() },
                include: { children: true }
            });

            if (targetCategory) {
                const categoryIds = [
                    targetCategory.id,
                    ...targetCategory.children.map((c) => c.id)
                ];
                where.categoryId = { in: categoryIds };
            } else {
                // If category parameter exists but slug isn't found, return empty results
                return NextResponse.json(
                    {
                        products: [],
                        pagination: {
                            total: 0,
                            page,
                            limit,
                            totalPages: 0
                        }
                    },
                    { status: 200 }
                );
            }
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

        // Run parallel count and find queries to optimize performance
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
                            slug: true
                        }
                    }
                }
            }),
            prisma.product.count({ where })
        ]);

        const totalPages = Math.ceil(total / limit);

        return NextResponse.json(
            {
                products,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
                }
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Failed to fetch products:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
