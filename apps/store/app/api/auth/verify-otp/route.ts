import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { createToken, setAuthCookie } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    // ── Validation ─────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Please enter a valid 6-digit code" },
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

    // ── Find matching OTP ──────────────────────────────────
    const otpToken = await prisma.otpToken.findFirst({
      where: {
        retailerId: retailer.id,
        code,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpToken) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // ── Check expiration ───────────────────────────────────
    if (new Date() > otpToken.expiresAt) {
      // Clean up expired token
      await prisma.otpToken.delete({ where: { id: otpToken.id } });
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // ── Activate the retailer ──────────────────────────────
    await prisma.$transaction([
      prisma.retailer.update({
        where: { id: retailer.id },
        data: { isActivated: true },
      }),
      prisma.otpToken.deleteMany({
        where: { retailerId: retailer.id },
      }),
    ]);

    // ── Generate JWT and set cookie ────────────────────────
    const token = await createToken({
      sub: retailer.id,
      email: retailer.email,
      name: retailer.storeName,
    });

    const response = NextResponse.json({
      success: true,
      retailer: {
        id: retailer.id,
        name: retailer.storeName,
        email: retailer.email,
      },
    });

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
