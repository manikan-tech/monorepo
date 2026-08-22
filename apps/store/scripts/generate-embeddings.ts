import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  buildProductEmbeddingText,
  createEmbedding,
  vectorToPgLiteral,
  type EmbeddableProduct,
} from "../app/lib/embeddings";

type ProductToIndex = EmbeddableProduct & { id: string };

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const forceReindex = process.env.FORCE_REINDEX === "true";
const rawLimit = Number.parseInt(process.env.LIMIT ?? "", 10);
const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 10_000) : undefined;

async function getProductsToIndex(): Promise<ProductToIndex[]> {
  const where = forceReindex ? Prisma.empty : Prisma.sql`WHERE embedding IS NULL`;
  const limitClause = limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`;

  return prisma.$queryRaw<ProductToIndex[]>(Prisma.sql`
    SELECT id, name, category, fabric, description, "fitNotes"
    FROM "Product"
    ${where}
    ORDER BY "updatedAt" ASC
    ${limitClause}
  `);
}

async function main(): Promise<void> {
  const products = await getProductsToIndex();
  if (products.length === 0) {
    console.log("No products require embeddings. Set FORCE_REINDEX=true to regenerate all embeddings.");
    return;
  }

  for (const [index, product] of products.entries()) {
    const embedding = await createEmbedding(buildProductEmbeddingText(product));
    const vectorString = vectorToPgLiteral(embedding);

    await prisma.$executeRaw`
      UPDATE "Product"
      SET embedding = ${vectorString}::vector
      WHERE id = ${product.id}
    `;

    console.log(`Indexed ${index + 1}/${products.length}: ${product.id}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Embedding generation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
