import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { stripe } from "../../../lib/stripe";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Stripe webhook configuration is incomplete");
    return NextResponse.json({ error: "Webhook configuration error" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.warn("Rejected Stripe webhook with an invalid signature");
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata?.type === "bot_credits") {
      const { customerId, botPlanId } = metadata;

      if (!customerId || !botPlanId) {
        console.error("Missing metadata for bot_credits checkout session");
        return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Verify session hasn't been processed
          const existing = await tx.botPurchase.findUnique({
            where: { stripeSessionId: session.id },
          });
          if (existing) return;

          const plan = await tx.botPlan.findUnique({ where: { id: botPlanId } });
          if (!plan) throw new Error("Bot plan not found");

          // Record the purchase
          await tx.botPurchase.create({
            data: {
              customerId,
              botPlanId,
              amountPaidCents: session.amount_total || plan.priceInCents,
              stripeSessionId: session.id,
            },
          });

          // Increment the customer's credits
          await tx.customer.update({
            where: { id: customerId },
            data: {
              purchasedBotCredits: {
                increment: plan.credits,
              },
            },
          });
        });
      } catch (error) {
        console.error("Error processing bot_credits webhook:", error);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
