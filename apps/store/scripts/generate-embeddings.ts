import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  buildProductEmbeddingText,
  createEmbeddings,
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

const BATCH_SIZE = 5;
const DELAY_MS = 4000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getProductsToIndex(): Promise<ProductToIndex[]> {
  return prisma.$queryRaw<ProductToIndex[]>(Prisma.sql`
    SELECT id, name, category, gender, brand, fabric, description, "fitNotes"
    FROM "Product"
    WHERE embedding IS NULL
    ORDER BY "updatedAt" ASC
  `);
}

async function processBatch(batch: ProductToIndex[]): Promise<void> {
  const texts = batch.map(buildProductEmbeddingText);
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    try {
      const embeddings = await createEmbeddings(texts);
      if (embeddings.length !== batch.length) {
         throw new Error(`Length mismatch: expected ${batch.length}, got ${embeddings.length}`);
      }

      // Update one by one or via case statements (one by one is fine for small batches)
      for (let i = 0; i < batch.length; i++) {
        const product = batch[i];
        const vectorString = vectorToPgLiteral(embeddings[i]);

        await prisma.$executeRaw`
          UPDATE "Product"
          SET embedding = ${vectorString}::vector
          WHERE id = ${product.id}
        `;
      }
      return;
    } catch (error: any) {
      const isRetryable = error.message?.includes("429") || error.message?.includes("50");
      if (isRetryable && attempt < maxAttempts - 1) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`Retryable error (attempt ${attempt}/${maxAttempts}). Waiting ${backoff}ms...`, error.message);
        await sleep(backoff);
      } else {
        throw error;
      }
    }
  }
}

async function main(): Promise<void> {
  const products = await getProductsToIndex();
  if (products.length === 0) {
    console.log("No products require embeddings. (0 NULL embeddings)");
    return;
  }

  console.log(`Found ${products.length} products to embed. Batch size: ${BATCH_SIZE}.`);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    
    console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(products.length/BATCH_SIZE)} (${batch.length} items)...`);
    
    try {
       await processBatch(batch);
    } catch (error) {
       console.error("Persistent failure processing batch. Stopping cleanly.", error);
       break;
    }

    if (i + BATCH_SIZE < products.length) {
       await sleep(DELAY_MS);
    }
  }
  console.log("Backfill complete or stopped.");
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
