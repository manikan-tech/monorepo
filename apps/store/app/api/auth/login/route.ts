import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { prisma } from "../../../lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, role } = body;

    // ── Validation ─────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // ── Sign in via Supabase Auth ──────────────────────────
    const supabase = await createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (signInError) {
      console.error("Supabase login error:", signInError);

      // Supabase returns `invalid_credentials` for BOTH wrong password AND
      // unconfirmed email. Use the admin client to distinguish the two cases.
      if (
        signInError.code === "invalid_credentials" ||
        signInError.message?.toLowerCase().includes("email not confirmed") ||
        signInError.message?.toLowerCase().includes("invalid login credentials")
      ) {
        try {
          const { supabaseAdmin } = await import("../../../lib/supabase/admin");
          const { data: adminData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = adminData?.users?.find(
            (u) => u.email?.toLowerCase() === email.toLowerCase().trim()
          );

          if (existingUser && !existingUser.email_confirmed_at) {
            // User exists but hasn't confirmed their email yet
            return NextResponse.json(
              {
                error: "Please verify your email before signing in",
                requiresActivation: true,
                email: email.toLowerCase().trim(),
              },
              { status: 403 }
            );
          }
        } catch (adminErr) {
          console.error("Admin lookup error:", adminErr);
          // Fall through to generic error
        }
      }

      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (!data.user) {
      return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
    }

    // ── Check Role in Database ─────────────────────────────
    // To know where to redirect, we check if they are a Customer or Retailer
    const customer = await prisma.customer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (customer) {
      if (role === "retailer") {
        return NextResponse.json(
          { error: "This email belongs to a customer, please select Login as Customer." },
          { status: 403 }
        );
      }
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
        return NextResponse.json(
          { error: "This email belongs to a retailer, please select Login as Retailer." },
          { status: 403 }
        );
      }

      // Update the Retailer's authId to match Supabase if it wasn't already synced
      if (retailer.authId !== data.user.id) {
        await prisma.retailer.update({
          where: { id: retailer.id },
          data: { authId: data.user.id },
        });
      }

      return NextResponse.json({
        success: true,
        redirect: "/dashboard",
        user: { id: data.user.id, email: data.user.email, role: "retailer" },
      });
    }

    // If they exist in Supabase but not in our DB, default to customer redirect
    return NextResponse.json({
      success: true,
      redirect: "/",
      user: { id: data.user.id, email: data.user.email, role: "customer" },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
