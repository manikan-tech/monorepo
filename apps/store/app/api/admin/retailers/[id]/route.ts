import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import { provisionDefaultFreeSubscriptions } from "../../../../lib/free-tier";

// isActivated flag. Admin-only.
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

    if (!id) {
      return NextResponse.json({ error: "Retailer ID is required" }, { status: 400 });
    }

    let body: { isActivated?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.isActivated !== "boolean") {
      return NextResponse.json(
        { error: "isActivated must be a boolean" },
        { status: 400 }
      );
    }

    const existing = await prisma.retailer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Retailer not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRetailer = await tx.retailer.update({
        where: { id },
        data: { isActivated: body.isActivated },
        select: { id: true, storeName: true, email: true, isActivated: true },
      });

      // A retailer receives the approved Free allowance at first activation.
      // Existing service subscriptions are preserved by the helper, so an
      // admin reactivation cannot silently downgrade a paid retailer.
      if (body.isActivated && !existing.isActivated) {
        await provisionDefaultFreeSubscriptions(tx, id);
      }

      await tx.retailerAuditLog.create({
        data: {
          retailerId: id,
          adminId: session.id,
          action: body.isActivated ? "ACTIVATED" : "SUSPENDED",
          reason: null,
        },
      });

      return updatedRetailer;
    });

    return NextResponse.json({ retailer: updated });
  } catch (error) {
    console.error("[admin/retailers/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
