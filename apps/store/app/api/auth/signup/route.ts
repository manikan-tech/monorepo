import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { prisma } from "../../../lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role = "customer", firstName, lastName, storeName, phone, email, password } = body;

    // ── Validation ─────────────────────────────────────────
    if (role === "customer") {
      if (!firstName || typeof firstName !== "string" || firstName.trim().length < 2) {
        return NextResponse.json({ error: "First name is required (minimum 2 characters)" }, { status: 400 });
      }

      if (!lastName || typeof lastName !== "string" || lastName.trim().length < 2) {
        return NextResponse.json({ error: "Last name is required (minimum 2 characters)" }, { status: 400 });
      }
    } else if (role === "retailer") {
      if (!storeName || typeof storeName !== "string" || storeName.trim().length < 2) {
        return NextResponse.json({ error: "Store name is required (minimum 2 characters)" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // ── Check for existing account ─────────────────────────
    if (role === "customer") {
      const existingCustomer = await prisma.customer.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (existingCustomer) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
      }
    } else {
      const existingRetailer = await prisma.retailer.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (existingRetailer) {
        return NextResponse.json({ error: "A retailer account with this email already exists" }, { status: 409 });
      }
    }

    // ── Sign up via Supabase Auth ──────────────────────────
    const supabase = await createClient();

    const fullName = role === "customer"
      ? `${firstName.trim()} ${lastName.trim()}`
      : storeName.trim();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone?.trim() || null,
        },
      },
    });

    if (signUpError) {
      console.error("Supabase signup error:", signUpError);
      return NextResponse.json({ error: signUpError.message }, { status: 400 });
    }

    if (!data.user) {
      return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
    }

    // ── Create profile in Prisma ───────────────────
    if (role === "customer") {
      await prisma.customer.create({
        data: {
          authId: data.user.id,
          email: email.toLowerCase().trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone?.trim() || null,
        },
      });
    } else {
      await prisma.retailer.create({
        data: {
          authId: data.user.id,
          email: email.toLowerCase().trim(),
          storeName: storeName.trim(),
          isActivated: false,
        },
      });
    }

    // ── Return success (requires email verification) ────────
    return NextResponse.json(
      {
        success: true,
        requiresActivation: true,
        email: email.toLowerCase().trim(),
        message: "Account created. Please check your email for the verification code.",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
