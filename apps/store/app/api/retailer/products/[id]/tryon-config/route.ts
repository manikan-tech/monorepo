import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { garmentFieldsFor, isProductTryOnEnabled } from "../../../../../lib/tryon-status";
import {
  commitGarmentConfig,
  type CommitErrorCode,
} from "../../../../../lib/commit-measurements";

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

// The write itself lives in app/lib/commit-measurements.ts so that this route,
// the CSV ingestion pipeline, and any later automated extraction all share one
// implementation -- validation cannot drift between a human filling in a form
// and a machine producing the same rows. This route is now just auth, JSON
// parsing, and mapping the commit result onto HTTP.
//
// Garment measurements are keyed dynamically by the product's own category
// (garmentFieldsFor) rather than a hardcoded tee-shaped interface -- a frozen
// tee-shaped field list here is what previously made pants un-configurable
// through this route.

/** Commit failures -> the exact status + message this route has always
 *  returned. Kept as a table so the mapping is auditable at a glance. */
const ERROR_STATUS: Record<CommitErrorCode, number> = {
  INVALID_COLOR: 400,
  EMPTY_VARIANTS: 400,
  PRODUCT_NOT_FOUND: 404,
  UNSUPPORTED_CATEGORY: 400,
  INVALID_VARIANT: 400,
  UNKNOWN_SIZE: 400,
};

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

  const result = await commitGarmentConfig({
    productId: id,
    retailerId: user.sub,
    garmentColorHex: body.garmentColorHex,
    variants: body.variants,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: ERROR_STATUS[result.code] }
    );
  }

  return NextResponse.json(configResponse(result.product));
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
