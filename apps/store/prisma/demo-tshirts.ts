import { PrismaClient } from "@prisma/client";

// ─── Manikan demo T-shirts ──────────────────────────────────────────────
// Try-on-enabled demo products for the embeddable widget. These MIRROR the
// widget's static fixture (apps/widget/src/data/products.js) 1:1 — the widget
// uses its fixture for display, while these rows are the DB source of truth
// the /api/tryon proxy reads garment data from. Keep both in sync.
//
// Stable string ids (tshirt-001…006) match the widget fixture so the widget
// can pass a real product id straight through to the proxy.
//
// ─── CATALOG STRATEGY ───────────────────────────────────────────────────
// MVP (now): Option A — catalog is populated manually (CSV seed + this demo
//   seed). The /api/tryon proxy strictly reads garment data from Prisma as the
//   single source of truth.
// Enterprise (future): Option C — Shopify/WooCommerce webhook sync keeps the
//   catalog fresh automatically; Option D — lazy pull-and-cache for custom
//   stores. Both must solve the "Garment Gap": flat garment tech-pack
//   measurements (sleeve/shoulder/length) usually aren't exposed on a
//   storefront, so they need a spec-sheet importer or a size-chart-derived
//   estimator. See docs/enterprise-roadmap.md § Catalog.

interface DemoTshirtSize {
    chest: number;    // flat garment chest width (cm)
    length: number;   // garment body length (cm)
    sleeve: number;   // garment sleeve length (cm)
    shoulder: number; // garment shoulder width (cm)
}

interface DemoTshirt {
    id: string;
    name: string;
    description: string;
    priceEgp: number;
    imageUrl: string;
    colorName: string;
    colorHex: string;
    sizes: Record<string, DemoTshirtSize>;
}

