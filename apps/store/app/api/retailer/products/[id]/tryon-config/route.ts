import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

// ─── /api/retailer/products/[id]/tryon-config ───────────────────────────
// Retailer-facing endpoint to make one of their products 3D-try-on-enabled by
// supplying the data a normal catalog/CSV import doesn't carry: the garment
// colour (Product.tshirtColorHex) + the flat garment measurements per size
// (ProductVariant.garment*Cm).
//
// Auth: retailer SESSION COOKIE (dashboard) via getAuthFromCookies. STRICT
// tenant isolation — the product must belong to the authenticated retailer.
//
// ─── THE "GARMENT GAP" — MVP vs ENTERPRISE ─────────────────────────────
// MVP (this route): the retailer types the garment measurements in by hand
//   (a dashboard form), one product at a time. Direct, simple, unblocks 3D
//   try-on for real catalogs today.
// ENTERPRISE (future): automate it — ingest the brand's tech-pack / size-spec
//   sheets, or INFER the flat garment measurements with an ML model from the
//   standard body-fit size chart (chestCm/waistCm/… already present on every
//   variant). See docs/enterprise-roadmap.md § Catalog.
// ───────────────────────────────────────────────────────────────────────

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface VariantConfigInput {
  sizeLabel: string;
  garmentChestCm: number;
  garmentLengthCm: number;
  garmentSleeveCm: number;
  garmentShoulderCm: number;
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

// ─── GET: current try-on config for a product ───
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });

  // Existence + tenant isolation (404 — never reveal another tenant's product).
  if (!product || product.retailerId !== user.sub) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(configResponse(product));
}

// ─── PUT: set the garment colour + per-size garment measurements ───
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { tshirtColorHex?: unknown; variants?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate colour ──
  if (typeof body.tshirtColorHex !== "string" || !HEX_COLOR.test(body.tshirtColorHex)) {
    return NextResponse.json(
      { error: "tshirtColorHex is required and must be a hex colour (e.g. #1a1a2e)" },
      { status: 400 }
    );
  }
  const tshirtColorHex = body.tshirtColorHex;

  // ── Validate variants ──
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return NextResponse.json(
      { error: "variants must be a non-empty array" },
      { status: 400 }
    );
  }

  const variantInputs: VariantConfigInput[] = [];
  for (const v of body.variants) {
    if (
      !v ||
      typeof v.sizeLabel !== "string" ||
      !isPositiveNumber(v.garmentChestCm) ||
      !isPositiveNumber(v.garmentLengthCm) ||
      !isPositiveNumber(v.garmentSleeveCm) ||
      !isPositiveNumber(v.garmentShoulderCm)
    ) {
      return NextResponse.json(
        {
          error:
            "Each variant needs a sizeLabel and positive garmentChestCm, garmentLengthCm, garmentSleeveCm, garmentShoulderCm",
        },
        { status: 400 }
      );
    }
    variantInputs.push({
      sizeLabel: v.sizeLabel,
      garmentChestCm: v.garmentChestCm,
      garmentLengthCm: v.garmentLengthCm,
      garmentSleeveCm: v.garmentSleeveCm,
      garmentShoulderCm: v.garmentShoulderCm,
    });
  }

  // ── Fetch product (tenant isolation) + resolve sizeLabels → variant ids ──
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });
  if (!product || product.retailerId !== user.sub) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const variantBySize = new Map(product.variants.map((v) => [v.sizeLabel, v]));
  const updates: Prisma.PrismaPromise<unknown>[] = [
    prisma.product.update({ where: { id: product.id }, data: { tshirtColorHex } }),
  ];

  for (const input of variantInputs) {
    const variant = variantBySize.get(input.sizeLabel);
    if (!variant) {
      return NextResponse.json(
        { error: `Unknown size "${input.sizeLabel}" for this product` },
        { status: 400 }
      );
    }
    updates.push(
      prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          garmentChestCm: input.garmentChestCm,
          garmentLengthCm: input.garmentLengthCm,
          garmentSleeveCm: input.garmentSleeveCm,
          garmentShoulderCm: input.garmentShoulderCm,
        },
      })
    );
  }

  // Atomic — colour + all variant rows update together, or none do.
  await prisma.$transaction(updates);

  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    include: { variants: true },
  });
  return NextResponse.json(configResponse(updated!));
}

// ─── Shared response shape ───
function configResponse(
  product: Prisma.ProductGetPayload<{ include: { variants: true } }>
) {
  const variants = product.variants.map((v) => ({
    id: v.id,
    sizeLabel: v.sizeLabel,
    garmentChestCm: v.garmentChestCm,
    garmentLengthCm: v.garmentLengthCm,
    garmentSleeveCm: v.garmentSleeveCm,
    garmentShoulderCm: v.garmentShoulderCm,
  }));

  // Mirrors the try-on gate: a product is try-on-ready only with a colour AND
  // every variant carrying all four garment measurements.
  const isTryOnEnabled =
    product.tshirtColorHex !== null &&
    variants.length > 0 &&
    variants.every(
      (v) =>
        v.garmentChestCm !== null &&
        v.garmentLengthCm !== null &&
        v.garmentSleeveCm !== null &&
        v.garmentShoulderCm !== null
    );

  return {
    productId: product.id,
    tshirtColorHex: product.tshirtColorHex,
    isTryOnEnabled,
    variants,
  };
}
