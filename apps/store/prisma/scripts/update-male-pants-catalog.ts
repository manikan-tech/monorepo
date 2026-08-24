import "dotenv/config";
import { prisma } from "../../app/lib/prisma";
import { seededCatalogImageUrl } from "../catalog-assets";

// Replaces the demo men's/unisex pants catalog (pants-001..005), whose names
// and descriptions (denim, wool suiting, cotton twill, ripstop cargo) never
// matched their generic stock photos, with real product photography. All 7
// supplied photos are the same textured-knit trouser silhouette in
// different colourways, so pants-006/007 are added as new products rather
// than leaving two photos unused.
//
// Safe to re-run: all writes are updates/upserts keyed on fixed ids, and the
// whole catalog change is committed in one transaction. The live retailer is
// resolved from pants-001 instead of being hard-coded to one environment.

const UPDATES = [
  {
    id: "pants-001",
    name: "Indigo Heathered Knit Trouser",
    fabric: "Heathered knit",
    garmentColorHex: "#2f3345",
    imageUrl: seededCatalogImageUrl("pants-indigo-heathered-knit.png"),
    description:
      "Deep indigo trouser in a heathered, diagonally-textured knit — denim-adjacent in colour but soft-tailored rather than rigid. Tapered through the leg with a fitted waistband and a cropped break at the ankle.",
  },
  {
    id: "pants-002",
    name: "Charcoal Textured Knit Trouser",
    fabric: "Textured knit",
    garmentColorHex: "#434146",
    imageUrl: seededCatalogImageUrl("pants-charcoal-textured-knit.png"),
    description:
      "A charcoal trouser in a fine, brushed-texture knit that keeps the sharpness of tailoring without the stiffness of woven wool. Flat front, tapered knee, cropped hem.",
  },
  {
    id: "pants-003",
    name: "Khaki Bouclé Knit Trouser",
    fabric: "Bouclé knit",
    garmentColorHex: "#8c745e",
    imageUrl: seededCatalogImageUrl("pants-khaki-boucle-knit.png"),
    description:
      "A warm khaki trouser in a nubby bouclé knit with a fine herringbone weave underneath. Tailored through the hip with a tapered leg and a cropped, ankle-skimming break — texture does the work instead of a hard crease.",
  },
  {
    id: "pants-004",
    name: "Black Ribbed Knit Trouser",
    fabric: "Ribbed knit",
    garmentColorHex: "#292a29",
    imageUrl: seededCatalogImageUrl("pants-black-ribbed-knit.png"),
    description:
      "Jet black trouser in a fine vertical-ribbed knit for a close, second-skin fit through the leg. Slim through the thigh and calf, cropped at the ankle — built to layer under or over anything.",
  },
  {
    id: "pants-005",
    name: "Sage Textured Knit Trouser",
    fabric: "Textured knit",
    garmentColorHex: "#757671",
    imageUrl: seededCatalogImageUrl("pants-sage-textured-knit.png"),
    description:
      "A muted sage-grey trouser in a densely textured knit that reads almost like flannel from a distance. Tapered leg, clean waistband, and a cropped hem for a modern, slightly cropped silhouette.",
  },
];

// Same size grid as pants-001 -- identical silhouette across colourways, so
// the same garment measurements per size apply, exactly how a real catalog
// would model one style in multiple colours.
const SIZE_GRID: Record<string, { waist: number; hip: number; inseam: number; rise: number }> = {
  S: { waist: 38, hip: 44, inseam: 78, rise: 25 },
  M: { waist: 44, hip: 50, inseam: 80, rise: 26 },
  L: { waist: 50, hip: 56, inseam: 82, rise: 27 },
  XL: { waist: 56, hip: 62, inseam: 83, rise: 28 },
  XXL: { waist: 62, hip: 68, inseam: 84, rise: 29 },
};

