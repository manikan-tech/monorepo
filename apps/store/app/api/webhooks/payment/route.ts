import type Stripe from "stripe";

import { stripe } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── POST /api/webhooks/payment ───────────────────────────────────────────────
// Receives payment_intent.succeeded events from Stripe and links the
// PaymentIntent ID to the corresponding Order row so that the return/refund
// route can look up the Stripe identifier when processing a full return.
//
// Stripe retries delivery until a 2xx is returned, so all state writes must be
// idempotent.  Event deduplication is handled by the stripePaymentIntentId
// unique constraint on the Order table: a second delivery of the same event
// produces a no-op update (the value is already set).
//
// Event → Order matching strategy
// ────────────────────────────────
// When a customer completes checkout, the client is expected to pass the Stripe
// PaymentIntent ID in the order creation body OR the relevant metadata must be
// attached to the PaymentIntent at creation time.  This webhook handles the
// asynchronous confirmation path: it reads `paymentIntent.metadata.orderId` and
// updates the corresponding Order record.
//
// IMPORTANT: Ensure your checkout flow sets `metadata: { orderId }` when
// creating the PaymentIntent server-side.  See the inline note in this file for
// the recommended checkout API change.
export async function POST(request: Request) {
    const webhookSecret = process.env.STRIPE_PAYMENT_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error("[payment-webhook] STRIPE_PAYMENT_WEBHOOK_SECRET is not set");
        return new Response("Webhook configuration error", { status: 500 });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
        return new Response("Missing Stripe signature", { status: 400 });
    }

    let event: Stripe.Event;
    try {
        const rawBody = await request.text();
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
        console.warn("[payment-webhook] Rejected webhook with invalid signature");
        return new Response("Invalid Stripe signature", { status: 400 });
    }

    if (event.type !== "payment_intent.succeeded") {
        // Any other event type is acknowledged without processing.
        return Response.json({ received: true, skipped: true });
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const orderId = paymentIntent.metadata?.orderId;

    if (!orderId) {
        // No order binding in metadata — this PaymentIntent was created outside the
        // order checkout flow (e.g., a billing subscription charge).  Skip silently.
        return Response.json({ received: true, skipped: true });
    }

    try {
        // updateMany is used because update would throw P2025 if the order does not
        // exist, which would cause a spurious 500 and a Stripe retry.  A count of 0
        // simply means the order was not found — log and acknowledge so Stripe does
        // not keep retrying a permanently unresolvable event.
        const result = await prisma.order.updateMany({
            where: {
                id: orderId,
                // Idempotency: skip if the PaymentIntent is already recorded.
                stripePaymentIntentId: null,
            },
            data: {
                stripePaymentIntentId: paymentIntent.id,
                paymentStatus: "PAID",
            },
        });

        if (result.count === 0) {
            // Either the order does not exist, or this event was already processed.
            // Both cases are safe to acknowledge without error.
            console.info("[payment-webhook] Order not updated (not found or already processed)", {
                orderId,
                paymentIntentId: paymentIntent.id,
            });
        } else {
            console.info("[payment-webhook] Order payment confirmed", {
                orderId,
                paymentIntentId: paymentIntent.id,
            });
        }

        return Response.json({ received: true });
    } catch (error) {
        // Return 500 so Stripe retries the delivery.
        console.error("[payment-webhook] Failed to update order", {
            orderId,
            paymentIntentId: paymentIntent.id,
            reason: error instanceof Error ? error.message : "Unknown error",
        });
        return new Response("Failed to process payment event", { status: 500 });
    }
}
