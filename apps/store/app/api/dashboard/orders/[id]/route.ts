import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { stripe } from "../../../../lib/stripe";
import { prisma } from "../../../../lib/prisma";
import { getAuthFromCookies } from "../../../../lib/auth";
import { getAdminSession } from "../../../../lib/admin-auth";

export const runtime = "nodejs";

// ─── Return window ────────────────────────────────────────────────────────────
// Orders that were delivered more than RETURN_WINDOW_DAYS ago are no longer
// eligible for a return.  Adjust the constant to match your business policy.
const RETURN_WINDOW_DAYS = 30;

// ─── Typed error class ────────────────────────────────────────────────────────
class ReturnRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ReturnRequestError";
  }
}

function isSerializationError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    if (
      error.code === "P2010" &&
      (error.message.includes("40001") ||
        error.message.includes("could not serialize access"))
    ) {
      return true;
    }
  }
  return false;
}

function errorResponse(error: ReturnRequestError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: 200 },
  );
}

// ─── PATCH /api/dashboard/orders/[id] ────────────────────────────────────────
// Processes a full order return using a three-phase saga pattern:
//
//  Phase 1 (DB tx):  Row-lock the order, validate eligibility, and set
//                    status = RETURN_PENDING so that concurrent requests see
//                    a terminal-like state immediately.
//
//  Phase 2 (Stripe): Issue the refund OUTSIDE the database transaction so the
//                    connection is not held open during the network round-trip.
//                    The idempotency key makes this safe to retry.
//
//  Phase 3 (DB tx):  Restock each variant and flip the order to
//                    RETURNED / REFUNDED, recording the Stripe refund ID.
//
// If Phase 2 succeeds but Phase 3 fails, the order sits in RETURN_PENDING with
// the refund already paid out.  A reconciliation job (or the ops team) can detect
// this state via: SELECT * FROM "Order" WHERE status = 'RETURN_PENDING'.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [retailer, adminSession] = await Promise.all([
    getAuthFromCookies(),
    getAdminSession(),
  ]);

  if (!retailer && !adminSession) {
    return NextResponse.json(
      { error: "Authentication is required", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // ── Request body ──────────────────────────────────────────────────────────
  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const { id: orderId } = await params;

  if (body.status !== "RETURNED") {
    // ─────────────────────────────────────────────────────────────────────────
    // SIMPLE STATUS UPDATE (non-return)
    // ─────────────────────────────────────────────────────────────────────────
    const ALLOWED_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURN_PENDING", "RETURNED"];

    try {
      if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status", code: "INVALID_STATUS" }, { status: 400 });
      }

      // Retailers can only update orders they own
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } }
      });

      if (!order) {
        return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
      }

      if (retailer && !adminSession) {
        const ownsOrder = order.items.every(item => item.product.retailerId === retailer.sub);
        if (!ownsOrder) {
          return NextResponse.json({ error: "Not authorized", code: "FORBIDDEN" }, { status: 403 });
        }
      }

      const updateData: any = {};
      if (body.status) {
        updateData.status = body.status;
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: updateData
      });

      return NextResponse.json({ order: updatedOrder });
    } catch (error) {
      console.error("[dashboard/orders] simple update failed", error);
      return NextResponse.json({ error: "Failed to update order", code: "UPDATE_FAILED" }, { status: 500 });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Validate eligibility and claim the order atomically.
  // ─────────────────────────────────────────────────────────────────────────
  // Uses FOR UPDATE row-locking so that two concurrent return requests for the
  // same order serialise here; the second will see status = RETURN_PENDING and
  // be rejected before any Stripe call is made.
  let stripePaymentIntentId: string;

  try {
    stripePaymentIntentId = await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "Order"
          WHERE "id" = ${orderId}
          FOR UPDATE
        `;

        if (locked.length === 0) {
          throw new ReturnRequestError("Order not found", 404, "ORDER_NOT_FOUND");
        }

        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            items: {
              include: {
                product: { select: { retailerId: true } },
              },
            },
          },
        });

        // Authorization: admins may return any order; retailers only their own.
        if (
          retailer &&
          !adminSession &&
          !order.items.every(
            (item) => item.product.retailerId === retailer.sub,
          )
        ) {
          throw new ReturnRequestError(
            "You are not authorized to return this order",
            403,
            "FORBIDDEN",
          );
        }

        // Status eligibility check — also blocks re-entrant requests once
        // Phase 1 has already completed (RETURN_PENDING or RETURNED).
        if (order.status === "RETURN_PENDING") {
          throw new ReturnRequestError(
            "A return is already being processed for this order",
            409,
            "RETURN_ALREADY_IN_PROGRESS",
          );
        }

        if (order.status === "RETURNED") {
          throw new ReturnRequestError(
            "This order has already been returned",
            409,
            "ORDER_ALREADY_RETURNED",
          );
        }

        if (order.status !== "DELIVERED" || order.paymentStatus !== "PAID") {
          throw new ReturnRequestError(
            "Only delivered orders with a paid payment status are eligible for return",
            400,
            "ORDER_NOT_ELIGIBLE_FOR_RETURN",
          );
        }

        // Return window enforcement.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - RETURN_WINDOW_DAYS);
        if (order.updatedAt < cutoff) {
          throw new ReturnRequestError(
            `Returns are only accepted within ${RETURN_WINDOW_DAYS} days of delivery`,
            400,
            "RETURN_WINDOW_EXPIRED",
          );
        }

        if (!order.stripePaymentIntentId) {
          throw new ReturnRequestError(
            "This order has no refundable payment record",
            400,
            "PAYMENT_INTENT_MISSING",
          );
        }

        // Claim the order: mark it as RETURN_PENDING so any concurrent request
        // hitting Phase 1 above will see this state and be rejected immediately,
        // before a second Stripe refund is attempted.
        await tx.order.update({
          where: { id: orderId },
          data: { status: "RETURN_PENDING" },
        });

        return order.stripePaymentIntentId;
      },
      // Serializable prevents phantom reads across the validation checks.
      // maxWait / timeout are intentionally short — Phase 1 never makes
      // network calls, so it should complete in milliseconds.
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
    );
  } catch (error) {
    if (error instanceof ReturnRequestError) return errorResponse(error);

    if (isSerializationError(error)) {
      return NextResponse.json(
        {
          error:
            "A concurrent request conflict was detected — please try again",
          code: "SERIALIZATION_FAILURE",
        },
        { status: 409 },
      );
    }

    console.error("[order-return] Phase 1 (eligibility check) failed", error);
    return NextResponse.json(
      {
        error: "Unable to process the return at this time",
        code: "RETURN_PROCESSING_FAILED",
      },
      { status: 500 },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Issue the Stripe refund OUTSIDE any database transaction.
  // ─────────────────────────────────────────────────────────────────────────
  // The database connection is fully released before this network call.
  // The idempotency key ensures that retrying this exact request never
  // double-charges the customer even if the process crashes and restarts.
  let stripeRefundId: string;

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: stripePaymentIntentId },
      { idempotencyKey: `order-return-refund:${orderId}` },
    );

    // "succeeded" — refund is immediate (card payments).
    // "pending"   — refund is asynchronous (bank transfers, etc.); funds will
    //               arrive via the refund.updated webhook.
    // Both are valid outcomes.  Only "failed" or "canceled" are errors.
    if (refund.status === "failed" || refund.status === "canceled") {
      throw new ReturnRequestError(
        "The payment gateway declined or cancelled the refund",
        502,
        "REFUND_NOT_COMPLETED",
      );
    }

    stripeRefundId = refund.id;
  } catch (error) {
    if (error instanceof ReturnRequestError) {
      // Roll Phase 1 back — restore the order to DELIVERED so the UI can retry.
      await prisma.order
        .update({
          where: { id: orderId },
          data: { status: "DELIVERED" },
        })
        .catch((rollbackError) => {
          // Rollback failure is non-fatal for the current request but must
          // be investigated.  The order sits in RETURN_PENDING; the ops team
          // can reset it manually or via a reconciliation job.
          console.error("[order-return] Phase 1 rollback failed", {
            orderId,
            rollbackError:
              rollbackError instanceof Error
                ? rollbackError.message
                : "Unknown",
          });
        });

      return errorResponse(error);
    }

    if (
      error instanceof Error &&
      (error.name.startsWith("Stripe") ||
        error.constructor.name.startsWith("Stripe") ||
        (error as any).rawType)
    ) {
      console.error("[order-return] Stripe refund request failed", {
        orderId,
        errorMessage: error.message,
      });

      // Best-effort rollback so the order is not stranded in RETURN_PENDING.
      await prisma.order
        .update({ where: { id: orderId }, data: { status: "DELIVERED" } })
        .catch(() => {
          console.error(
            "[order-return] Phase 1 rollback after Stripe error failed",
            { orderId },
          );
        });

      return NextResponse.json(
        {
          error: "The payment gateway could not process the refund",
          code: "REFUND_GATEWAY_ERROR",
        },
        { status: 502 },
      );
    }

    console.error("[order-return] Phase 2 (Stripe refund) failed unexpectedly", {
      orderId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      {
        error: "Unable to process the return at this time",
        code: "RETURN_PROCESSING_FAILED",
      },
      { status: 500 },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Restock inventory and finalise the order record.
  // ─────────────────────────────────────────────────────────────────────────
  // If this transaction fails after a successful Phase 2, the customer has
  // already been refunded.  The order stays in RETURN_PENDING with no
  // refundReferenceId — a reconciliation job can detect and heal this.
  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const orderWithItems = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: { items: true },
        });

        // Restock each variant that was part of the order.
        for (const item of orderWithItems.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }

        return tx.order.update({
          where: { id: orderId },
          data: {
            status: "RETURNED",
            paymentStatus: "REFUNDED",
            refundReferenceId: stripeRefundId,
          },
        });
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
    );

    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    // Phase 2 has already succeeded — the customer's money is returned.
    // Log enough context for a manual or automated reconciliation to finalise.
    console.error(
      "[order-return] Phase 3 (finalisation) failed — order is stranded in RETURN_PENDING. " +
      "Stripe refund has already been issued. Manual reconciliation required.",
      {
        orderId,
        stripeRefundId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    );

    if (isSerializationError(error)) {
      return NextResponse.json(
        {
          error: "A concurrent request conflict was detected — please try again",
          code: "SERIALIZATION_FAILURE",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error:
          "The refund was issued successfully but order records could not be updated. " +
          "Please contact support with your order ID.",
        code: "FINALISATION_FAILED",
        stripeRefundId,
      },
      { status: 500 },
    );
  }
}
