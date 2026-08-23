import "dotenv/config";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
const apiKey = process.env.DEEPSEEK_API_KEY;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const isMockMode = !apiKey || apiKey === "mock";
if (isMockMode) {
  console.warn("⚠️ DEEPSEEK_API_KEY environment variable is not set. Running in MOCK Mode using local/template generation.");
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const deepseek = isMockMode ? null : new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function formatMeasurement(value: number | null): string {
  return value === null ? "not provided" : `${value}cm`;
}

function buildPrompt(product: {
  name: string;
  category: string;
  gender: string;
  brand: string;
  fabric: string;
  priceEgp: number;
  variants: Array<{
    sizeLabel: string;
    chestCm: number | null;
    waistCm: number | null;
    hipCm: number | null;
    lengthCm: number | null;
    inseamCm: number | null;
  }>;
}): string {
  const sizes = product.variants.map((variant) => variant.sizeLabel).join(", ") || "not provided";
  const measurements =
    product.variants
      .map(
        (variant) =>
          `  Size ${variant.sizeLabel}: chest=${formatMeasurement(variant.chestCm)}, waist=${formatMeasurement(variant.waistCm)}, hip=${formatMeasurement(variant.hipCm)}, length=${formatMeasurement(variant.lengthCm)}, inseam=${formatMeasurement(variant.inseamCm)}`,
      )
      .join("\n") || "  No measurements provided";

  return `You are a fashion product copywriter for an Egyptian fashion brand.
Write a rich product description for the following item.
The description will be used for AI-powered size recommendations,
so include fit details, fabric behavior, and sizing guidance.

Product details:

- Name: ${product.name}
- Category: ${product.category}
- Gender: ${product.gender}
- Brand: ${product.brand}
- Fabric: ${product.fabric}
- Price: ${product.priceEgp} EGP
- Available sizes: ${sizes}
- Size measurements:
${measurements}

Write a 3-4 sentence description covering:

1. What the garment looks like and its style
2. Fabric feel and behavior (does it stretch? drape? breathe?)
3. Fit guidance (runs true to size / runs small / relaxed fit / slim fit)
4. Who it suits best (body type, occasion)

Return ONLY the description text. No bullet points. No headers.
No extra formatting. Plain paragraph only.`;
}

function generateMockDescription(product: {
  name: string;
  category: string;
  gender: string;
  brand: string;
  fabric: string;
  priceEgp: number;
  variants: Array<{
    sizeLabel: string;
  }>;
}): string {
  const genderLower = product.gender.toLowerCase();
  const genderTerm = genderLower === "unisex" ? "versatile" : genderLower;
  const fabricTerm = product.fabric || "premium fabric";

  let styleOption = "modern addition to your wardrobe";
  const cat = product.category.toLowerCase();
  if (cat.includes("pant") || cat.includes("trouser") || cat.includes("jeans")) {
    styleOption = "sleek and classic silhouette, perfect for pairing with your favorite tops";
  } else if (cat.includes("shirt") || cat.includes("t-shirt") || cat.includes("blouse")) {
    styleOption = "contemporary cut that offers both elegance and daily comfort";
  } else if (cat.includes("dress") || cat.includes("skirt")) {
    styleOption = "graceful flow and stylish appearance that stands out in any setting";
  } else if (cat.includes("jacket") || cat.includes("hoodie") || cat.includes("coat")) {
    styleOption = "chic layer designed to keep you comfortable while looking sharp";
  }

  let fabricBehavior = `The high-quality ${fabricTerm} offers a soft feel against the skin and excellent shape retention.`;
  if (fabricTerm.toLowerCase().includes("cotton")) {
    fabricBehavior = `Made from breathable ${fabricTerm}, it provides exceptionally soft comfort and natural wearability.`;
  } else if (fabricTerm.toLowerCase().includes("linen")) {
    fabricBehavior = `The lightweight ${fabricTerm} ensures maximum breathability and a relaxed drape ideal for warm-weather wear.`;
  } else if (fabricTerm.toLowerCase().includes("silk") || fabricTerm.toLowerCase().includes("satin")) {
    fabricBehavior = `The luxurious ${fabricTerm} offers a premium sheen, lightweight feel, and a fluid, elegant drape.`;
  }

  let fitGuidance = "This item is designed to run true to size for a classic, flattering silhouette.";
  if (product.name.toLowerCase().includes("oversized") || product.name.toLowerCase().includes("relaxed")) {
    fitGuidance = "Featuring a relaxed, comfortable cut, we recommend sticking to your standard size for a casual look, or sizing down for a more fitted silhouette.";
  } else if (product.name.toLowerCase().includes("slim") || product.name.toLowerCase().includes("fitted")) {
    fitGuidance = "With its slim-fit design, it contours to the body; we recommend sizing up if you prefer a roomier feel.";
  }

  const sizes = product.variants.map((v) => v.sizeLabel).join(", ") || "various sizes";
  const suitability = `Suited for both semi-formal and casual occasions, this ${product.brand} piece is a must-have for the modern ${genderTerm} wardrobe, available in sizes: ${sizes}.`;

  return `This ${product.name} presents a ${styleOption}. ${fabricBehavior} ${fitGuidance} ${suitability}`;
}

async function main() {
  const forceGenerate = process.env.FORCE_GENERATE === "true";
  const limitValue = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
  const products = await prisma.product.findMany({
    where: forceGenerate ? {} : { description: null },
    include: { variants: true },
    take: limitValue,
  });

  if (products.length === 0) {
    console.log("No products found that need descriptions generated. (Run with FORCE_GENERATE=true environment variable set to regenerate all).");
    return;
  }

  for (const [index, product] of products.entries()) {
    if (!forceGenerate && product.description) {
      console.log(`→ skipping ${product.name}`);
      continue;
    }

    try {
      let generatedDescription = "";
      if (isMockMode || !deepseek) {
        generatedDescription = generateMockDescription(product);
      } else {
        const response = await deepseek.chat.completions.create({
          model: "deepseek-chat",
          max_tokens: 200,
          temperature: 0.7,
          messages: [{ role: "user", content: buildPrompt(product) }],
        });
        generatedDescription = response.choices[0]?.message.content?.trim() || "";
      }

      if (!generatedDescription) {
        throw new Error("Failed to generate description");
      }

      await prisma.product.update({
        where: { id: product.id },
        data: { description: generatedDescription },
      });

      console.log(`✓ [${index + 1}/${products.length}] ${product.name} — done`);
    } catch (error) {
      console.error(`✗ [${index + 1}/${products.length}] ${product.name} — failed`, error);
    }

    if (index < products.length - 1) {
      await sleep(500);
    }
  }

  console.log("✓ All descriptions generated successfully");
}

main()
  .catch((error) => {
    console.error("Failed to generate descriptions:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
