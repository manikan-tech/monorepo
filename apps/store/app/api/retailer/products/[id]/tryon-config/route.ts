import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { garmentFieldsFor, isProductTryOnEnabled } from "../../../../../lib/tryon-status";

// ─── /api/retailer/products/[id]/tryon-config ───────────────────────────
// Retailer-facing endpoint to make one of their products 3D-try-on-enabled by
// supplying the data a normal catalog/CSV import doesn't carry: the garment
// colour (Product.garmentColorHex) + the flat garment measurements per size
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

// Variant garment measurements, keyed dynamically by the product's own
// category (garmentFieldsFor) rather than a hardcoded tee-shaped interface --
// this is what previously made pants un-configurable through this route: the
// field list here was frozen to the tee's four fields no matter what
// category the product actually was.
type VariantConfigInput = { sizeLabel: string } & Record<string, number>;

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

  let body: { garmentColorHex?: unknown; variants?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate colour ──
  if (typeof body.garmentColorHex !== "string" || !HEX_COLOR.test(body.garmentColorHex)) {
    return NextResponse.json(
      { error: "garmentColorHex is required and must be a hex colour (e.g. #1a1a2e)" },
      { status: 400 }
    );
  }
  const garmentColorHex = body.garmentColorHex;

  // ── Validate variants ──
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return NextResponse.json(
      { error: "variants must be a non-empty array" },
      { status: 400 }
    );
  }

  // ── Fetch product (tenant isolation) first: which fields are required
  //    depends on the product's own category, so this has to happen before
  //    variant validation, not after it. ──
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });
  if (!product || product.retailerId !== user.sub) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const fields = garmentFieldsFor(product.category ?? "");
  if (fields.length === 0) {
    return NextResponse.json(
      { error: `Unsupported category "${product.category}" -- no garment fields defined for it` },
      { status: 400 }
    );
  }

  const variantInputs: VariantConfigInput[] = [];
  for (const v of body.variants) {
    if (!v || typeof v.sizeLabel !== "string" || !fields.every((f) => isPositiveNumber(v[f]))) {
      return NextResponse.json(
        { error: `Each variant needs a sizeLabel and positive ${fields.join(", ")}` },
        { status: 400 }
      );
    }
    const input: VariantConfigInput = { sizeLabel: v.sizeLabel };
    for (const f of fields) input[f] = v[f];
    variantInputs.push(input);
  }

  const variantBySize = new Map(product.variants.map((v) => [v.sizeLabel, v]));
  const updates: Prisma.PrismaPromise<unknown>[] = [
    prisma.product.update({ where: { id: product.id }, data: { garmentColorHex } }),
  ];

  for (const input of variantInputs) {
    const variant = variantBySize.get(input.sizeLabel);
    if (!variant) {
      return NextResponse.json(
        { error: `Unknown size "${input.sizeLabel}" for this product` },
        { status: 400 }
      );
    }
    // Non-null: every `f` in `fields` was already validated as a positive
    // number when `input` was constructed above.
    const data: Record<string, number> = {};
    for (const f of fields) data[f] = input[f]!;
    updates.push(
      prisma.productVariant.update({ where: { id: variant.id }, data })
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
  const fields = garmentFieldsFor(product.category ?? "");
  const variants = product.variants.map((v) => {
    const out: Record<string, unknown> = { id: v.id, sizeLabel: v.sizeLabel };
    for (const f of fields) out[f] = (v as unknown as Record<string, unknown>)[f];
    return out;
  });

  // Single source of truth (app/lib/tryon-status.ts) -- was three independent
  // hardcoded copies of the tee's four fields, which is exactly why this
  // route never learned about pants when that category was added.
  const isTryOnEnabled = isProductTryOnEnabled(product);

  return {
    productId: product.id,
    category: product.category,
    garmentColorHex: product.garmentColorHex,
    isTryOnEnabled,
    variants,
  };
}
