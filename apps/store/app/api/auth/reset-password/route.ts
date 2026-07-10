import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Supabase will send a reset link to the email.
    // The redirectTo URL determines where the user goes after clicking the link in the email.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase().trim(),
      {
        redirectTo: `${baseUrl}/reset-password`,
      }
    );

    if (resetError) {
      console.error("Supabase reset password error:", resetError);
      return NextResponse.json(
        { error: resetError.message || "Could not send reset password email" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password reset instructions have been sent to your email.",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
