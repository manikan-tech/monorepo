import { Prisma } from "@prisma/client";
import Stripe from "stripe";

import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeRecord = Record<string, unknown>;

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
 * Extract identifiers only from the verified Stripe event. `retailerId` must
 * be set in subscription Checkout metadata by our authenticated server-side
 * checkout creation endpoint; it is never accepted from this HTTP request.
 */
function getBillingIdentifiers(object: unknown) {
  const payload = asRecord(object) ?? {};
  const subscriptionDetails = asRecord(
    asRecord(payload.parent)?.subscription_details,
  );

  return {
    customerId: stripeId(payload.customer),
    subscriptionId:
      stripeId(payload.subscription) ??
      stripeId(subscriptionDetails?.subscription),
    retailerId:
      metadataValue(payload.metadata, "retailerId") ??
      metadataValue(subscriptionDetails?.metadata, "retailerId"),
  };
}

async function createEventIfNew(
  db: Prisma.TransactionClient,
  event: Stripe.Event,
): Promise<boolean> {
  // PostgreSQL's ON CONFLICT avoids a unique-constraint exception, which would
  // otherwise abort the surrounding transaction before we can return 200.
  const inserted = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "StripeWebhookEvent" ("id", "type")
    VALUES (${event.id}, ${event.type})
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  `;
  return inserted.length === 1;
}

async function requireRetailer(
  db: Prisma.TransactionClient,
  retailerId: string,
) {
  const retailer = await db.retailer.findUnique({
    where: { id: retailerId },
    select: { id: true },
  });
  if (!retailer) {
    // Retry rather than map a valid event to a different tenant.
    throw new Error("Verified Stripe event refers to an unknown retailer");
  }
}

async function activateSubscription(
  db: Prisma.TransactionClient,
  object: unknown,
) {
  const { customerId, subscriptionId, retailerId } =
    getBillingIdentifiers(object);
  if (!customerId)
    throw new Error("Verified Stripe event is missing a customer identifier");

  if (retailerId) {
    await requireRetailer(db, retailerId);
    await db.subscription.upsert({
      where: { retailerId },
      create: {
        retailerId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: "ACTIVE",
      },
      update: {
        stripeCustomerId: customerId,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        status: "ACTIVE",
      },
    });
    return;
  }

  // Invoice events are mapped through the Stripe customer saved at checkout.
  const result = await db.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: { status: "ACTIVE" },
  });
  if (result.count !== 1) {
    throw new Error(
      "No subscription is mapped to this verified Stripe customer",
    );
  }
}

async function markPastDue(db: Prisma.TransactionClient, object: unknown) {
  const { customerId } = getBillingIdentifiers(object);
  if (!customerId)
    throw new Error("Verified invoice is missing a customer identifier");

  const result = await db.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: { status: "PAST_DUE" },
  });
  if (result.count !== 1) {
    throw new Error(
      "No subscription is mapped to this verified Stripe customer",
    );
  }
}

async function cancelSubscription(
  db: Prisma.TransactionClient,
  object: unknown,
) {
  const { customerId, subscriptionId } = getBillingIdentifiers(object);
  if (!customerId && !subscriptionId) {
    throw new Error("Verified subscription is missing identifiers");
  }

  const result = await db.subscription.updateMany({
    where: subscriptionId
      ? { stripeSubscriptionId: subscriptionId }
      : { stripeCustomerId: customerId! },
    data: { status: "CANCELLED" },
  });
  if (result.count !== 1) {
    throw new Error(
      "No subscription is mapped to this verified Stripe subscription",
    );
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeSecretKey) {
    console.error("Stripe webhook configuration is incomplete");
    return new Response("Webhook configuration error", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return new Response("Missing Stripe signature", { status: 400 });

  let event: Stripe.Event;
  try {
    // Use the raw body: JSON parsing before constructEvent breaks verification.
    const rawBody = await request.text();
    event = new Stripe(stripeSecretKey).webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (error) {
    // Never log raw bodies, signatures, or secrets; they can contain PII.
    console.warn("Rejected Stripe webhook with an invalid signature", {
      reason:
        error instanceof Error ? error.message : "Unknown verification error",
    });
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  try {
    const duplicate = await prisma.$transaction(async (tx) => {
      if (!(await createEventIfNew(tx, event))) return true;

      switch (event.type) {
        case "checkout.session.completed":
        case "invoice.payment_succeeded":
          await activateSubscription(tx, event.data.object);
          break;
        case "invoice.payment_failed":
          await markPastDue(tx, event.data.object);
          break;
        case "customer.subscription.deleted":
          await cancelSubscription(tx, event.data.object);
          break;
        default:
          // Acknowledge unrelated, verified events without changing access.
          break;
      }
      return false;
    });

    return Response.json({
      received: true,
      ...(duplicate ? { duplicate: true } : {}),
    });
  } catch (error) {
    // A 500 tells Stripe to retry a verified event that was not persisted.
    console.error("Failed to process verified Stripe webhook", {
      eventId: event.id,
      eventType: event.type,
      reason:
        error instanceof Error ? error.message : "Unknown processing error",
    });
    return new Response("Webhook processing failed", { status: 500 });
  }
}
