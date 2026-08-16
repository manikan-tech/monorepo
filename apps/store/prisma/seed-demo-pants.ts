import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { seedDemoPants } from "./demo-pants";

// ─── Non-destructive demo pants seeder ────────────────────────────────
// Unlike the full seed.ts (which deleteMany()s the whole catalog), this only
// upserts the Manikan demo pants + their variants. Safe to run against the
// shared DB without wiping teammates' products/carts/orders.
//
// Run (after the migration has added the garment columns):
//   npx tsx prisma/seed-demo-pants.ts

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Upserting Manikan demo pants (non-destructive)...");

    const retailer = await prisma.retailer.findUnique({
        where: { email: "retailer@manikan.com" },
    });
    if (!retailer) {
        throw new Error(
            "Default retailer (retailer@manikan.com) not found — run the full seed first."
        );
    }

    const count = await seedDemoPants(prisma, retailer.id);
    console.log(`Done — upserted ${count} demo pants (virtual try-on enabled).`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
