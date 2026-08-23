import "dotenv/config";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = new Client({ connectionString });

try {
  await client.connect();
  const result = await client.query(`
    UPDATE "Product"
    SET "fitNotes" = concat(
      category,
      ' fit: compare the shopper chest, waist, and hip measurements to this product''s published variant chart. Fabric: ',
      fabric,
      '. Choose the closest available size and account for preferred ease.'
    )
    WHERE "fitNotes" IS NULL OR btrim("fitNotes") = ''
  `);
  console.log(`Backfilled fitNotes for ${result.rowCount ?? 0} products.`);
} finally {
  await client.end();
}
