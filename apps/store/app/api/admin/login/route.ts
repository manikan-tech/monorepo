import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_MAX_AGE } from "../../../lib/admin-auth";
import { createClient } from "../../../lib/supabase/server";
import { prisma } from "../../../lib/prisma";

export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 200 });
    }

    const { email, password } = body ?? {};

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 200 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.user.email) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 200 });
    }

    // Verify they are actually in PlatformAdmin
    const admin = await prisma.platformAdmin.findUnique({
      where: { email: data.user.email },
    });

    if (!admin) {
      // Clean up Supabase session since they aren't an admin
      await supabase.auth.signOut();
      return NextResponse.json({ success: false, error: "Unauthorized access" }, { status: 200 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("manikan_role", "admin", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ADMIN_SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[admin/login]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 200 });
  }
}
