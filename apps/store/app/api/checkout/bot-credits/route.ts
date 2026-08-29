import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { stripe } from "../../../lib/stripe";
import { getCustomerFromCookies } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  try {
    const customerAuth = await getCustomerFromCookies();
    if (!customerAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { planId } = body;
    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const plan = await prisma.botPlan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: "Invalid or inactive plan" }, { status: 404 });
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "egp",
            product_data: {
              name: `Manikan Bot Credits: ${plan.name} Plan`,
              description: `${plan.credits} AI Try-on Generations via Telegram`,
            },
            unit_amount: plan.priceInCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/bot-plans?success=true`,
      cancel_url: `${origin}/bot-plans?canceled=true`,
      metadata: {
        type: "bot_credits",
        customerId: customerAuth.sub,
        botPlanId: plan.id,
      },
      customer_email: customerAuth.email,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[checkout/bot-credits] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
