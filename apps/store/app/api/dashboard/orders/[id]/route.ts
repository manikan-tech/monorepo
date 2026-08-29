import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { getAuthFromCookies } from "../../../../lib/auth";
import { getAdminSession } from "../../../../lib/admin-auth";

export const runtime = "nodejs";

// ─── Return window ────────────────────────────────────────────────────────────
const RETURN_WINDOW_DAYS = 30;

// ─── Order Status State Machine (retailer-side transitions only) ──────────────
//
// This map defines the ONLY status transitions the retailer dashboard may
// trigger via a simple { status: "..." } request body.
//
// Payment status is NOT a manual field — it is derived from the order lifecycle:
//   · DELIVERED           → paymentStatus automatically becomes PAID
//                           (Cash-on-Delivery: payment occurs at delivery)
//   · RETURNED            → paymentStatus automatically becomes REFUNDED
//                           (triggered only by the APPROVE_RETURN action)
//   · CANCELLED           → paymentStatus stays PENDING (no payment exchanged)
//   · All other statuses  → paymentStatus unchanged
//
// Customer-side transitions (PENDING → CANCELLED, DELIVERED → RETURN_PENDING)
// are enforced in /api/orders/[id] and are NOT repeated here.
//
// APPROVE_RETURN and REJECT_RETURN are explicit named actions — not raw status
// values — because they carry additional side-effects (restock, payment update).
const RETAILER_VALID_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  PENDING:        ["CONFIRMED", "CANCELLED"],
  CONFIRMED:      ["PROCESSING", "CANCELLED"],
  PROCESSING:     ["SHIPPED", "CANCELLED"],
  SHIPPED:        ["DELIVERED"],
  DELIVERED:      [],           // Only customer can move this → RETURN_PENDING
  RETURN_PENDING: [],           // Only APPROVE_RETURN / REJECT_RETURN actions allowed
  RETURNED:       [],           // Terminal
  CANCELLED:      [],           // Terminal
} as const;

// Payment status that should be set when transitioning to a given order status.
// Only DELIVERED and RETURNED trigger a payment status change — all other
// fulfillment status changes leave payment status untouched.
const PAYMENT_STATUS_FOR_ORDER_STATUS: Readonly<Record<string, string>> = {
  DELIVERED: "PAID",      // COD: money received at delivery
  CANCELLED: "PENDING",   // No payment was made; reset to PENDING
} as const;

// ─── Typed error class ────────────────────────────────────────────────────────
class OrderActionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "OrderActionError";
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

function errorResponse(error: OrderActionError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.statusCode },
  );
}

// ─── Auth + ownership helper ──────────────────────────────────────────────────
async function resolveOrderWithAuth(
  orderId: string,
  retailer: Awaited<ReturnType<typeof getAuthFromCookies>>,
  adminSession: Awaited<ReturnType<typeof getAdminSession>>,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { product: { select: { retailerId: true } } },
      },
    },
  });

  if (!order) {
    return { order: null, forbidden: false };
  }

  if (retailer && !adminSession) {
    const ownsOrder = order.items.every(
      (item) => item.product.retailerId === retailer.sub,
    );
    if (!ownsOrder) {
      return { order: null, forbidden: true };
    }
  }

  return { order, forbidden: false };
}

