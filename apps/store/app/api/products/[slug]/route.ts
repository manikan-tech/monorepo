import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        if (!slug) {
            return NextResponse.json(
                { error: "Product slug is required" },
                { status: 400 }
            );
        }

        const product = await prisma.product.findUnique({
            where: {
                slug: slug.toLowerCase().trim(),
            },
            include: {
                variants: true,
                categoryRef: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                reviews: {
                    take: 10,
                    orderBy: {
                        createdAt: "desc",
                    },
                    include: {
                        customer: {
                            select: {
                                firstName: true,
                                lastName: true,
                                avatarUrl: true,
                            },
                        },
                    },
                },
            },
        });

        if (!product || !product.isActive) {
            return NextResponse.json(
                { error: "Product not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ product }, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch product:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
