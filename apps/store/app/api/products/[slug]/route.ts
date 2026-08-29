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
                retailer: {
                    select: { isActivated: true }
                },
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

        if (!product || !product.isActive || !product.retailer?.isActivated) {
            return NextResponse.json(
                { error: "Product not found" },
                { status: 404 }
            );
        }

        // ── Color siblings: other active products with the same styleCode.
        const colorSiblings = await prisma.product.findMany({
            where: {
                retailerId: product.retailerId,
                category: product.category,
                isActive: true,
                id: { not: product.id },
                ...(product.styleCode
                    ? { styleCode: product.styleCode }
                    : { name: product.name }
                ),
            },
            select: {
                id: true,
                slug: true,
                styleCode: true,
                garmentColorHex: true,
                imageUrl: true,
            },
            orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({ product, colorSiblings }, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch product:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

import { getAuthFromCookies } from "../../../lib/auth";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const user = await getAuthFromCookies();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { slug: productId } = await params;

        // Check if the product belongs to the retailer
        const product = await prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product || product.retailerId !== user.sub) {
            return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
        }

        await prisma.product.delete({
            where: { id: productId },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Delete product error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
