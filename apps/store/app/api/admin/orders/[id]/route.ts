import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";

const ALLOWED_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURN_PENDING", "RETURNED"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    let body: { status?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.status || !ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status: body.status as any },
    });

    return NextResponse.json({ order });
  } catch (error: any) {
    console.error("[admin/orders/[id]/PATCH]", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
