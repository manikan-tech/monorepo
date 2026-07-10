import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { sendOtpEmail } from "../../../lib/email";
import crypto from "crypto";

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // ── Validation ─────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // ── Find retailer ──────────────────────────────────────
    const retailer = await prisma.retailer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!retailer) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    if (retailer.isActivated) {
      return NextResponse.json(
        { error: "Account is already activated" },
        { status: 400 }
      );
    }

    // ── 1-minute cooldown check ────────────────────────────
    const lastOtp = await prisma.otpToken.findFirst({
      where: { retailerId: retailer.id },
      orderBy: { createdAt: "desc" },
    });

    if (lastOtp) {
      const secondsSinceLastOtp = Math.floor(
        (Date.now() - lastOtp.createdAt.getTime()) / 1000
      );

      if (secondsSinceLastOtp < 60) {
        const retryAfterSeconds = 60 - secondsSinceLastOtp;
        return NextResponse.json(
          {
            error: "Please wait before requesting a new code",
            retryAfterSeconds,
          },
          { status: 429 }
        );
      }
    }

    // ── Delete old OTPs and create a new one ───────────────
    await prisma.otpToken.deleteMany({
      where: { retailerId: retailer.id },
    });

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.otpToken.create({
      data: {
        retailerId: retailer.id,
        code: otpCode,
        expiresAt,
      },
    });

    await sendOtpEmail(retailer.email, otpCode);

    return NextResponse.json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (error: any) {
    console.error("Resend OTP error:", error);

    if (error instanceof Error && error.message.includes("testing emails")) {
      return NextResponse.json(
        { error: "Free tier limitation: You can only send test emails to your registered Resend email address. Please use that email to test the signup flow." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
