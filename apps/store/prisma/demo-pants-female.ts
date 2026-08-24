import { PrismaClient } from "@prisma/client";
import { seededCatalogImageUrl } from "./catalog-assets";

// ─── Manikan demo pants — female ────────────────────────────────────────
// Mirrors demo-pants.ts exactly (same shape, same upsert pattern), for the
// female pants category added this session (physics-drape delta library at
// models/garments/pants_physics_female/, gendered via the shopper's own
// `sex` field at try-on time -- NOT this product's `gender` field, which is
// a catalog attribute only, per apps/store/app/api/tryon/route.ts).
//
// gender: "women" -- matches the existing 32-product general catalog
// already live in this database (verified directly: every non-Manikan
// pants product uses "women"/"men", never "female"/"male"). The male demo
// pants use "unisex" because they aren't gender-restricted at checkout;
// these ARE built specifically for the female template/pipeline, so "women"
// is the correct, already-established value, not a new convention.
//
// Images are real product flat-lay photography (not procedural
// placeholders), resized from 1792x2392 to 1000x1335 to match the existing
// product-image footprint.
//
// ─── WHY THESE NUMBERS ──────────────────────────────────────────────────
// garmentWaistCm stays on the SAME [38,44,50,56,62] axis as the male
// catalog -- these are exactly the physics grid's SIZE_GARMENT_WAIST_CM
// nodes (tools/drape_bake/phase4_grid_pants.py), shared across genders by
// design, and grid_coords() snaps size to the NEAREST node rather than
// interpolating. Using authentic (smaller) real-world women's waist values
// here would silently mismatch the label against the simulated fit,
// worst at the smallest sizes. garmentHipCm uses a wider waist-to-hip
// differential than the male catalog (+9cm flat vs. male's +6cm) to
// reflect the female template's own fuller-seat carve (seat_ease=1.15,
// locked this session) -- hip/inseam/rise are accepted by the API for
// completeness but not yet consumed by the fit, so this is safe to make
// authentically different from male without any engine-side mismatch.

interface DemoPantsSize {
    waist: number;
    hip: number;
    inseam: number;
    rise: number;
}

interface DemoPantsFemale {
    id: string;
    name: string;
    description: string;
    priceEgp: number;
    imageUrl: string;
    colorName: string;
    colorHex: string;
    fabric: string;
    sizes: Record<string, DemoPantsSize>;
}

const GRID_SIZES_FEMALE = (inseamBase: number, rise: number): Record<string, DemoPantsSize> => ({
    S: { waist: 38, hip: 47, inseam: inseamBase - 2, rise: rise - 2 },
    M: { waist: 44, hip: 53, inseam: inseamBase, rise: rise - 1 },
    L: { waist: 50, hip: 59, inseam: inseamBase + 2, rise: rise },
    XL: { waist: 56, hip: 65, inseam: inseamBase + 3, rise: rise + 1 },
    XXL: { waist: 62, hip: 71, inseam: inseamBase + 4, rise: rise + 2 },
});

