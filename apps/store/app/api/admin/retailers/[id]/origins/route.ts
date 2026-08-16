import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";

export async function DELETE(
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
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    let body: { origin?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.origin || typeof body.origin !== "string") {
      return NextResponse.json(
        { error: "origin is required and must be a string" },
        { status: 400 }
      );
    }

    const retailer = await prisma.retailer.findUnique({
      where: { id }
    });

    if (!retailer) {
      return NextResponse.json({ error: "Retailer not found" }, { status: 404 });
    }

    const currentSettings = (retailer.widgetSettings as Record<string, any>) || {};
    const allowedOrigins = Array.isArray(currentSettings.allowedOrigins) 
      ? currentSettings.allowedOrigins 
      : [];
    
    const newAllowedOrigins = allowedOrigins.filter(o => o !== body.origin);

    const updatedRetailer = await prisma.retailer.update({
      where: { id },
      data: {
        widgetSettings: {
          ...currentSettings,
          allowedOrigins: newAllowedOrigins
        }
      }
    });

    return NextResponse.json({ success: true, allowedOrigins: newAllowedOrigins });
  } catch (error) {
    console.error("[admin/retailers/[id]/origins]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
