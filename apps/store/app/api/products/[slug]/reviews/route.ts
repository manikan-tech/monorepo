import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

// ─── GET /api/products/[slug]/reviews ─── paginated product reviews
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    // ── Pagination guards: clamp page >= 1, limit 1–50
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const rawLimit = parseInt(searchParams.get("limit") || "10", 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 10 : Math.min(rawLimit, 50);
    const skip = (page - 1) * limit;

    // Resolve product by slug
    const product = await prisma.product.findUnique({
        where: { slug: slug.toLowerCase().trim() },
        select: { id: true },
    });

    if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Fetch page + total count + aggregate average in parallel
    const [reviews, total, aggregate] = await Promise.all([
        prisma.review.findMany({
            where: { productId: product.id },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
            include: {
                customer: {
                    select: {
                        firstName: true,
                        lastName: true,
                        avatarUrl: true,
                    },
                },
            },
        }),
        prisma.review.count({ where: { productId: product.id } }),
        // Fix: compute average across ALL reviews, not just the current page
        prisma.review.aggregate({
            where: { productId: product.id },
            _avg: { rating: true },
        }),
    ]);

    const avgRating = Math.round((aggregate._avg.rating ?? 0) * 10) / 10;

    return NextResponse.json(
        {
            reviews,
            avgRating,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        },
        { status: 200 }
    );
}
