import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { stripe } from "../../../../lib/stripe";

// ─── POST /api/retailer/billing/checkout ───────────────────────────────
// Starts (or activates) a subscription for ONE service's plan. Each service
// is billed independently -- this always creates/targets exactly one
// Subscription row scoped to plan.service, never a bundle across all three.
//
// Free-tier plans (priceEgpMonthly === 0) are activated immediately with no
// Stripe involvement -- there's nothing to charge, so sending the retailer
// through Stripe Checkout for a zero-amount line item would be pointless
// friction.
//
// Paid plans create a real Stripe Checkout Session using whatever
// STRIPE_SECRET_KEY is configured (test mode by convention -- see
// .env.example, sk_test_...). Switching to live keys / charging real
// retailers is a distinct, later decision this route does not make.
//
// BillingCheckout is written BEFORE redirecting to Stripe and is the tenant
// + plan authority the webhook trusts (see app/api/webhooks/billing/route.ts)
// -- Stripe session metadata there is only a defense-in-depth cross-check.
//
// Known simplification: changing FROM one paid plan TO another paid plan
// creates a fresh Stripe subscription rather than modifying the existing
// one. Fine for exercising the loop end-to-end; real plan-switching without
// double-billing needs Stripe's subscription-update API, not built here.
export async function POST(request: NextRequest) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { planId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.planId !== "string" || !body.planId) {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { id: true, email: true, isActivated: true },
  });
  if (!retailer || !retailer.isActivated) {
    return NextResponse.json(
      { error: "Forbidden: Account is pending activation." },
      { status: 403 }
    );
  }

  const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 404 });
  }

  const existing = await prisma.subscription.findFirst({
    where: { retailerId: retailer.id, service: plan.service },
    orderBy: { createdAt: "desc" },
  });

  // ── Free tier: activate directly, no Stripe involved ──
  if (plan.priceEgpMonthly === 0) {
    if (existing?.stripeSubscriptionId) {
      return NextResponse.json(
        {
          error:
            "You have an active paid subscription for this service. Downgrading to Free isn't supported here yet.",
        },
        { status: 409 }
      );
    }

    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { planId: plan.id, status: "ACTIVE" },
      });
    } else {
      await prisma.subscription.create({
        data: {
          retailerId: retailer.id,
          service: plan.service,
          planId: plan.id,
          // No real Stripe customer exists for a free plan; a synthetic,
          // clearly-non-Stripe id (real ones are always "cus_...") keeps the
          // required column satisfied without implying a Stripe identity.
          stripeCustomerId: `free_${retailer.id}`,
          status: "ACTIVE",
        },
      });
    }

    return NextResponse.json({ activated: true });
  }

  // ── Paid tier: real Stripe Checkout Session ──
  const origin = request.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: retailer.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "egp",
          unit_amount: Math.round(plan.priceEgpMonthly * 100),
          recurring: { interval: "month" },
          product_data: { name: `Manikan ${plan.name} — ${plan.service}` },
        },
      },
    ],
    metadata: { retailerId: retailer.id, planId: plan.id, service: plan.service },
    success_url: `${origin}/dashboard/services?checkout=success`,
    cancel_url: `${origin}/dashboard/services?checkout=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 502 }
    );
  }

  // Recorded BEFORE redirecting -- the tenant+plan authority the webhook
  // trusts, per the schema's own design (see BillingCheckout above).
  await prisma.billingCheckout.create({
    data: {
      stripeCheckoutSessionId: session.id,
      retailerId: retailer.id,
      service: plan.service,
      planId: plan.id,
    },
  });

  return NextResponse.json({ url: session.url });
}