const NEW_PRODUCTS = [
  {
    id: "pants-006",
    productCode: "PANTS-006",
    slug: "manikan-pants-006",
    name: "Ivory Bouclé Knit Trouser",
    fabric: "Bouclé knit",
    garmentColorHex: "#e1e0de",
    priceEgp: 1549.75,
    imageUrl: seededCatalogImageUrl("pants-ivory-boucle-knit.png"),
    description:
      "An off-white trouser in a soft, nubby bouclé knit with a button-tab waist closure. Tapered leg and a cropped, ankle-length break — the lightest piece in the knit-trouser line, best worn away from anything that stains easily.",
  },
  {
    id: "pants-007",
    productCode: "PANTS-007",
    slug: "manikan-pants-007",
    name: "Chocolate Bouclé Knit Trouser",
    fabric: "Bouclé knit",
    garmentColorHex: "#4f332b",
    priceEgp: 1599.75,
    imageUrl: seededCatalogImageUrl("pants-chocolate-boucle-knit.png"),
    description:
      "A rich chocolate-brown trouser in the same nubby bouclé knit as the line's lighter colourways, finished with a button-tab waist. Tapered leg, cropped hem, warm enough in tone to anchor a full autumn outfit.",
  },
];

async function main() {
  const catalogAnchor = await prisma.product.findUnique({
    where: { id: "pants-001" },
    select: { retailerId: true, categoryId: true },
  });

  if (!catalogAnchor) {
    throw new Error("pants-001 was not found; refusing to guess the live retailer");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const u of UPDATES) {
        const updated = await tx.product.update({
          where: { id: u.id },
          data: {
            categoryId: catalogAnchor.categoryId,
            name: u.name,
            description: u.description,
            category: "pants",
            gender: "men",
            brand: "Manikan",
            fabric: u.fabric,
            garmentColorHex: u.garmentColorHex,
            imageUrl: u.imageUrl,
            images: [u.imageUrl],
            stock: 250,
            isActive: true,
          },
        });
        console.log(`Updated ${u.id} -> "${updated.name}"`);
      }

      for (const p of NEW_PRODUCTS) {
        await tx.product.upsert({
          where: { id: p.id },
          update: {
            retailerId: catalogAnchor.retailerId,
            categoryId: catalogAnchor.categoryId,
            productCode: p.productCode,
            name: p.name,
            slug: p.slug,
            description: p.description,
            category: "pants",
            gender: "men",
            brand: "Manikan",
            fabric: p.fabric,
            priceEgp: p.priceEgp,
            discountPct: 0,
            imageUrl: p.imageUrl,
            images: [p.imageUrl],
            stock: 250,
            isActive: true,
            garmentColorHex: p.garmentColorHex,
          },
          create: {
            id: p.id,
            retailerId: catalogAnchor.retailerId,
            categoryId: catalogAnchor.categoryId,
            productCode: p.productCode,
            name: p.name,
            slug: p.slug,
            description: p.description,
            category: "pants",
            gender: "men",
            brand: "Manikan",
            fabric: p.fabric,
            priceEgp: p.priceEgp,
            discountPct: 0,
            imageUrl: p.imageUrl,
            images: [p.imageUrl],
            stock: 250,
            isActive: true,
            garmentColorHex: p.garmentColorHex,
          },
        });

        for (const [sizeLabel, m] of Object.entries(SIZE_GRID)) {
          const sku = `${p.productCode}-${sizeLabel}`;
          await tx.productVariant.upsert({
            where: { sku },
            update: {
              productId: p.id,
              sizeLabel,
              stock: 50,
              garmentWaistCm: m.waist,
              garmentHipCm: m.hip,
              garmentInseamCm: m.inseam,
              garmentRiseCm: m.rise,
            },
            create: {
              productId: p.id,
              sku,
              sizeLabel,
              stock: 50,
              garmentWaistCm: m.waist,
              garmentHipCm: m.hip,
              garmentInseamCm: m.inseam,
              garmentRiseCm: m.rise,
            },
          });
        }
        console.log(`Upserted ${p.id} -> "${p.name}" with ${Object.keys(SIZE_GRID).length} variants`);
      }
    },
    { maxWait: 20_000, timeout: 20_000 },
  );
}

main().finally(() => prisma.$disconnect());
