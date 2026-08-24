import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
    SEEDED_CATALOG_BUCKET,
    SEEDED_CATALOG_PREFIX,
    seededCatalogImageUrl,
} from "../prisma/catalog-assets";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const PRODUCT_ASSET_DIR = path.join(APP_ROOT, "public", "products");

function requiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_KEY" | "DATABASE_URL"): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function contentType(fileName: string): string {
    return fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function main() {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_KEY");
    const databaseUrl = requiredEnv("DATABASE_URL");
    const storage = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const pool = new Pool({ connectionString: databaseUrl });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    try {
        const files = (await readdir(PRODUCT_ASSET_DIR))
            .filter((fileName) => /\.(png|jpe?g)$/i.test(fileName))
            .sort();
        if (files.length === 0) throw new Error(`No image assets found in ${PRODUCT_ASSET_DIR}`);

        for (const fileName of files) {
            const file = await readFile(path.join(PRODUCT_ASSET_DIR, fileName));
            const { error } = await storage.storage
                .from(SEEDED_CATALOG_BUCKET)
                .upload(`${SEEDED_CATALOG_PREFIX}/${fileName}`, file, {
                    contentType: contentType(fileName),
                    cacheControl: "31536000",
                    upsert: true,
                });
            if (error) throw new Error(`Failed to upload ${fileName}: ${error.message}`);
        }

        const localProducts = await prisma.product.findMany({
            where: { imageUrl: { startsWith: "/products/" } },
            select: { id: true, imageUrl: true },
        });
        const knownFiles = new Set(files);
        const updates = localProducts.filter(({ imageUrl }) => knownFiles.has(path.basename(imageUrl)));

        await prisma.$transaction(
            updates.map(({ id, imageUrl }) => {
                const publicUrl = seededCatalogImageUrl(path.basename(imageUrl));
                return prisma.product.update({
                    where: { id },
                    data: { imageUrl: publicUrl, images: [publicUrl] },
                });
            })
        );

        console.log(`Uploaded ${files.length} seed assets to ${SEEDED_CATALOG_BUCKET}/${SEEDED_CATALOG_PREFIX}.`);
        console.log(`Updated ${updates.length} existing products to public HTTPS image URLs.`);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
