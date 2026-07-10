import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    // ── Validation ─────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "Please enter a valid 6-digit code" }, { status: 400 });
    }

    // ── Verify OTP via Supabase Auth ──────────────────────
    const supabase = await createClient();

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: code,
      type: "signup",
    });

    if (verifyError) {
      console.error("Supabase verify OTP error:", verifyError);
      return NextResponse.json(
        { error: verifyError.message || "Invalid verification code" },
        { status: 400 }
      );
    }

    if (!data.user) {
      return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
    }

    // ── Success — Supabase automatically sets session cookies ─
    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
