import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../lib/supabase/server";
import { prisma } from "../../../lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, role } = body;

    // ── Validation ──────────────────────────────────────
    if (!email || typeof email !== "string") {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 200 });
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "Password is required" }, { status: 200 });
    }

    // ── Sign in via Supabase Auth ──────────────────────────
    const supabase = await createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (signInError) {
      console.error("Supabase login error:", signInError);

      if (signInError.message?.toLowerCase().includes("email not confirmed")) {
        return NextResponse.json(
          {
            success: false,
            error: "Please verify your email before signing in",
            requiresActivation: true,
            email: email.toLowerCase().trim(),
          },
          { status: 200 }
        );
      }

      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 200 });
    }

    if (!data.user) {
      return NextResponse.json({ success: false, error: "Login failed. Please try again." }, { status: 200 });
    }

    const cookieStore = await cookies();

    // ── Prevent PlatformAdmins from logging in here ─────────
    const admin = await prisma.platformAdmin.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (admin) {
      await supabase.auth.signOut();
      return NextResponse.json({ 
        success: false, 
        error: "Platform Admins cannot login to the Retailer or Shopper portals. Please use the Admin dashboard at /admin." 
      }, { status: 200 });
    }

    // ── Check Role in Database ─────────────────────────────
    // To know where to redirect, we check if they are a Customer or Retailer
    const customer = await prisma.customer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (customer) {
      if (role === "retailer") {
        return NextResponse.json({ success: false, error: "This email belongs to a customer, please select Login as Customer." }, { status: 200 });
      }
      cookieStore.set("manikan_role", "customer", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
      return NextResponse.json({
        success: true,
        redirect: "/",
        user: { id: data.user.id, email: data.user.email, role: "customer" },
      });
    }

    const retailer = await prisma.retailer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (retailer) {
      if (role === "customer") {
        return NextResponse.json({ success: false, error: "This email belongs to a retailer, please select Login as Retailer." }, { status: 200 });
      }

      // Update the Retailer's authId to match Supabase if it wasn't already synced
      if (retailer.authId !== data.user.id) {
        await prisma.retailer.update({
          where: { id: retailer.id },
          data: { authId: data.user.id },
        });
      }

      cookieStore.set("manikan_role", "retailer", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
      return NextResponse.json({
        success: true,
        redirect: "/dashboard",
        user: { id: data.user.id, email: data.user.email, role: "retailer" },
      });
    }

    // If they exist in Supabase but not in our DB, default to customer redirect
    cookieStore.set("manikan_role", "customer", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    return NextResponse.json({
      success: true,
      redirect: "/",
      user: { id: data.user.id, email: data.user.email, role: "customer" },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 200 });
  }
}
