import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSecret, ADMIN_SESSION_MAX_AGE } from "../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  try {
    let body: { secret?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { secret } = body ?? {};

    if (!secret || typeof secret !== "string") {
      return NextResponse.json({ error: "Secret is required" }, { status: 400 });
    }

    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set("manikan_admin", secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ADMIN_SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[admin/login]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
