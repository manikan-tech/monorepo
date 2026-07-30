import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";

const VALID_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CLOSED"] as const;
type InquiryStatus = (typeof VALID_STATUSES)[number];

// Updates the CRM pipeline status of a business inquiry. Admin-only.
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
      return NextResponse.json({ error: "Inquiry ID is required" }, { status: 400 });
    }

    let body: { status?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.status || !VALID_STATUSES.includes(body.status as InquiryStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const existing = await prisma.businessInquiry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    }

    const updated = await prisma.businessInquiry.update({
      where: { id },
      data: { status: body.status as InquiryStatus },
    });

    return NextResponse.json({ inquiry: updated });
  } catch (error) {
    console.error("[admin/inquiries/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
