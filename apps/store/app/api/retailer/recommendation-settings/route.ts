import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const retailer = await prisma.retailer.findUnique({
      where: { id: user.sub },
      select: { recommendationSettings: true }
    });

    return NextResponse.json({ settings: retailer?.recommendationSettings || {} });
  } catch (error: any) {
    console.error("Fetch recommendation settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const existing = await prisma.retailer.findUnique({
      where: { id: user.sub },
      select: { recommendationSettings: true },
    });
    
    const existingSettings =
      existing?.recommendationSettings &&
      typeof existing.recommendationSettings === "object" &&
      !Array.isArray(existing.recommendationSettings)
        ? (existing.recommendationSettings as Record<string, unknown>)
        : {};

    const updated = await prisma.retailer.update({
      where: { id: user.sub },
      data: {
        recommendationSettings: { ...existingSettings, ...(body.settings ?? {}) },
      },
    });

    return NextResponse.json({ success: true, settings: updated.recommendationSettings });
  } catch (error: any) {
    console.error("Save recommendation settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