export const DEMO_TSHIRTS: DemoTshirt[] = [
    {
        id: "tshirt-001",
        name: "Essential Cotton Crew",
        description: "Premium 100% organic cotton crew-neck tee. Soft, breathable fabric with a relaxed modern fit. Pre-shrunk and garment-dyed for a lived-in feel from day one.",
        priceEgp: 749.75,
        imageUrl: "/products/tshirt-navy.png",
        colorName: "Midnight Navy",
        colorHex: "#1a1a2e",
        sizes: {
            S:   { chest: 46, length: 68, sleeve: 19, shoulder: 42 },
            M:   { chest: 50, length: 70, sleeve: 20, shoulder: 44 },
            L:   { chest: 54, length: 72, sleeve: 21, shoulder: 46 },
            XL:  { chest: 58, length: 74, sleeve: 22, shoulder: 48 },
            XXL: { chest: 62, length: 76, sleeve: 23, shoulder: 50 },
        },
    },
    {
        id: "tshirt-002",
        name: "Heritage Organic Tee",
        description: "Clean lines and a timeless silhouette in organic cotton. Ribbed collar, double-stitched hems, and a slightly oversized fit that drapes beautifully.",
        priceEgp: 874.75,
        imageUrl: "/products/tshirt-cream.png",
        colorName: "Vintage Cream",
        colorHex: "#f5f0e1",
        sizes: {
            S:   { chest: 48, length: 69, sleeve: 20, shoulder: 43 },
            M:   { chest: 52, length: 71, sleeve: 21, shoulder: 45 },
            L:   { chest: 56, length: 73, sleeve: 22, shoulder: 47 },
            XL:  { chest: 60, length: 75, sleeve: 23, shoulder: 49 },
            XXL: { chest: 64, length: 77, sleeve: 24, shoulder: 51 },
        },
    },
    {
        id: "tshirt-003",
        name: "Explorer Rugged Tee",
        description: "Built for adventure. Heavy-weight cotton with reinforced shoulders. Perfect for layering or wearing solo on the trail.",
        priceEgp: 824.75,
        imageUrl: "/products/tshirt-green.png",
        colorName: "Forest Olive",
        colorHex: "#3d4a2e",
        sizes: {
            S:   { chest: 47, length: 68, sleeve: 19, shoulder: 43 },
            M:   { chest: 51, length: 70, sleeve: 20, shoulder: 45 },
            L:   { chest: 55, length: 72, sleeve: 21, shoulder: 47 },
            XL:  { chest: 59, length: 74, sleeve: 22, shoulder: 49 },
            XXL: { chest: 63, length: 76, sleeve: 23, shoulder: 51 },
        },
    },
    {
        id: "tshirt-004",
        name: "Urban Stealth Tee",
        description: "The essential black tee, elevated. Made from ultra-soft ringspun cotton with a contemporary slim fit. Goes with everything.",
        priceEgp: 699.75,
        imageUrl: "/products/tshirt-black.png",
        colorName: "Jet Black",
        colorHex: "#1a1a1a",
        sizes: {
            S:   { chest: 45, length: 67, sleeve: 18, shoulder: 41 },
            M:   { chest: 49, length: 69, sleeve: 19, shoulder: 43 },
            L:   { chest: 53, length: 71, sleeve: 20, shoulder: 45 },
            XL:  { chest: 57, length: 73, sleeve: 21, shoulder: 47 },
            XXL: { chest: 61, length: 75, sleeve: 22, shoulder: 49 },
        },
    },
    {
        id: "tshirt-005",
        name: "Artisan Dyed Crew",
        description: "Rich garment-dyed burgundy on heavyweight cotton. Each piece develops a unique patina over time. Boxy relaxed fit.",
        priceEgp: 924.75,
        imageUrl: "/products/tshirt-burgundy.png",
        colorName: "Deep Burgundy",
        colorHex: "#5c1a2a",
        sizes: {
            S:   { chest: 48, length: 69, sleeve: 20, shoulder: 44 },
            M:   { chest: 52, length: 71, sleeve: 21, shoulder: 46 },
            L:   { chest: 56, length: 73, sleeve: 22, shoulder: 48 },
            XL:  { chest: 60, length: 75, sleeve: 23, shoulder: 50 },
            XXL: { chest: 64, length: 77, sleeve: 24, shoulder: 52 },
        },
    },
    {
        id: "tshirt-006",
        name: "Metro Blend Tee",
        description: "Cotton-polyester blend for all-day comfort. Moisture-wicking, wrinkle-resistant, and perfect for commute-to-weekend transitions.",
        priceEgp: 799.75,
        imageUrl: "/products/tshirt-gray.png",
        colorName: "Heather Charcoal",
        colorHex: "#4a4a4a",
        sizes: {
            S:   { chest: 46, length: 68, sleeve: 19, shoulder: 42 },
            M:   { chest: 50, length: 70, sleeve: 20, shoulder: 44 },
            L:   { chest: 54, length: 72, sleeve: 21, shoulder: 46 },
            XL:  { chest: 58, length: 74, sleeve: 22, shoulder: 48 },
            XXL: { chest: 62, length: 76, sleeve: 23, shoulder: 50 },
        },
    },
];

// Upsert the demo T-shirts + their variants. NON-DESTRUCTIVE to every other
// product: it only touches rows belonging to these stable t-shirt ids.
export async function seedDemoTshirts(
    prisma: PrismaClient,
    retailerId: string
): Promise<number> {
    for (const t of DEMO_TSHIRTS) {
        await prisma.product.upsert({
            where: { id: t.id },
            update: {
                garmentColorHex: t.colorHex,
                priceEgp: t.priceEgp,
                imageUrl: t.imageUrl,
                isActive: true,
            },
            create: {
                id: t.id,
                retailerId,
                productCode: t.id.toUpperCase(),
                name: t.name,
                slug: `manikan-${t.id}`,
                description: t.description,
                category: "tshirt",
                gender: "unisex",
                brand: "Manikan",
                fabric: "Cotton",
                priceEgp: t.priceEgp,
                imageUrl: t.imageUrl,
                images: [t.imageUrl],
                garmentColorHex: t.colorHex,
                stock: Object.keys(t.sizes).length * 50,
                isActive: true,
            },
        });

        // Refresh this product's variants only (safe for all other products)
        await prisma.productVariant.deleteMany({ where: { productId: t.id } });
        await prisma.productVariant.createMany({
            data: Object.entries(t.sizes).map(([label, s]) => ({
                productId: t.id,
                sku: `${t.id.toUpperCase()}-${label}`,
                sizeLabel: label,
                stock: 50,
                garmentChestCm: s.chest,
                garmentLengthCm: s.length,
                garmentSleeveCm: s.sleeve,
                garmentShoulderCm: s.shoulder,
            })),
        });
    }

    return DEMO_TSHIRTS.length;
}
