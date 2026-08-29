import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  authorizeWidgetRequest,
  commitQuotaReservation,
  releaseQuotaReservation,
  reserveQuota,
} from "../../../lib/widget-auth";

export const runtime = "nodejs";

const RECOMMENDATION_SERVICE_URL = process.env.RECOMMENDATION_SERVICE_URL ?? "http://localhost:8002";
const RECOMMENDATION_SERVICE_KEY = process.env.RECOMMENDATION_SERVICE_KEY ?? "";
const BODY_SERVICE_URL = process.env.BODY_SERVICE_URL ?? "http://localhost:8001";
const BODY_SERVICE_KEY = process.env.BODY_SERVICE_KEY ?? "";
const BODY_SERVICE_ENDPOINT = process.env.BODY_SERVICE_ENDPOINT ?? "/generate-3d";
const SERVICE_TIMEOUT_MS = 10_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Manikan-Key",
};

type Measurements = {
  heightCm: number;
  weightKg: number;
  chestCm: number;
  waistCm: number;
  hipsCm: number;
};

type ProcessPayload = {
  productId?: unknown;
  measurements?: Partial<Measurements>;
};

type RecommendationPayload = {
  success?: boolean;
  reply?: string;
  recommended_size?: string | null;
  confidence_score?: number | null;
  explanation?: string | null;
  provider?: string | null;
  error_code?: string | null;
};

function isMeasurements(value: unknown): value is Measurements {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["heightCm", "weightKg", "chestCm", "waistCm", "hipsCm"].every(
    (key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]),
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeWidgetRequest(request, CORS_HEADERS, "RECOMMENDATION");
  if (!auth.ok) return auth.response;

  let body: ProcessPayload;
  try {
    body = (await request.json()) as ProcessPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  if (typeof body.productId !== "string" || !body.productId || !isMeasurements(body.measurements)) {
    return NextResponse.json(
      { error: "productId and finite heightCm, weightKg, chestCm, waistCm, hipsCm measurements are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const product = await prisma.product.findFirst({
    where: {
      retailerId: auth.retailer.id,
      isActive: true,
      OR: [{ id: body.productId }, { productCode: body.productId }],
    },
    select: {
      id: true,
      retailerId: true,
      isActive: true,
      name: true,
      category: true,
      fabric: true,
      description: true,
      fitNotes: true,
      variants: {
        select: {
          id: true,
          sku: true,
          sizeLabel: true,
          chestCm: true,
          waistCm: true,
          hipCm: true,
          lengthCm: true,
          inseamCm: true,
        },
      },
    },
  });

  // Do not disclose products owned by another retailer.
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const reservation = await reserveQuota(
    auth.subscription.id,
    "RECOMMENDATION",
    request.headers.get("x-request-id") || randomUUID(),
    CORS_HEADERS,
  );
  if (!reservation.ok) return reservation.response;

  const { measurements } = body;
  const sizeChart = product.variants.map((variant) => ({
    size: variant.sizeLabel,
    chest_cm: variant.chestCm,
    waist_cm: variant.waistCm,
    hip_cm: variant.hipCm,
    length_cm: variant.lengthCm,
    inseam_cm: variant.inseamCm,
  }));

  let recommendation: RecommendationPayload;
  try {
    const upstream = await fetch(`${RECOMMENDATION_SERVICE_URL}/recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Manikan-Internal-Key": RECOMMENDATION_SERVICE_KEY,
      },
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
      body: JSON.stringify({
        session_id: randomUUID(),
        messages: [{ role: "user", content: `Recommend my best size for ${product.name}.` }],
        product_id: product.id,
        retailer_id: auth.retailer.id,
        betas: {
          height_cm: measurements.heightCm,
          weight_kg: measurements.weightKg,
          chest_cm: measurements.chestCm,
          waist_cm: measurements.waistCm,
          hips_cm: measurements.hipsCm,
        },
        size_chart: JSON.stringify(sizeChart),
        selected_category: product.category,
        available_categories: [product.category],
        catalog_products: [{
          id: product.id,
          name: product.name,
          category: product.category,
          fabric: product.fabric,
          description: product.description,
          fitNotes: product.fitNotes,
          variants: product.variants,
        }],
      }),
    });
    recommendation = (await upstream.json().catch(() => ({}))) as RecommendationPayload;
    if (!upstream.ok || recommendation.success === false) {
      await releaseQuotaReservation(reservation.reservation.id);
      return NextResponse.json(
        { error: recommendation.error_code ?? "Recommendation service error" },
        { status: upstream.ok ? 502 : upstream.status, headers: CORS_HEADERS },
      );
    }
  } catch (error: unknown) {
    await releaseQuotaReservation(reservation.reservation.id);
    console.error("Widget process recommendation service failed:", error);
    return NextResponse.json(
      { error: "Recommendation service unavailable" },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  // 3D generation is an enhancement: do not discard a valid recommendation
  // when the body service is down, times out, or uses a different endpoint.
  let meshData: unknown = null;
  try {
    const endpoint = BODY_SERVICE_ENDPOINT.startsWith("/")
      ? BODY_SERVICE_ENDPOINT
      : `/${BODY_SERVICE_ENDPOINT}`;
    const upstream = await fetch(`${BODY_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Manikan-Internal-Key": BODY_SERVICE_KEY,
      },
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
      body: JSON.stringify({
        measurements,
        category: product.category,
        productId: product.id,
        recommendedSize: recommendation.recommended_size ?? null,
      }),
    });
    if (upstream.ok) {
      meshData = await upstream.json();
    } else {
      console.warn("Widget process body service returned", upstream.status);
    }
  } catch (error: unknown) {
    console.warn("Widget process body service unavailable:", error);
  }

  await commitQuotaReservation(reservation.reservation.id);

  return NextResponse.json(
    {
      success: true,
      recommendation: {
        recommendedSize: recommendation.recommended_size ?? null,
        confidence: recommendation.confidence_score ?? null,
        explanation: recommendation.explanation ?? recommendation.reply ?? "",
        reasoning: recommendation.explanation ?? recommendation.reply ?? "",
        provider: recommendation.provider ?? null,
      },
      body3d: { meshData },
    },
    { status: 200, headers: CORS_HEADERS },
  );
}
