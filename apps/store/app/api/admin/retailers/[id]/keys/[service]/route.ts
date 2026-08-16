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

    let body: { isActive?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean" },
        { status: 400 }
      );
    }

    const serviceKey = await prisma.serviceApiKey.findUnique({
      where: {
        retailerId_service: {
          retailerId: id,
          service,
        }
      }
    });

    if (!serviceKey) {
      return NextResponse.json({ error: "Service API key not found" }, { status: 404 });
    }

    const updatedKey = await prisma.serviceApiKey.update({
      where: {
        retailerId_service: {
          retailerId: id,
          service,
        }
      },
      data: {
        isActive: body.isActive,
      }
    });

    return NextResponse.json({ key: updatedKey });
  } catch (error) {
    console.error("[admin/retailers/[id]/keys/[service]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
