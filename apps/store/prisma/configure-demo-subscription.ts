import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// ─── Configure an ACTIVE subscription for the demo retailer ─────────────
// checkServiceQuota() only accepts a Subscription row with status="ACTIVE"
// (the default on creation is "PAST_DUE" - a fresh row is NOT usable as-is).
// Creates a generous demo Plan first (quota is likely referenced by
// checkServiceQuota when a plan is attached), then an ACTIVE Subscription
// pointing at it, for the RECOMMENDATION service specifically.
//
// Run:
//   npx tsx prisma/configure-demo-subscription.ts

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SERVICE = "RECOMMENDATION";

async function main() {
    console.log("💳 Configuring an ACTIVE demo subscription (non-destructive)...");

    const retailer = await prisma.retailer.findUnique({
        where: { email: "retailer@manikan.com" },
    });
    if (!retailer) {
        throw new Error("Demo retailer (retailer@manikan.com) not found — run the seed first.");
    }

    // Generous quota so this can never itself be the reason a demo request
    // gets rejected.
    const plan = await prisma.plan.upsert({
        where: { name_service: { name: "Demo Unlimited", service: SERVICE } },
        update: {},
        create: {
            name: "Demo Unlimited",
            service: SERVICE,
            priceEgpMonthly: 0,
            quota: 999999,
        },
    });

    const existing = await prisma.subscription.findFirst({
        where: { retailerId: retailer.id, service: SERVICE },
        orderBy: { createdAt: "desc" },
    });

    let subscription;
    if (existing) {
        subscription = await prisma.subscription.update({
            where: { id: existing.id },
            data: {
                status: "ACTIVE",
                planId: plan.id,
                currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                currentPeriodUsage: 0,
            },
        });
    } else {
        subscription = await prisma.subscription.create({
            data: {
                retailerId: retailer.id,
                service: SERVICE,
                planId: plan.id,
                // Placeholder - no real Stripe customer behind this demo
                // subscription, but the column is required (non-null).
                stripeCustomerId: "demo_customer_no_stripe",
                status: "ACTIVE",
                currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                currentPeriodUsage: 0,
            },
        });
    }

    console.log("Done. Demo subscription configured:");
    console.log("  service:  ", SERVICE);
    console.log("  status:   ", subscription.status);
    console.log("  planQuota:", plan.quota);
    console.log("  periodEnd:", subscription.currentPeriodEnd);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });