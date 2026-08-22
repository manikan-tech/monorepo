import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createEmbedding, vectorToPgLiteral } from "../../../lib/embeddings";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";

type SearchPayload = {
  queryText?: unknown;
  category?: unknown;
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

function parsePayload(value: SearchPayload): { queryText?: string; category?: string; limit: number } | null {
  const queryText = typeof value.queryText === "string" ? value.queryText.trim() : undefined;
  const category = typeof value.category === "string" ? value.category.trim() : undefined;
  const rawLimit = typeof value.limit === "number" ? value.limit : 10;

  if ((value.queryText !== undefined && !queryText) || (value.category !== undefined && !category)) {
    return null;
  }
  if (!queryText && !category) {
    return null;
  }
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    return null;
  }

  return { queryText, category, limit: rawLimit };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = parsePayload((await request.json()) as SearchPayload);
    if (!parsed) {
      return NextResponse.json(
        { error: "Provide non-empty queryText and/or category; limit must be an integer from 1 to 50." },
        { status: 400 },
      );
    }

    const categoryFilter = parsed.category
      ? Prisma.sql`AND category ILIKE ${parsed.category}`
      : Prisma.empty;

    if (!parsed.queryText) {
      const products = await prisma.product.findMany({
        where: { isActive: true, category: { equals: parsed.category!, mode: "insensitive" } },
        take: parsed.limit,
        include: { variants: true },
      });
      return NextResponse.json({ products, searchType: "category" });
    }

    const queryVector = vectorToPgLiteral(await createEmbedding(parsed.queryText));
    const products = await prisma.$queryRaw<SearchProductRow[]>(Prisma.sql`
      SELECT id, "productCode", name, category, fabric, description, "fitNotes",
             1 - (embedding <=> ${queryVector}::vector) AS similarity
      FROM "Product"
      WHERE "isActive" = true
        AND embedding IS NOT NULL
        ${categoryFilter}
      ORDER BY embedding <=> ${queryVector}::vector
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
