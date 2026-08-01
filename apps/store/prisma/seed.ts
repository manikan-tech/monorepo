import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import path from "path";
import { seedDemoTshirts } from "./demo-tshirts";
import { seedDemoPants } from "./demo-pants";
import { seedDemoPantsFemale } from "./demo-pants-female";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")          // Replace spaces with -
        .replace(/[^\w\-]+/g, "")       // Remove all non-word chars
        .replace(/\-\-+/g, "-");        // Replace multiple - with single -
}

interface CsvRow {
    productId: string;
    productName: string;
    category: string;
    gender: string;
    brand: string;
    sizeLabel: string;
    chestCm: number | null;
    waistCm: number | null;
    hipCm: number | null;
    lengthCm: number | null;
    inseamCm: number | null;
    fabric: string;
    priceEgp: number;
    imageUrl: string;
}

async function main() {
    console.log("🌱 Starting database seeding from CSV...");

    // ── Seed Plan Tiers ──────────────────────────────────────────────────
    // ⚠️  PRODUCT OWNER: these quotas/prices are placeholders. Confirm
    //     actual go-to-market pricing before deploying to production.
    const plans = [
        {
            name: "Free",
            priceEgpMonthly: 0,
            quotas: { BODY_MODELING: 100, VTON_2D: 50, RECOMMENDATION: 500 },
        },
        {
            name: "Starter",
            priceEgpMonthly: 999,
            quotas: { BODY_MODELING: 1000, VTON_2D: 200, RECOMMENDATION: 5000 },
        },
        {
            name: "Growth",
            priceEgpMonthly: 2499,
            quotas: { BODY_MODELING: 5000, VTON_2D: 1000, RECOMMENDATION: 20000 },
        },
    ];

    for (const plan of plans) {
        await prisma.plan.upsert({
            where: { name: plan.name },
            update: { priceEgpMonthly: plan.priceEgpMonthly, quotas: plan.quotas },
            create: plan,
        });
    }
    console.log(`Seeded ${plans.length} pricing plans (Free / Starter / Growth).`);


    // Locating the catalog CSV file
    const csvPath = path.resolve("./../../demo-retailer-catalog-final.csv");
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV catalog file not found at: ${csvPath}`);
    }
    console.log(`Reading catalog CSV from: ${csvPath}`);
    const csvContent = fs.readFileSync(csvPath, "utf8");

    // Parse CSV Lines
    const lines = csvContent.split(/\r?\n/);
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line) continue;

        const parts = parseCsvLine(line);
        if (parts.length < 14) continue;

        rows.push({
            productId: parts[0]!,
            productName: parts[1]!,
            category: parts[2]!,
            gender: parts[3]!,
            brand: parts[4]!,
            sizeLabel: parts[5]!,
            chestCm: parts[6] ? parseFloat(parts[6]) : null,
            waistCm: parts[7] ? parseFloat(parts[7]) : null,
            hipCm: parts[8] ? parseFloat(parts[8]) : null,
            lengthCm: parts[9] ? parseFloat(parts[9]) : null,
            inseamCm: parts[10] ? parseFloat(parts[10]) : null,
            fabric: parts[11]!,
            priceEgp: parseFloat(parts[12]!) || 0,
            imageUrl: parts[13]!,
        });
    }

    console.log(`Parsed ${rows.length} size-variant records from CSV.`);

    // 1. Create or link default Retailer
    const retailer = await prisma.retailer.upsert({
        where: { email: "retailer@manikan.com" },
        update: {},
        create: {
            authId: "default-retailer-auth-id",
            email: "retailer@manikan.com",
            storeName: "Manikan Official Store",
        },
    });
    console.log(`Linked Retailer: ${retailer.storeName}`);

    // Clean Catalog tables to avoid duplicates and variant SKU conflicts
    console.log("Cleaning old catalog data (Reviews, CartItems, MeasurementSessions, Products, Categories)...");
    await prisma.review.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.wishlist.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.measurementSession.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    // 2. Generate Category Hierarchy Map
    const categoriesMap = new Map<string, { name: string; slug: string; parentSlug: string }>();
    categoriesMap.set("men", { name: "Men", slug: "men", parentSlug: "" });
    categoriesMap.set("women", { name: "Women", slug: "women", parentSlug: "" });

    for (const row of rows) {
        const parentSlug = row.gender.toLowerCase();
        const childSlug = `${parentSlug}-${row.category.toLowerCase()}`;

        if (!categoriesMap.has(childSlug)) {
            const parentName = parentSlug === "men" ? "Men's" : "Women's";
            let childName = row.category.charAt(0).toUpperCase() + row.category.slice(1);
            if (!childName.endsWith("s")) {
                childName = childName.endsWith("sh") || childName.endsWith("ch") ? childName + "es" : childName + "s";
            }
            if (row.category.toLowerCase() === "pants") {
                childName = "Pants";
            }
            categoriesMap.set(childSlug, {
                name: `${parentName} ${childName}`,
                slug: childSlug,
                parentSlug,
            });
        }
    }

    // Seeding Categories to DB
    const menCat = await prisma.category.upsert({
        where: { slug: "men" },
        update: {},
        create: { name: "Men", slug: "men", description: "Apparel for Men" },
    });
    const womenCat = await prisma.category.upsert({
        where: { slug: "women" },
        update: {},
        create: { name: "Women", slug: "women", description: "Apparel for Women" },
    });

    const dbCategories = new Map<string, string>();
    dbCategories.set("men", menCat.id);
    dbCategories.set("women", womenCat.id);

    for (const [slug, catInfo] of categoriesMap.entries()) {
        if (catInfo.parentSlug === "") continue;
        const parentId = dbCategories.get(catInfo.parentSlug);

        const createdCat = await prisma.category.create({
            data: {
                name: catInfo.name,
                slug,
                parentId,
            },
        });
        dbCategories.set(slug, createdCat.id);
    }
    console.log(`Seeded ${dbCategories.size} categories.`);

    // 3. Group and Seed Products & Variants
    const productsMap = new Map<string, CsvRow[]>();
    for (const row of rows) {
        if (!productsMap.has(row.productId)) {
            productsMap.set(row.productId, []);
        }
        productsMap.get(row.productId)!.push(row);
    }

    let productCount = 0;
    for (const [productCode, variantRows] of productsMap.entries()) {
        const firstRow = variantRows[0];
        if (!firstRow) continue;
        const parentSlug = firstRow.gender.toLowerCase();
        const childSlug = `${parentSlug}-${firstRow.category.toLowerCase()}`;
        const categoryId = dbCategories.get(childSlug) || null;
        const productSlug = `${slugify(firstRow.productName)}-${productCode.toLowerCase()}`;

        // 50 stock units per variant row
        const totalStock = variantRows.length * 50;

        await prisma.product.create({
            data: {
                retailerId: retailer.id,
                categoryId,
                productCode,
                name: firstRow.productName,
                slug: productSlug,
                description: `High-quality ${firstRow.productName} by ${firstRow.brand}, crafted from premium ${firstRow.fabric}. Designed with a focus on fit, style, and everyday comfort.`,
                category: firstRow.category,
                gender: firstRow.gender,
                brand: firstRow.brand,
                fabric: firstRow.fabric,
                priceEgp: firstRow.priceEgp,
                imageUrl: firstRow.imageUrl,
                images: [firstRow.imageUrl],
                stock: totalStock,
                isActive: true,
                variants: {
                    create: variantRows.map((v) => ({
                        sku: `${v.productId}-${v.sizeLabel.toUpperCase()}`,
                        sizeLabel: v.sizeLabel,
                        stock: 50,
                        chestCm: v.chestCm,
                        waistCm: v.waistCm,
                        hipCm: v.hipCm,
                        lengthCm: v.lengthCm,
                        inseamCm: v.inseamCm,
                    })),
                },
            },
        });
        productCount++;
    }

    console.log(`Successfully seeded ${productCount} products with all their sizing variants.`);

    // Seed the Manikan demo T-shirts (virtual try-on enabled) for the widget
    const tshirtCount = await seedDemoTshirts(prisma, retailer.id);
    console.log(`Seeded ${tshirtCount} demo t-shirts (virtual try-on enabled).`);

    // Seed the Manikan demo pants (virtual try-on enabled), both genders --
    // previously only ever run as one-off scripts, never part of the
    // reproducible seed. Wired in so a dropped/reset database regenerates
    // both catalogs automatically, same as the tees.
    const pantsCount = await seedDemoPants(prisma, retailer.id);
    console.log(`Seeded ${pantsCount} demo pants (virtual try-on enabled).`);
    const pantsFemaleCount = await seedDemoPantsFemale(prisma, retailer.id);
    console.log(`Seeded ${pantsFemaleCount} demo female pants (virtual try-on enabled).`);

    console.log("🌱 Database seeding complete!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
