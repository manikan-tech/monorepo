import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { hashPassword, createToken, setAuthCookie } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    // ── Validation ─────────────────────────────────────────
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name is required (minimum 2 characters)" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // ── Check for existing account ─────────────────────────
    const existingRetailer = await prisma.retailer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingRetailer) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // ── Create retailer ────────────────────────────────────
    const hashedPassword = await hashPassword(password);

    const retailer = await prisma.retailer.create({
      data: {
        authId: email.toLowerCase().trim(),
        storeName: name.trim(),
        email: email.toLowerCase().trim(),
        hashedPassword,
      },
    });

    // ── Generate JWT and set cookie ────────────────────────
    const token = await createToken({
      sub: retailer.id,
      email: retailer.email,
      name: retailer.storeName,
    });

    const response = NextResponse.json(
      {
        success: true,
        retailer: {
          id: retailer.id,
          name: retailer.storeName,
          email: retailer.email,
        },
      },
      { status: 201 }
    );

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
