import { NextResponse } from "next/server";
import { getAuthFromCookies } from "../../../lib/auth";

// ─── GET /api/retailer/me ─── returns 200 if caller is a Retailer, else 404
export async function GET() {
  const retailer = await getAuthFromCookies();
  if (!retailer) {
    return NextResponse.json({ error: "Not a retailer" }, { status: 404 });
  }
  return NextResponse.json({ retailer }, { status: 200 });
}
