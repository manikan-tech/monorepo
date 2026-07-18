import { NextResponse } from "next/server";
import { getCustomerFromCookies } from "../../../lib/auth";

export async function GET() {
  const customer = await getCustomerFromCookies();

  if (!customer) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    role: "customer",
    user: customer,
  });
}
