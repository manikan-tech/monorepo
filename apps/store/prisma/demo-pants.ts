import { PrismaClient } from "@prisma/client";
import { seededCatalogImageUrl } from "./catalog-assets";

// ─── Manikan demo pants ─────────────────────────────────────────────────
// Try-on-enabled demo pants for the embeddable widget, mirroring the shape of
// demo-tshirts.ts. Seeded straight through Prisma (like the tees) rather than
// via /api/retailer/products/[id]/tryon-config, so this never touches the
// try-on service's routes.
//
// ─── WHY THESE NUMBERS ──────────────────────────────────────────────────
// garmentWaistCm is a FLAT (half-circumference) measurement, and it is the
// single axis that drives pants sizing in the 3D engine — the physics bake
// grid is waist-keyed, not chest-keyed like the tee's.
//
// The size run is deliberately 38 / 44 / 50 / 56 / 62 cm because those are
// EXACTLY the five size nodes of the baked delta library
// (SIZE_GARMENT_WAIST_CM in tools/drape_bake/phase4_grid_pants.py). A shopper
// picking any of these lands on a real baked grid slab rather than an
// interpolated corner, so the first end-to-end store test exercises genuine
// simulation output. The remaining three measurements (hip/inseam/rise) are
// accepted by the API for completeness but are not yet consumed by the fit.
//
// Product photos are clean flat-lays on a plain neutral ground — that is what
// garment.prepare_texture_image()'s segmentation step wants, and it recolours
// the fabric to colorHex while preserving the weave shading.

interface DemoPantsSize {
    waist: number;   // flat garment waist width (cm) — drives sizing
    hip: number;     // flat garment hip width (cm)
    inseam: number;  // inside leg length (cm)
    rise: number;    // front rise, waistband to crotch seam (cm)
}

interface DemoPants {
    id: string;
    name: string;
    description: string;
    priceEgp: number;
    imageUrl: string;
    colorName: string;
    colorHex: string;
    styleCode: string;
    fabric: string;
    sizes: Record<string, DemoPantsSize>;
}

// Size run shared by every product: the five baked grid nodes.
const GRID_SIZES = (inseamBase: number, rise: number): Record<string, DemoPantsSize> => ({
    S: { waist: 38, hip: 44, inseam: inseamBase - 2, rise: rise - 2 },
    M: { waist: 44, hip: 50, inseam: inseamBase, rise: rise - 1 },
    L: { waist: 50, hip: 56, inseam: inseamBase + 2, rise: rise },
    XL: { waist: 56, hip: 62, inseam: inseamBase + 3, rise: rise + 1 },
    XXL: { waist: 62, hip: 68, inseam: inseamBase + 4, rise: rise + 2 },
});

export const DEMO_PANTS: DemoPants[] = [
    {
        id: "pants-001",
        name: "Straight-Leg Selvedge Denim",
        description:
            "Mid-weight selvedge denim cut to a clean straight leg. Sits at the natural waist with a regular rise, and breaks just above the shoe. Sanforised so it holds its shape wash after wash.",
        priceEgp: 1649.75,
        imageUrl: seededCatalogImageUrl("pants-indigo.png"),
        colorName: "Raw Indigo",
        colorHex: "#2e4374",
        styleCode: "MNK-PNT-M01",
        fabric: "Denim",
        sizes: GRID_SIZES(80, 27),
    },
    {
        id: "pants-002",
        name: "Tailored Wool Trouser",
        description:
            "A sharp, quietly formal trouser in brushed wool-blend suiting. Flat front, tapered through the knee, and finished with a clean unturned hem for an elongated line.",
        priceEgp: 1899.75,
        imageUrl: seededCatalogImageUrl("pants-charcoal.png"),
        colorName: "Charcoal Grey",
        colorHex: "#36393e",
        styleCode: "MNK-PNT-M01",
        fabric: "Wool blend",
        sizes: GRID_SIZES(81, 28),
    },
    {
        id: "pants-003",
        name: "Everyday Cotton Chino",
        description:
            "Garment-dyed cotton twill with just enough stretch to move in. A relaxed straight leg that works as easily with trainers as with boots — the pair you reach for without thinking.",
        priceEgp: 1124.75,
        imageUrl: seededCatalogImageUrl("pants-sand.png"),
        colorName: "Desert Sand",
        colorHex: "#c2a878",
        styleCode: "MNK-PNT-M01",
        fabric: "Cotton twill",
        sizes: GRID_SIZES(79, 26),
    },
    {
        id: "pants-004",
        name: "Slim Stretch Twill",
        description:
            "A close-cut twill trouser with four-way stretch. Narrow through the thigh and calf without pulling, and a slightly shortened inseam designed to sit on the ankle.",
        priceEgp: 1299.75,
        imageUrl: seededCatalogImageUrl("pants-black.png"),
        colorName: "Jet Black",
        colorHex: "#1c1c1e",
        styleCode: "MNK-PNT-M01",
        fabric: "Stretch twill",
        sizes: GRID_SIZES(77, 25),
    },
    {
        id: "pants-005",
        name: "Utility Cargo Pant",
        description:
            "Heavy ripstop cotton with a roomy, straight cut through the leg. Reinforced seams and a slightly higher rise for a workwear silhouette that wears in rather than out.",
        priceEgp: 1449.75,
        imageUrl: seededCatalogImageUrl("pants-olive.png"),
        colorName: "Field Olive",
        colorHex: "#4a5240",
        styleCode: "MNK-PNT-M01",
        fabric: "Ripstop cotton",
        sizes: GRID_SIZES(82, 29),
    },
];

/**
 * Upsert the demo pants + their variants. Non-destructive: only rows belonging
 * to these product ids are touched, so teammates' products/carts/orders on a
 * shared database are unaffected.
 */
export async function seedDemoPants(
    prisma: PrismaClient,
    retailerId: string
): Promise<number> {
    for (const p of DEMO_PANTS) {
        await prisma.product.upsert({
            where: { id: p.id },
            update: {
                garmentColorHex: p.colorHex,
                styleCode: p.styleCode,
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
                gender: "unisex",
                brand: "Manikan",
                fabric: p.fabric,
                styleCode: p.styleCode,
                priceEgp: p.priceEgp,
                imageUrl: p.imageUrl,
                images: [p.imageUrl],
                garmentColorHex: p.colorHex,
                stock: Object.keys(p.sizes).length * 50,
                isActive: true,
            },
        });

        // Refresh this product's variants only (safe for all other products)
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

    return DEMO_PANTS.length;
}
