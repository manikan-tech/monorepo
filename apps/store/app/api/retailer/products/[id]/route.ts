import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { isProductTryOnEnabled } from "../../../../lib/tryon-status";

// ─── /api/retailer/products/[id] ────────────────────────────────────────
// Detail / edit / delete for one of the retailer's OWN products. Every method
// enforces tenant isolation (retailerId === user.sub → else 404, never
// revealing another tenant's product exists).

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

// ─── GET: product detail ───
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
  if (!product || product.retailerId !== user.sub) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({
    product: { ...product, isTryOnEnabled: isProductTryOnEnabled(product) },
  });
}

// ─── PATCH: edit product-level fields ───
// Scope: product scalar fields only. NOT retailerId, NOT slug, and NOT
// garment/try-on data (that's managed via .../[id]/tryon-config). Variant
// add/remove/edit is out of scope for this MVP endpoint.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Tenant check BEFORE any mutation.
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { retailerId: true },
  });
  if (!existing || existing.retailerId !== user.sub) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Prisma.ProductUpdateInput = {};

  const stringFields = ["name", "category", "gender", "brand", "fabric", "imageUrl"] as const;
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        return NextResponse.json({ error: `${field} must be a non-empty string` }, { status: 400 });
      }
      data[field] = body[field].trim();
    }
  }

  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description : null;
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) {
      return NextResponse.json({ error: "images must be an array of strings" }, { status: 400 });
    }
    data.images = body.images.filter((i: unknown) => typeof i === "string");
  }
  if (body.priceEgp !== undefined) {
    if (!isPositiveNumber(body.priceEgp)) {
      return NextResponse.json({ error: "priceEgp must be a positive number" }, { status: 400 });
    }
    data.priceEgp = body.priceEgp;
  }
  if (body.discountPct !== undefined) {
    if (typeof body.discountPct !== "number" || body.discountPct < 0) {
      return NextResponse.json({ error: "discountPct must be a non-negative number" }, { status: 400 });
    }
    data.discountPct = body.discountPct;
  }
  if (body.stock !== undefined) {
    if (!isNonNegativeInt(body.stock)) {
      return NextResponse.json({ error: "stock must be a non-negative integer" }, { status: 400 });
    }
    data.stock = body.stock;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    }
    data.isActive = body.isActive;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.product.update({
    where: { id },
    data,
    include: { variants: true },
  });

  return NextResponse.json({
    product: { ...updated, isTryOnEnabled: isProductTryOnEnabled(updated) },
  });
}

// ─── DELETE: remove a product ───
export async function DELETE(
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
    select: { retailerId: true, _count: { select: { orderItems: true } } },
  });
  if (!product || product.retailerId !== user.sub) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Protect order history: OrderItem.product cascades on delete, so hard-
  // deleting a product referenced by past orders would destroy financial
  // records. Block it; the retailer should deactivate instead (PATCH isActive).
  if (product._count.orderItems > 0) {
    return NextResponse.json(
      {
        error:
          "This product has order history and can't be deleted. Deactivate it instead (PATCH { isActive: false }).",
      },
      { status: 409 }
    );
  }

  // Safe hard delete — DB cascade removes variants, cart items, wishlist
  // entries, reviews, and measurement sessions for this product.
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
