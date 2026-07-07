import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { verifyPassword, createToken, setAuthCookie } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // ── Validation ─────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    // ── Find retailer ──────────────────────────────────────
    const retailer = await prisma.retailer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!retailer) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // ── Verify password ────────────────────────────────────
    const isValid = await verifyPassword(password, retailer.hashedPassword);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // ── Generate JWT and set cookie ────────────────────────
    const token = await createToken({
      sub: retailer.id,
      email: retailer.email,
      name: retailer.name,
    });

    const response = NextResponse.json({
      success: true,
      retailer: {
        id: retailer.id,
        name: retailer.name,
        email: retailer.email,
      },
    });

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
