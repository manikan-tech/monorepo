import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  authorizeWidgetRequest,
  commitQuotaReservation,
  releaseQuotaReservation,
  reserveQuota,
} from "../../../lib/widget-auth";

const MAX_HUMAN_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Manikan-Key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Public-key widget gateway for the protected 2D virtual-try-on service. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeWidgetRequest(request, CORS_HEADERS, "VTON_2D");
  if (!auth.ok) return auth.response;

  let reservationId: string | null = null;
  try {
    const formData = await request.formData();
    const humanImage = formData.get("human_image");
    const productId = formData.get("product_id");
    if (!(humanImage instanceof File) || !humanImage.type.startsWith("image/") || humanImage.size <= 0) {
      return NextResponse.json({ error: "human_image must be a non-empty image file." }, { status: 400, headers: CORS_HEADERS });
    }
    if (humanImage.size > MAX_HUMAN_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "human_image must be 5MB or smaller." }, { status: 400, headers: CORS_HEADERS });
    }
    if (typeof productId !== "string" || !productId.trim()) {
      return NextResponse.json({ error: "product_id is required." }, { status: 400, headers: CORS_HEADERS });
    }

    const product = await prisma.product.findFirst({
      where: {
        retailerId: auth.retailer.id,
        isActive: true,
        OR: [{ id: productId }, { productCode: productId }],
      },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404, headers: CORS_HEADERS });
    }

    const serviceKey = process.env.VTON_2D_SERVICE_KEY;
    if (!serviceKey) {
      console.error("VTON_2D_SERVICE_KEY is not configured");
      return NextResponse.json({ error: "Virtual try-on is temporarily unavailable." }, { status: 503, headers: CORS_HEADERS });
    }

    const reservation = await reserveQuota(
      auth.subscription.id,
      "VTON_2D",
      request.headers.get("x-request-id") || randomUUID(),
      CORS_HEADERS,
    );
    if (!reservation.ok) return reservation.response;
    reservationId = reservation.reservation.id;

    const upstreamForm = new FormData();
    upstreamForm.append("human_image", humanImage);
    upstreamForm.append("product_id", product.id);
    const upstream = await fetch(new URL("/api/vton/2d", request.url), {
      method: "POST",
      headers: { "X-Manikan-Key": serviceKey, "X-Request-Id": randomUUID() },
      body: upstreamForm,
      cache: "no-store",
    });

    if (!upstream.ok) {
      const error = await upstream.json().catch(() => ({}));
      await releaseQuotaReservation(reservationId);
      return NextResponse.json({ error: error.error ?? "Virtual try-on failed." }, { status: upstream.status, headers: CORS_HEADERS });
    }
    await commitQuotaReservation(reservationId);
    reservationId = null;

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    if (reservationId) await releaseQuotaReservation(reservationId);
    console.error("Widget VTON gateway failed:", error);
    return NextResponse.json({ error: "Virtual try-on service unreachable." }, { status: 502, headers: CORS_HEADERS });
  }
}
