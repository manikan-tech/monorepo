import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { isProductTryOnEnabled } from "../../../lib/tryon-status";

// ─── /api/retailer/products ─────────────────────────────────────────────
// Retailer-facing CRUD for the retailer's OWN catalog (dashboard, session
// cookie). EVERY route enforces tenant isolation: retailerId === user.sub.
// Garment/try-on data is managed separately via .../[id]/tryon-config.

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-+/g, "-");
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

// ─── GET: list the retailer's own products (paginated) ───
export async function GET(request: NextRequest) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.ProductWhereInput = { retailerId: user.sub };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { variants: true },
    }),
    prisma.product.count({ where }),
  ]);

  const items = products.map((p) => ({
    id: p.id,
    productCode: p.productCode,
    name: p.name,
    slug: p.slug,
    category: p.category,
    gender: p.gender,
    brand: p.brand,
    priceEgp: p.priceEgp,
    imageUrl: p.imageUrl,
    stock: p.stock,
    isActive: p.isActive,
    variantCount: p.variants.length,
    isTryOnEnabled: isProductTryOnEnabled(p),
    createdAt: p.createdAt,
  }));

  return NextResponse.json({
    products: items,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
}

// ─── POST: create a product + its variants ───
export async function POST(request: NextRequest) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Required product fields ──
  const required = ["productCode", "name", "category", "gender", "brand", "fabric", "imageUrl"];
  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return NextResponse.json({ error: `${field} is required` }, { status: 400 });
    }
  }
  if (!isPositiveNumber(body.priceEgp)) {
    return NextResponse.json({ error: "priceEgp must be a positive number" }, { status: 400 });
  }

  // ── Optional product fields ──
  const description = typeof body.description === "string" ? body.description : null;
  const images = Array.isArray(body.images)
    ? body.images.filter((i: unknown) => typeof i === "string")
    : [];
  const discountPct =
    typeof body.discountPct === "number" && body.discountPct >= 0 ? body.discountPct : 0;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
  const stock = isNonNegativeInt(body.stock) ? body.stock : 0;

  // ── Variants (optional array) ──
  const variantsInput: any[] = Array.isArray(body.variants) ? body.variants : [];
  const seenSizes = new Set<string>();
  for (const v of variantsInput) {
    if (!v || typeof v.sizeLabel !== "string" || !v.sizeLabel.trim()) {
      return NextResponse.json({ error: "Each variant needs a sizeLabel" }, { status: 400 });
    }
    if (seenSizes.has(v.sizeLabel)) {
      return NextResponse.json({ error: `Duplicate sizeLabel "${v.sizeLabel}"` }, { status: 400 });
    }
    seenSizes.add(v.sizeLabel);
    if (v.stock !== undefined && !isNonNegativeInt(v.stock)) {
      return NextResponse.json(
        { error: `variant "${v.sizeLabel}": stock must be a non-negative integer` },
        { status: 400 }
      );
    }
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          retailerId: user.sub,
          productCode: body.productCode.trim(),
          name: body.name.trim(),
          // Globally-unique slug — suffix a short random token to avoid
          // collisions across retailers with similar product names.
          slug: `${slugify(body.name)}-${randomBytes(3).toString("hex")}`,
          description,
          category: body.category.trim(),
          gender: body.gender.trim(),
          brand: body.brand.trim(),
          fabric: body.fabric.trim(),
          priceEgp: body.priceEgp,
          discountPct,
          imageUrl: body.imageUrl.trim(),
          images,
          stock,
          isActive,
        },
      });

      if (variantsInput.length > 0) {
        await tx.productVariant.createMany({
          data: variantsInput.map((v) => ({
            productId: product.id,
            sku:
              typeof v.sku === "string" && v.sku.trim()
                ? v.sku.trim()
                : `${product.id}-${v.sizeLabel}`,
            sizeLabel: v.sizeLabel,
            priceOverride: isPositiveNumber(v.priceOverride) ? v.priceOverride : null,
            stock: isNonNegativeInt(v.stock) ? v.stock : 0,
            chestCm: isPositiveNumber(v.chestCm) ? v.chestCm : null,
            waistCm: isPositiveNumber(v.waistCm) ? v.waistCm : null,
            hipCm: isPositiveNumber(v.hipCm) ? v.hipCm : null,
            lengthCm: isPositiveNumber(v.lengthCm) ? v.lengthCm : null,
            inseamCm: isPositiveNumber(v.inseamCm) ? v.inseamCm : null,
          })),
        });
      }

      return tx.product.findUnique({ where: { id: product.id }, include: { variants: true } });
    });

    return NextResponse.json({ product: created }, { status: 201 });
  } catch (error) {
    // @@unique([retailerId, productCode]) or unique sku → friendly 409.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A product with this productCode (or variant SKU) already exists" },
        { status: 409 }
      );
    }
    console.error("Create product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
