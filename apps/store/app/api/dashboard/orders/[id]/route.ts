import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getAuthFromCookies } from "../../../../lib/auth";

const TERMINAL_STATUSES = ["CANCELLED", "DELIVERED", "RETURNED"];
const VALID_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromCookies();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const resolvedParams = await params;

    // Verify order exists and retailer owns at least one item
    const order = await prisma.order.findUnique({
      where: { id: resolvedParams.id },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const ownsItem = order.items.some(item => item.product.retailerId === user.sub);
    if (!ownsItem) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (TERMINAL_STATUSES.includes(order.status)) {
      return NextResponse.json({ error: `Cannot change status of a ${order.status} order` }, { status: 409 });
    }

    const { status } = await request.json();

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: resolvedParams.id },
      data: { status },
    });

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("Order status update error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
