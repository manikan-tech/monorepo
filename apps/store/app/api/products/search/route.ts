import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createEmbedding, vectorToPgLiteral } from "../../../lib/embeddings";
import { prisma } from "../../../lib/prisma";
import { timingSafeEqual } from "crypto";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export const runtime = "nodejs";

type SearchPayload = {
  queryText?: unknown;
  category?: unknown;
  gender?: unknown;
  limit?: unknown;
};

type SearchProductRow = {
  id: string;
  productCode: string;
  name: string;
  category: string;
  fabric: string;
  description: string | null;
  fitNotes: string | null;
  similarity: number;
};

type SizeChartRow = {
  id: string;
  productId: string;
  sku: string;
  sizeLabel: string;
  chestCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  lengthCm: number | null;
  inseamCm: number | null;
};

function parsePayload(value: SearchPayload): { queryText?: string; category?: string; gender?: string; limit: number } | null {
  const queryText = typeof value.queryText === "string" ? value.queryText.trim() : undefined;
  const category = typeof value.category === "string" ? value.category.trim() : undefined;
  const gender = typeof value.gender === "string" ? value.gender.trim() : undefined;
  const rawLimit = typeof value.limit === "number" ? value.limit : 10;

  if ((value.queryText !== undefined && !queryText) || (value.category !== undefined && !category) || (value.gender !== undefined && !gender)) {
    return null;
  }
  if (!queryText && !category && !gender) {
    return null;
  }
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    return null;
  }

  return { queryText, category, gender, limit: rawLimit };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const internalKey = request.headers.get("x-manikan-internal-key") ?? "";
    const requiredKey = process.env.RECOMMENDATION_SERVICE_KEY ?? "";

    if (!requiredKey || !safeCompare(internalKey, requiredKey)) {
      console.error("Unauthorized access attempt to /api/products/search");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = parsePayload((await request.json()) as SearchPayload);
    if (!parsed) {
      return NextResponse.json(
        { error: "Provide non-empty queryText, category, or gender; limit must be an integer from 1 to 50." },
        { status: 400 },
      );
    }

    const categoryFilter = parsed.category
      ? Prisma.sql`AND p.category ILIKE ${parsed.category}`
      : Prisma.empty;
      
    const genderFilter = parsed.gender
      ? Prisma.sql`AND p.gender ILIKE ${parsed.gender}`
      : Prisma.empty;

    if (!parsed.queryText) {
      const whereClause: any = { isActive: true, retailer: { isActivated: true } };
      if (parsed.category) whereClause.category = { equals: parsed.category, mode: "insensitive" };
      if (parsed.gender) whereClause.gender = { equals: parsed.gender, mode: "insensitive" };
      
      const products = await prisma.product.findMany({
        where: whereClause,
        take: parsed.limit,
        include: { variants: true },
      });
      return NextResponse.json({ products, searchType: "structured" });
    }

    const queryVector = vectorToPgLiteral(await createEmbedding(parsed.queryText));
    const products = await prisma.$queryRaw<SearchProductRow[]>(Prisma.sql`
      SELECT p.id, p."productCode", p.name, p.category, p.fabric, p.description, p."fitNotes", p.gender,
             1 - (p.embedding <=> ${queryVector}::vector) AS similarity
      FROM "Product" p
      INNER JOIN "Retailer" r ON p."retailerId" = r.id
      WHERE p."isActive" = true
        AND r."isActivated" = true
        AND p.embedding IS NOT NULL
        ${categoryFilter}
        ${genderFilter}
      ORDER BY p.embedding <=> ${queryVector}::vector
      LIMIT ${parsed.limit}
    `);

    const productIds = products.map((product) => product.id);
    const sizeCharts = productIds.length === 0
      ? []
      : await prisma.$queryRaw<SizeChartRow[]>(Prisma.sql`
          SELECT id, "productId", sku, "sizeLabel", "chestCm", "waistCm", "hipCm", "lengthCm", "inseamCm"
          FROM "ProductVariant"
          WHERE "productId" IN (${Prisma.join(productIds)})
          ORDER BY "sizeLabel" ASC
        `);

    const sizeChartsByProduct = new Map<string, SizeChartRow[]>();
    for (const row of sizeCharts) {
      const current = sizeChartsByProduct.get(row.productId) ?? [];
      current.push(row);
      sizeChartsByProduct.set(row.productId, current);
    }

    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        variants: sizeChartsByProduct.get(product.id) ?? [],
      })),
      searchType: "vector",
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    console.error("Failed to perform RAG product search:", error);
    return NextResponse.json({ error: "Unable to search products." }, { status: 500 });
  }
}
