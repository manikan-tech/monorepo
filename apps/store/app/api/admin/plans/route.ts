import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "../../../lib/admin-auth";
import { prisma } from "../../../lib/prisma";
import { SERVICES } from "../../../lib/service-keys";


export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: SUPER_ADMIN role required" }, { status: 403 });
    }

    let body: { name?: string; service?: string; priceEgpMonthly?: number; quota?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { name, service, priceEgpMonthly, quota } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required and must be a string" }, { status: 400 });
    }
    if (!service || !SERVICES.includes(service as any)) {
      return NextResponse.json({ error: "service is required and must be a valid service" }, { status: 400 });
    }
    if (typeof priceEgpMonthly !== "number" || priceEgpMonthly < 0) {
      return NextResponse.json({ error: "priceEgpMonthly is required and must be a non-negative number" }, { status: 400 });
    }
    if (typeof quota !== "number" || quota < 0) {
      return NextResponse.json({ error: "quota is required and must be a non-negative number" }, { status: 400 });
    }

    const plan = await prisma.plan.create({
      data: {
        name,
        service,
        priceEgpMonthly,
        quota,
      },
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error: any) {
    console.error("[admin/plans/POST]", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "A plan with this name already exists for this service" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