// ─── PATCH /api/dashboard/orders/[id] ────────────────────────────────────────
//
// Accepted body shapes:
//
//   { status: "<new_status>" }     — Simple status transition (validated against
//                                    RETAILER_VALID_TRANSITIONS). Payment status
//                                    is automatically adjusted for DELIVERED and
//                                    CANCELLED transitions.
//
//   { action: "APPROVE_RETURN" }   — Approve a customer's return request.
//                                    Restocks all items, sets order → RETURNED
//                                    and payment → REFUNDED atomically.
//
//   { action: "REJECT_RETURN" }    — Reject a customer's return request.
//                                    Restores order → DELIVERED.
//                                    Payment stays PAID.
//
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Request body ────────────────────────────────────────────────────────────
  let body: { status?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const { id: orderId } = await params;

  // ── Route to correct handler ─────────────────────────────────────────────────
  if (body.action === "APPROVE_RETURN") {
    return handleApproveReturn(orderId, retailer, adminSession);
  }

  if (body.action === "REJECT_RETURN") {
    return handleRejectReturn(orderId, retailer, adminSession);
  }

  if (body.status) {
    return handleStatusUpdate(orderId, body.status, retailer, adminSession);
  }

  return NextResponse.json(
    { error: "Request body must contain 'status' or 'action'", code: "MISSING_FIELD" },
    { status: 400 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER 1: Simple status transition
//
// Validates the transition, then updates order status.
// For DELIVERED: also sets paymentStatus = PAID (COD model).
// For CANCELLED: also sets paymentStatus = PENDING (no payment made).
// All other transitions: paymentStatus is NOT changed.
// ─────────────────────────────────────────────────────────────────────────────
async function handleStatusUpdate(
  orderId: string,
  newStatus: string,
  retailer: Awaited<ReturnType<typeof getAuthFromCookies>>,
  adminSession: Awaited<ReturnType<typeof getAdminSession>>,
): Promise<NextResponse> {
  if (!(newStatus in RETAILER_VALID_TRANSITIONS)) {
    return NextResponse.json(
      { error: `'${newStatus}' is not a known order status.`, code: "UNKNOWN_STATUS" },
      { status: 400 },
    );
  }

  try {
    const { order, forbidden } = await resolveOrderWithAuth(orderId, retailer, adminSession);

    if (forbidden) {
      return NextResponse.json(
        { error: "Not authorized to update this order", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: "Order not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const allowedNext = RETAILER_VALID_TRANSITIONS[order.status] ?? [];

    if (!allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition order from '${order.status}' to '${newStatus}'. Valid next statuses: [${allowedNext.join(", ") || "none"}].`,
          code: "INVALID_TRANSITION",
        },
        { status: 409 },
      );
    }

    // Build the update payload. Payment status is automatically derived:
    //   DELIVERED → PAID   (COD: money received at delivery)
    //   CANCELLED → PENDING (nothing paid; reset)
    //   All others → unchanged
    const paymentStatusUpdate = PAYMENT_STATUS_FOR_ORDER_STATUS[newStatus];
    const updateData: Record<string, string> = { status: newStatus };
    if (paymentStatusUpdate) {
      updateData.paymentStatus = paymentStatusUpdate;
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData as any,
    });

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("[dashboard/orders] status update failed", error);
    return NextResponse.json(
      { error: "Failed to update order status", code: "UPDATE_FAILED" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER 2: REJECT_RETURN
//
// Rejects the customer's return request.
// Order status reverts to DELIVERED.
// Payment status remains PAID — no financial change.
// ─────────────────────────────────────────────────────────────────────────────
async function handleRejectReturn(
  orderId: string,
  retailer: Awaited<ReturnType<typeof getAuthFromCookies>>,
  adminSession: Awaited<ReturnType<typeof getAdminSession>>,
): Promise<NextResponse> {
  try {
    const { order, forbidden } = await resolveOrderWithAuth(orderId, retailer, adminSession);

    if (forbidden) {
      return NextResponse.json(
        { error: "Not authorized to update this order", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: "Order not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (order.status !== "RETURN_PENDING") {
      return NextResponse.json(
        {
          error: `Cannot reject a return for an order with status '${order.status}'. Only RETURN_PENDING orders can have their return rejected.`,
          code: "INVALID_TRANSITION",
        },
        { status: 409 },
      );
    }

    // Revert to DELIVERED. paymentStatus remains PAID — no financial change.
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status: "DELIVERED" },
    });

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("[dashboard/orders] reject return failed", error);
    return NextResponse.json(
      { error: "Failed to reject return", code: "UPDATE_FAILED" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER 3: APPROVE_RETURN
//
// Approves the customer's return request.
// Atomically in one DB transaction:
//   1. Validates the order is in RETURN_PENDING state
//   2. Restocks every ordered variant
//   3. Sets order status → RETURNED
//   4. Sets payment status → REFUNDED
//
// No payment gateway (Stripe) is involved. This is a COD store — refunds are
// handled physically / manually by the retailer outside the system.
// This action records that the refund has been processed.
// ─────────────────────────────────────────────────────────────────────────────
async function handleApproveReturn(
  orderId: string,
  retailer: Awaited<ReturnType<typeof getAuthFromCookies>>,
  adminSession: Awaited<ReturnType<typeof getAdminSession>>,
): Promise<NextResponse> {
  try {
    const order = await prisma.$transaction(
      async (tx) => {
        // Row-lock to prevent concurrent approve/reject on the same order.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "Order"
          WHERE "id" = ${orderId}
          FOR UPDATE
        `;

        if (locked.length === 0) {
          throw new OrderActionError("Order not found", 404, "ORDER_NOT_FOUND");
        }

        const orderRecord = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            items: {
              include: {
                product: { select: { retailerId: true } },
              },
            },
          },
        });

        // Authorization: admins may approve any return; retailers only their own.
        if (
          retailer &&
          !adminSession &&
          !orderRecord.items.every(
            (item) => item.product.retailerId === retailer.sub,
          )
        ) {
          throw new OrderActionError(
            "You are not authorized to approve this return",
            403,
            "FORBIDDEN",
          );
        }

        if (orderRecord.status === "RETURNED") {
          throw new OrderActionError(
            "This order has already been returned and refunded",
            409,
            "ORDER_ALREADY_RETURNED",
          );
        }

        if (orderRecord.status !== "RETURN_PENDING") {
          throw new OrderActionError(
            `Cannot approve a return for an order with status '${orderRecord.status}'. Only RETURN_PENDING orders can be approved.`,
            409,
            "INVALID_TRANSITION",
          );
        }

        // Return window enforcement.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - RETURN_WINDOW_DAYS);
        if (orderRecord.updatedAt < cutoff) {
          throw new OrderActionError(
            `Returns are only accepted within ${RETURN_WINDOW_DAYS} days of delivery`,
            400,
            "RETURN_WINDOW_EXPIRED",
          );
        }

        // Restock every variant that was part of the order.
        for (const item of orderRecord.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }

        // Finalise: order → RETURNED, payment → REFUNDED.
        // These two fields always change together for a return — they are
        // updated in the same transaction to guarantee consistency.
        return tx.order.update({
          where: { id: orderId },
          data: {
            status: "RETURNED",
            paymentStatus: "REFUNDED",
          },
        });
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
    );

    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    if (error instanceof OrderActionError) return errorResponse(error);

    if (isSerializationError(error)) {
      return NextResponse.json(
        {
          error: "A concurrent request conflict was detected — please try again",
          code: "SERIALIZATION_FAILURE",
        },
        { status: 409 },
      );
    }

    console.error("[order-return] approve return failed", error);
    return NextResponse.json(
      { error: "Failed to process the return", code: "RETURN_FAILED" },
      { status: 500 },
    );
  }
}
