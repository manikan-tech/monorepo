import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // ── Validation ─────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // ── Resend OTP via Supabase Auth ──────────────────────
    const supabase = await createClient();

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.toLowerCase().trim(),
    });

    if (resendError) {
      console.error("Supabase resend OTP error:", resendError);

      if (resendError.message?.toLowerCase().includes("rate")) {
        return NextResponse.json(
          {
            error: "Please wait before requesting a new code",
            retryAfterSeconds: 60,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: resendError.message || "Could not resend code" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (error: any) {
    console.error("Resend OTP error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