export const DEMO_PANTS_FEMALE: DemoPantsFemale[] = [
    // ── Curved-Seam Barrel Trouser (5 colorways) ──────────────────────────
    {
        id: "pants-f001",
        name: "Curved-Seam Barrel Trouser",
        description:
            "A structured barrel-leg trouser with curved princess seams through the hip and a button-tab, natural waist. Cotton-linen twill that holds its shape through the leg and tapers to a cropped hem.",
        priceEgp: 1549.75,
        imageUrl: seededCatalogImageUrl("pants-female-olive.png"),
        colorName: "Olive",
        colorHex: "#6b5729",
        fabric: "Cotton-linen blend",
        sizes: GRID_SIZES_FEMALE(76, 24),
    },
    {
        id: "pants-f002",
        name: "Curved-Seam Barrel Trouser",
        description:
            "A structured barrel-leg trouser with curved princess seams through the hip and a button-tab, natural waist. Cotton-linen twill that holds its shape through the leg and tapers to a cropped hem.",
        priceEgp: 1599.75,
        imageUrl: seededCatalogImageUrl("pants-female-navy.png"),
        colorName: "Midnight Navy",
        colorHex: "#25293a",
        fabric: "Cotton-linen blend",
        sizes: GRID_SIZES_FEMALE(77, 25),
    },
    {
        id: "pants-f003",
        name: "Curved-Seam Barrel Trouser",
        description:
            "A structured barrel-leg trouser with curved princess seams through the hip and a button-tab, natural waist. Cotton-linen twill that holds its shape through the leg and tapers to a cropped hem.",
        priceEgp: 1549.75,
        imageUrl: seededCatalogImageUrl("pants-female-coral.png"),
        colorName: "Coral",
        colorHex: "#c97158",
        fabric: "Cotton-linen blend",
        sizes: GRID_SIZES_FEMALE(75, 23),
    },
    {
        id: "pants-f004",
        name: "Curved-Seam Barrel Trouser",
        description:
            "A structured barrel-leg trouser with curved princess seams through the hip and a button-tab, natural waist. Cotton-linen twill that holds its shape through the leg and tapers to a cropped hem.",
        priceEgp: 1524.75,
        imageUrl: seededCatalogImageUrl("pants-female-stone.png"),
        colorName: "Stone",
        colorHex: "#9a8e7f",
        fabric: "Cotton-linen blend",
        sizes: GRID_SIZES_FEMALE(76, 24),
    },
    {
        id: "pants-f005",
        name: "Curved-Seam Barrel Trouser",
        description:
            "A structured barrel-leg trouser with curved princess seams through the hip and a button-tab, natural waist. Cotton-linen twill that holds its shape through the leg and tapers to a cropped hem.",
        priceEgp: 1599.75,
        imageUrl: seededCatalogImageUrl("pants-female-black.png"),
        colorName: "Jet Black",
        colorHex: "#22221f",
        fabric: "Cotton-linen blend",
        sizes: GRID_SIZES_FEMALE(77, 25),
    },
    // ── Textured Jacquard Trouser (3 colorways) ───────────────────────────
    {
        id: "pants-f006",
        name: "Textured Jacquard Trouser",
        description:
            "A softer, pull-on barrel trouser in a small-scale jacquard weave with a covered elastic waist. Relaxed through the hip and tapered to the ankle for an easy, unstructured line.",
        priceEgp: 1699.75,
        imageUrl: seededCatalogImageUrl("pants-female-blush.png"),
        colorName: "Blush",
        colorHex: "#c69a8e",
        fabric: "Jacquard weave",
        sizes: GRID_SIZES_FEMALE(74, 23),
    },
    {
        id: "pants-f007",
        name: "Textured Jacquard Trouser",
        description:
            "A softer, pull-on barrel trouser in a small-scale jacquard weave with a covered elastic waist. Relaxed through the hip and tapered to the ankle for an easy, unstructured line.",
        priceEgp: 1699.75,
        imageUrl: seededCatalogImageUrl("pants-female-rust.png"),
        colorName: "Rust",
        colorHex: "#53261d",
        fabric: "Jacquard weave",
        sizes: GRID_SIZES_FEMALE(75, 24),
    },
    {
        id: "pants-f008",
        name: "Textured Jacquard Trouser",
        description:
            "A softer, pull-on barrel trouser in a small-scale jacquard weave with a covered elastic waist. Relaxed through the hip and tapered to the ankle for an easy, unstructured line.",
        priceEgp: 1724.75,
        imageUrl: seededCatalogImageUrl("pants-female-burgundy.png"),
        colorName: "Burgundy",
        colorHex: "#501522",
        fabric: "Jacquard weave",
        sizes: GRID_SIZES_FEMALE(74, 23),
    },
    // ── Washed Barrel-Leg Jean (1 colorway) ────────────────────────────────
    {
        id: "pants-f009",
        name: "Washed Barrel-Leg Jean",
        description:
            "Mid-wash denim cut to a rounded barrel leg with a high, fitted waist and a brass button closure. A fashion-forward alternative to the straight leg, with the same everyday durability.",
        priceEgp: 1799.75,
        imageUrl: seededCatalogImageUrl("pants-female-indigo.png"),
        colorName: "Washed Indigo",
        colorHex: "#233551",
        fabric: "Cotton denim",
        sizes: GRID_SIZES_FEMALE(78, 26),
    },
];

/**
 * Upsert the demo female pants + their variants. Non-destructive: only rows
 * belonging to these product ids are touched, mirroring seedDemoPants().
 */
export async function seedDemoPantsFemale(
    prisma: PrismaClient,
    retailerId: string
): Promise<number> {
    for (const p of DEMO_PANTS_FEMALE) {
        await prisma.product.upsert({
            where: { id: p.id },
            update: {
                garmentColorHex: p.colorHex,
                priceEgp: p.priceEgp,
                imageUrl: p.imageUrl,
                isActive: true,
            },
            create: {
                id: p.id,
                retailerId,
                productCode: p.id.toUpperCase(),
                name: p.name,
                slug: `manikan-${p.id}`,
                description: p.description,
                category: "pants",
                gender: "women",
                brand: "Manikan",
                fabric: p.fabric,
                priceEgp: p.priceEgp,
                imageUrl: p.imageUrl,
                images: [p.imageUrl],
                garmentColorHex: p.colorHex,
                stock: Object.keys(p.sizes).length * 50,
                isActive: true,
            },
        });

        await prisma.productVariant.deleteMany({ where: { productId: p.id } });
        await prisma.productVariant.createMany({
            data: Object.entries(p.sizes).map(([label, s]) => ({
                productId: p.id,
                sku: `${p.id.toUpperCase()}-${label}`,
                sizeLabel: label,
                stock: 50,
                garmentWaistCm: s.waist,
                garmentHipCm: s.hip,
                garmentInseamCm: s.inseam,
                garmentRiseCm: s.rise,
            })),
        });
    }

    return DEMO_PANTS_FEMALE.length;
}
