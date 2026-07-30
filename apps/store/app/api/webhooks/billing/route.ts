import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { stripe } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeRecord = Record<string, unknown>;
type ProcessingResult = "processed" | "duplicate" | "stale";

function asRecord(value: unknown): StripeRecord | undefined {
  return value !== null && typeof value === "object"
    ? (value as StripeRecord)
    : undefined;
}

function stripeId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return typeof record?.id === "string" ? record.id : undefined;
}

function metadataValue(value: unknown, key: string): string | undefined {
  const candidate = asRecord(value)?.[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : undefined;
}

/**
 * Extracts the immutable Stripe subscription identifier for supported events.
 * Subscription events use their object ID; invoice events reference a parent
 * subscription. Customer IDs are deliberately never used as a fallback.
 */
function getSubscriptionIdForEvent(event: Stripe.Event): string | undefined {
  const payload = event.data.object as unknown as StripeRecord;

  if (event.type === "customer.subscription.deleted") {
    return typeof payload.id === "string" ? payload.id : undefined;
  }

  if (event.type === "checkout.session.completed") {
    return stripeId(payload.subscription);
  }

  if (
    event.type === "invoice.payment_succeeded" ||
    event.type === "invoice.payment_failed"
  ) {
    const parent = asRecord(payload.parent);
    const details = asRecord(parent?.subscription_details);
    return stripeId(payload.subscription) ?? stripeId(details?.subscription);
  }

  return undefined;
}

function getCustomerId(object: unknown): string | undefined {
  return stripeId(asRecord(object)?.customer);
}

function isOlderThanLastEvent(
  lastStripeEventAt: number,
  incomingEventAt: number,
): boolean {
  return incomingEventAt < lastStripeEventAt;
}

async function createEventIfNew(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
): Promise<boolean> {
  // ON CONFLICT avoids a unique-constraint exception that would abort the
  // transaction before the handler could safely acknowledge a duplicate.
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "StripeWebhookEvent" ("id", "type")
    VALUES (${event.id}, ${event.type})
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  `;
  return inserted.length === 1;
}

async function activateCheckoutSubscription(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
): Promise<"processed" | "stale"> {
  const session = event.data.object as unknown as StripeRecord;
  const checkoutSessionId =
    typeof session.id === "string" ? session.id : undefined;
  const subscriptionId = getSubscriptionIdForEvent(event);
  const customerId = getCustomerId(session);

  if (
    session.mode !== "subscription" ||
    !checkoutSessionId ||
    !subscriptionId ||
    !customerId
  ) {
    throw new Error(
      "Verified Checkout Session is missing required subscription data",
    );
  }

  const checkout = await tx.billingCheckout.findUnique({
    where: { stripeCheckoutSessionId: checkoutSessionId },
    select: { retailerId: true },
  });
  if (!checkout) {
    throw new Error(
      "Verified Checkout Session has no server-side tenant binding",
    );
  }

  // Metadata is only a defense-in-depth consistency check. BillingCheckout is
  // the tenant authority because it was recorded by the authenticated server.
  const metadataRetailerId = metadataValue(session.metadata, "retailerId");
  if (metadataRetailerId && metadataRetailerId !== checkout.retailerId) {
    throw new Error(
      "Verified Checkout Session tenant metadata does not match binding",
    );
  }

  const existing = await tx.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: {
      retailerId: true,
      stripeCustomerId: true,
      lastStripeEventAt: true,
    },
  });

  if (existing) {
    if (
      existing.retailerId !== checkout.retailerId ||
      existing.stripeCustomerId !== customerId
    ) {
      throw new Error(
        "Stripe subscription identity conflicts with tenant binding",
      );
    }
    if (isOlderThanLastEvent(existing.lastStripeEventAt, event.created)) {
      return "stale";
    }

    await tx.subscription.update({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: "ACTIVE", lastStripeEventAt: event.created },
    });
    return "processed";
  }

  await tx.subscription.create({
    data: {
      retailerId: checkout.retailerId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: "ACTIVE",
      lastStripeEventAt: event.created,
    },
  });
  return "processed";
}

async function updateSubscriptionStatus(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED",
): Promise<"processed" | "stale"> {
  const subscriptionId = getSubscriptionIdForEvent(event);
  const customerId = getCustomerId(event.data.object);

  if (!subscriptionId || !customerId) {
    throw new Error("Verified Stripe event is missing subscription identity");
  }

  const subscription = await tx.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { stripeCustomerId: true, lastStripeEventAt: true },
  });
  if (!subscription || subscription.stripeCustomerId !== customerId) {
    throw new Error(
      "Verified Stripe event does not match a known subscription",
    );
  }
  if (isOlderThanLastEvent(subscription.lastStripeEventAt, event.created)) {
    return "stale";
  }

  await tx.subscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: { status, lastStripeEventAt: event.created },
  });
  return "processed";
}

async function processEvent(event: Stripe.Event): Promise<ProcessingResult> {
  return prisma.$transaction(async (tx) => {
    if (!(await createEventIfNew(tx, event))) return "duplicate";

    switch (event.type) {
      case "checkout.session.completed":
        return activateCheckoutSubscription(tx, event);
      case "invoice.payment_succeeded":
        return updateSubscriptionStatus(tx, event, "ACTIVE");
      case "invoice.payment_failed":
        return updateSubscriptionStatus(tx, event, "PAST_DUE");
      case "customer.subscription.deleted":
        return updateSubscriptionStatus(tx, event, "CANCELLED");
      default:
        // Verified but unsupported events are recorded and acknowledged.
        return "processed";
    }
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Stripe webhook configuration is incomplete");
    return new Response("Webhook configuration error", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return new Response("Missing Stripe signature", { status: 400 });

  let event: Stripe.Event;
  try {
    // Stripe signature verification must receive the exact, unparsed body.
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    // Do not log signatures, raw payloads, secrets, or verification stacks.
    console.warn("Rejected Stripe webhook with an invalid signature");
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  try {
    const result = await processEvent(event);
    return Response.json({
      received: true,
      ...(result === "duplicate" ? { duplicate: true } : {}),
      ...(result === "stale" ? { stale: true } : {}),
    });
  } catch (error) {
    // A 500 causes Stripe to retry. Only safe event metadata is logged.
    console.error("Failed to process verified Stripe webhook", {
      eventId: event.id,
      eventType: event.type,
      reason:
        error instanceof Error ? error.message : "Unknown processing error",
    });
    return new Response("Webhook processing failed", { status: 500 });
  }
}
