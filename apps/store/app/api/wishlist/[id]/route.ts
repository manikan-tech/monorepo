import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCustomerFromCookies } from "../../../lib/auth";

// ─── DELETE /api/wishlist/[id] ─── remove a saved product from the wishlist
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the wishlist item exists and belongs to this customer
    const existing = await prisma.wishlist.findUnique({
        where: { id },
        select: { customerId: true },
    });

    if (!existing || existing.customerId !== customer.sub) {
        return NextResponse.json(
            { error: "Wishlist item not found" },
            { status: 404 }
        );
    }

    await prisma.wishlist.delete({ where: { id } });

    return NextResponse.json(
        { message: "Product removed from wishlist" },
        { status: 200 }
    );
}
