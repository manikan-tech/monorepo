import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import Papa from "papaparse";

function generateMockEmbedding(dim = 1536) {
  // Generate random mock embeddings since we don't have an OpenAI key available.
  const arr = new Array(dim).fill(0).map(() => Math.random() * 2 - 1);
  return arr;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: "Invalid CSV format", details: parsed.errors }, { status: 400 });
    }

    const rows = parsed.data as any[];
    
    // Group variants by product
    const productsMap = new Map<string, any>();
    
    for (const row of rows) {
      const pid = row.product_id;
      if (!productsMap.has(pid)) {
        productsMap.set(pid, {
          productCode: String(pid),
          name: row.product_name,
          category: row.category,
          gender: row.gender,
          brand: row.brand,
          fabric: row.fabric,
          priceEgp: Number(row.price_egp),
          imageUrl: row.image_url,
          variants: [],
          stock: 0,
        });
      }
      
      const p = productsMap.get(pid);
      
      const stockForVariant = Math.floor(Math.random() * 20) + 1; // mock stock
      p.stock += stockForVariant;
      
      p.variants.push({
        sku: `${pid}-${row.size_label}`,
        sizeLabel: row.size_label,
        stock: stockForVariant,
        chestCm: row.chest_cm || null,
        waistCm: row.waist_cm || null,
        hipCm: row.hip_cm || null,
        lengthCm: row.length_cm || null,
        inseamCm: row.inseam_cm || null,
      });
    }

    // Insert into DB
    let insertedCount = 0;
    
    for (const [, productData] of productsMap.entries()) {
      // Find category or create
      let category = await prisma.category.findFirst({
        where: { slug: productData.category.toLowerCase() }
      });
      
      if (!category) {
         category = await prisma.category.create({
            data: {
               name: productData.category,
               slug: productData.category.toLowerCase(),
            }
         });
      }

      // Upsert product
      const product = await prisma.product.upsert({
        where: {
          retailerId_productCode: {
            retailerId: user.sub,
            productCode: productData.productCode,
          }
        },
        update: {
          name: productData.name,
          category: productData.category,
          categoryId: category.id,
          gender: productData.gender,
          brand: productData.brand,
          fabric: productData.fabric,
          priceEgp: productData.priceEgp,
          imageUrl: productData.imageUrl,
          stock: productData.stock,
        },
        create: {
          retailerId: user.sub,
          productCode: productData.productCode,
          slug: `${productData.productCode}-${productData.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: productData.name,
          category: productData.category,
          categoryId: category.id,
          gender: productData.gender,
          brand: productData.brand,
          fabric: productData.fabric,
          priceEgp: productData.priceEgp,
          imageUrl: productData.imageUrl,
          stock: productData.stock,
        }
      });

      // Insert variants
      for (const v of productData.variants) {
         await prisma.productVariant.upsert({
            where: { sku: v.sku },
            update: {
               sizeLabel: v.sizeLabel,
               stock: v.stock,
               chestCm: v.chestCm,
               waistCm: v.waistCm,
               hipCm: v.hipCm,
               lengthCm: v.lengthCm,
               inseamCm: v.inseamCm,
            },
            create: {
               productId: product.id,
               sku: v.sku,
               sizeLabel: v.sizeLabel,
               stock: v.stock,
               chestCm: v.chestCm,
               waistCm: v.waistCm,
               hipCm: v.hipCm,
               lengthCm: v.lengthCm,
               inseamCm: v.inseamCm,
            }
         });
      }

      // Generate embedding and save to pgvector
      const embedding = generateMockEmbedding(1536);
      const embeddingString = `[${embedding.join(',')}]`;
      
      // PostgreSQL requires literal string representation for vector type
      await prisma.$executeRawUnsafe(
         `UPDATE "Product" SET embedding = $1::vector WHERE id = $2`,
         embeddingString,
         product.id
      );

      insertedCount++;
    }

    return NextResponse.json({ success: true, count: insertedCount });
  } catch (error: any) {
    console.error("CSV upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
