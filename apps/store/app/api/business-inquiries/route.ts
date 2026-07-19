import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { checkRateLimit } from "../../lib/rate-limit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 5 submissions per 10 minutes per IP — stricter than the widget limiter
const IP_RATE_LIMIT_MAX = 5;
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.ip ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rateLimit = checkRateLimit(
      `business-inquiry:${ip}`,
      IP_RATE_LIMIT_MAX,
      IP_RATE_LIMIT_WINDOW_MS
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many requests. Please wait ${rateLimit.retryAfter} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    
    const { companyName, contactName, email, phone, website, monthlyOrders, message } =
      body ?? {};

    const fieldErrors: Record<string, string> = {};

    if (!companyName?.trim()) {
      fieldErrors.companyName = "Company name is required";
    }

    if (!contactName?.trim()) {
      fieldErrors.contactName = "Contact name is required";
    }

    if (!email?.trim() || !EMAIL_REGEX.test(email.trim())) {
      fieldErrors.email = "A valid email address is required";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json({ error: "Validation failed", fieldErrors }, { status: 400 });
    }

    const inquiry = await prisma.businessInquiry.create({
      data: {
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        monthlyOrders: monthlyOrders || null,
        message: message?.trim() || null,
      },
    });


    return NextResponse.json({ success: true, id: inquiry.id }, { status: 201 });
  } catch (error) {
    console.error("Business inquiry error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
