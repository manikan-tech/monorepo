import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// ─── Configure the demo retailer for widget auth (Phase 3b) ─────────────
// NON-DESTRUCTIVE: merges `allowedOrigins` into the demo retailer's EXISTING
// widgetSettings (preserving language/primaryColor/secondaryColor set by the
// dashboard) and ensures isActivated = true. Sets the dev/test origins the
// widget runs on so the security gate passes locally.
//
// Run (Phase 3b, only after review):
//   npx tsx prisma/configure-demo-retailer.ts

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ALLOWED_ORIGINS = [
    "http://localhost:3001", // widget dev server (npm run dev)
    "http://localhost:8088", // test-embed static server
    "http://localhost:3000", // store (same-origin dev)
];

async function main() {
    console.log("🔐 Configuring demo retailer for widget auth (non-destructive)...");

    const retailer = await prisma.retailer.findUnique({
        where: { email: "retailer@manikan.com" },
    });
    if (!retailer) {
        throw new Error("Demo retailer (retailer@manikan.com) not found — run the seed first.");
    }

    const existing =
        (retailer.widgetSettings as Record<string, unknown> | null) ?? {};
    const merged = { ...existing, allowedOrigins: ALLOWED_ORIGINS };

    await prisma.retailer.update({
        where: { id: retailer.id },
        data: { isActivated: true, widgetSettings: merged },
    });

    console.log("Done. Demo retailer configured:");
    console.log("  apiKey:        ", retailer.apiKey);
    console.log("  isActivated:    true");
    console.log("  allowedOrigins:", ALLOWED_ORIGINS);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
