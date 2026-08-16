import { NextResponse } from "next/server";
import { getAuthFromCookies } from "../../../lib/auth";

export async function GET() {
  const retailer = await getAuthFromCookies();
  if (!retailer) {
    return NextResponse.json({ isRetailer: false }, { status: 200 });
  }
  return NextResponse.json({ isRetailer: true, retailer }, { status: 200 });
}
