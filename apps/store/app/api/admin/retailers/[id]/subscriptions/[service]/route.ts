import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../lib/prisma";
import { SERVICES } from "../../../../../../lib/service-keys";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; service: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, service } = await params;

    if (!id || !service) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    if (!SERVICES.includes(service as any)) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }

    let body: { status?: "ACTIVE" | "CANCELLED"; planId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (body.status && body.status !== "ACTIVE" && body.status !== "CANCELLED") {
      return NextResponse.json(
        { error: "status must be either ACTIVE or CANCELLED" },
        { status: 400 }
      );
    }

    // Find the current active or most recent subscription for this service
    const subscription = await prisma.subscription.findFirst({
      where: {
        retailerId: id,
        service,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription && !body.planId) {
      return NextResponse.json({ error: "Subscription not found for this service" }, { status: 404 });
    }

    const updatedSub = await prisma.$transaction(async (tx) => {
      let sub;

      if (subscription) {
        sub = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            ...(body.status ? { status: body.status } : {}),
            ...(body.planId ? { planId: body.planId } : {})
          }
        });
      } else if (body.planId) {
        sub = await tx.subscription.create({
          data: {
            retailerId: id,
            service,
            planId: body.planId,
            stripeCustomerId: `admin_assigned_${id}`,
            status: body.status || "ACTIVE",
          }
        });
      }

      await tx.retailerAuditLog.create({
        data: {
          retailerId: id,
          adminId: session.id,
          action: "PLAN_CHANGED",
          reason: `${service} subscription updated. Status: ${body.status || sub?.status}. Plan ID: ${body.planId || sub?.planId || 'unchanged'}`,
        },
      });

      return sub;
    });

    return NextResponse.json({ subscription: updatedSub });
  } catch (error) {
    console.error("[admin/retailers/[id]/subscriptions/[service]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
