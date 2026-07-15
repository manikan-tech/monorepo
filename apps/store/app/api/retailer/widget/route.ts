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
      select: { widgetSettings: true }
    });

    return NextResponse.json({ settings: retailer?.widgetSettings || {} });
  } catch (error: any) {
    console.error("Fetch widget settings error:", error);
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

    // ─── NOTE for the UI/dashboard team ─────────────────────────────────
    // This is a SHALLOW MERGE, not an overwrite — ON PURPOSE. widgetSettings
    // also stores `allowedOrigins`, the security allowlist the embeddable
    // widget's auth gate depends on (see app/lib/widget-auth.ts). If this
    // route overwrote widgetSettings with only your colour/language fields,
    // it would silently WIPE allowedOrigins and lock every retailer out of
    // their own widget. Please keep this as a merge. Manage the origins list
    // via PATCH /api/retailer/widget-key, not here. ─────────────────────
    const existing = await prisma.retailer.findUnique({
      where: { id: user.sub },
      select: { widgetSettings: true },
    });
    const existingSettings =
      existing?.widgetSettings &&
      typeof existing.widgetSettings === "object" &&
      !Array.isArray(existing.widgetSettings)
        ? (existing.widgetSettings as Record<string, unknown>)
        : {};

    const updated = await prisma.retailer.update({
      where: { id: user.sub },
      data: {
        widgetSettings: { ...existingSettings, ...(body.settings ?? {}) },
      },
    });

    return NextResponse.json({ success: true, settings: updated.widgetSettings });
  } catch (error: any) {
    console.error("Save widget settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
