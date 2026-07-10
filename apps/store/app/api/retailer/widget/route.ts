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

    const updated = await prisma.retailer.update({
      where: { id: user.sub },
      data: {
        widgetSettings: body.settings,
      },
    });

    return NextResponse.json({ success: true, settings: updated.widgetSettings });
  } catch (error: any) {
    console.error("Save widget settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
