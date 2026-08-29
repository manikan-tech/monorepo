import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: SUPER_ADMIN role required" }, { status: 403 });
    }

    const { id } = await params;

    let body: { name?: string; priceEgpMonthly?: number; quota?: number; concurrentRequestLimit?: number | null };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const dataToUpdate: any = {};
    if (typeof body.name === "string") dataToUpdate.name = body.name;
    if (typeof body.priceEgpMonthly === "number" && body.priceEgpMonthly >= 0) dataToUpdate.priceEgpMonthly = body.priceEgpMonthly;
    if (typeof body.quota === "number" && body.quota >= 0) dataToUpdate.quota = body.quota;
    if (body.concurrentRequestLimit === null) {
      dataToUpdate.concurrentRequestLimit = null;
    } else if (body.concurrentRequestLimit !== undefined) {
      if (!Number.isInteger(body.concurrentRequestLimit) || body.concurrentRequestLimit < 1) {
        return NextResponse.json({ error: "concurrentRequestLimit must be a positive integer or null" }, { status: 400 });
      }
      dataToUpdate.concurrentRequestLimit = body.concurrentRequestLimit;
    }

    if (Object.keys(dataToUpdate).length === 0) {
       return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ plan });
  } catch (error: any) {
    console.error("[admin/plans/[id]/PATCH]", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "A plan with this name already exists for this service" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: SUPER_ADMIN role required" }, { status: 403 });
    }

    const { id } = await params;

    // Check if any active subscriptions use this plan
    const activeSubs = await prisma.subscription.count({
      where: {
        planId: id,
        status: "ACTIVE"
      }
    });

    if (activeSubs > 0) {
      return NextResponse.json(
        { error: `Cannot delete plan: ${activeSubs} active subscription(s) are using it.` }, 
        { status: 409 }
      );
    }

    await prisma.plan.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[admin/plans/[id]/DELETE]", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
