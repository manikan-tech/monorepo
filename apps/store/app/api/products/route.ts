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
        const search = searchParams.get("search");

        const skip = (page - 1) * limit;

        // Build query filters
        const where: Prisma.ProductWhereInput = {
            isActive: true,
            retailer: { isActivated: true },
        };

        if (gender) {
            where.gender = { equals: gender, mode: "insensitive" };
        }

        if (brand) {
            where.brand = { equals: brand, mode: "insensitive" };
        }

        const andConditions: Prisma.ProductWhereInput[] = [];

        if (categorySlug) {
            andConditions.push({
                OR: [
                    { categoryRef: { slug: { equals: categorySlug, mode: "insensitive" } } },
                    { category: { equals: categorySlug, mode: "insensitive" } },
                ]
            });
        }

        if (search) {
            andConditions.push({
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { description: { contains: search, mode: "insensitive" } },
                ]
            });
        }
        
        if (andConditions.length > 0) {
            where.AND = andConditions;
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
