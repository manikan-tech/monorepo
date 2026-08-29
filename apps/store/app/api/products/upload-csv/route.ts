import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import Papa from "papaparse";
import { commitBodyFitVariants, type CommitErrorCode } from "../../../lib/commit-measurements";
import { BODY_FIT_FIELDS } from "../../../lib/measurement-fields";

// Does this variant row supply ANY body-fit measurement? Matches
// commitBodyFitVariants' own definition of "not supplied" exactly, so this
// pre-check and its internal validation never disagree on what counts as
// empty.
function hasAnyMeasurement(v: Record<string, unknown>): boolean {
  return BODY_FIT_FIELDS.some((f) => v[f] !== undefined && v[f] !== null && v[f] !== "");
}

function buildRetailerScopedSlug(retailerId: string, productCode: string, productName: string): string {
  return `${retailerId}-${productCode}-${productName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
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
          name: row.product_name || "",
          category: row.category || "",
          gender: row.gender || "",
          brand: row.brand || "",
          fabric: row.fabric || "",
          priceEgp: Number(row.price_egp) || 0,
          imageUrl: row.image_url || "",
          variants: [],
          stock: 0,
        });
      }
      
      const p = productsMap.get(pid);
      
      const stockForVariant = Math.floor(Math.random() * 20) + 1; // mock stock
      p.stock += stockForVariant;
      
      p.variants.push({
        sku: `${user.sub}-${pid}-${String(row.size_label)}`,
        sizeLabel: String(row.size_label),
        stock: stockForVariant,
        // Raw parsed values, deliberately NOT coerced with `|| null` here --
        // that silently turned 0 and malformed values into null with no
        // error. commitBodyFitVariants below is now the one place that
        // judges these.
        chestCm: row.chest_cm,
        waistCm: row.waist_cm,
        hipCm: row.hip_cm,
        lengthCm: row.length_cm,
        inseamCm: row.inseam_cm,
      });
    }

    // Insert into DB
    let insertedCount = 0;
    const measurementErrors: Array<{
      productCode: string;
      sizeLabel?: string;
      code: CommitErrorCode;
      message: string;
    }> = [];
    // Products whose rows supplied no measurement data at all -- normal for
    // a catalog-only CSV, not a validation failure, so tracked separately
    // from measurementErrors.
    const noMeasurementData: string[] = [];

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
          retailer: { connect: { id: user.sub } },
          productCode: productData.productCode,
          // Product slugs are globally unique, while CSV imports are scoped
          // by retailerId + productCode. Include the retailer scope here so
          // two retailers can import the same catalog identifiers safely.
          slug: buildRetailerScopedSlug(user.sub, productData.productCode, productData.name),
          name: productData.name,
          category: productData.category,
          categoryRef: { connect: { id: category.id } },
          gender: productData.gender,
          brand: productData.brand,
          fabric: productData.fabric,
          priceEgp: productData.priceEgp,
          imageUrl: productData.imageUrl,
          stock: productData.stock,
        }
      });

      // Upsert variant EXISTENCE only -- sku/sizeLabel/stock. Measurements
      // are committed separately below through commitBodyFitVariants, the
      // single shared writer for these columns (see commit-measurements.ts)
      // -- this route no longer sets them directly. commitBodyFitVariants
      // only ever UPDATES an existing variant, so this upsert has to run
      // first: it's what makes a size introduced by this very CSV "existing"
      // by the time the measurement commit looks for it.
      for (const v of productData.variants) {
         await prisma.productVariant.upsert({
            where: { sku: v.sku },
            update: {
               sizeLabel: v.sizeLabel,
               stock: v.stock,
            },
            create: {
               product: { connect: { id: product.id } },
               sku: v.sku,
               sizeLabel: v.sizeLabel,
               stock: v.stock,
            }
         });
      }

      // Commit measurements -- but only if this product's rows actually
      // supplied any. A catalog CSV with no measurement columns at all is
      // normal (most legacy uploads have none), not a mistake; calling the
      // shared validator unconditionally would reject every row of every
      // such product with "at least one measurement is required".
      if (productData.variants.some(hasAnyMeasurement)) {
        const result = await commitBodyFitVariants({
          productId: product.id,
          retailerId: user.sub,
          variants: productData.variants.map((v: any) => ({
            sizeLabel: v.sizeLabel,
            chestCm: v.chestCm,
            waistCm: v.waistCm,
            hipCm: v.hipCm,
            lengthCm: v.lengthCm,
            inseamCm: v.inseamCm,
          })),
        });
        if (!result.ok) {
          measurementErrors.push({
            productCode: productData.productCode,
            sizeLabel: result.sizeLabel,
            code: result.code,
            message: result.message,
          });
        }
      } else {
        noMeasurementData.push(productData.productCode);
      }



      insertedCount++;
    }

    // 200 even when measurementErrors/noMeasurementData are non-empty -- a
    // per-product measurement issue never blocks or rolls back that
    // product's catalog write (see the upsert split above), so it isn't an
    // HTTP-level failure. Same precedent as the size-chart ingestion job's
    // ACTION_REQUIRED state: partial issues are a body-level signal.
    return NextResponse.json({
      success: true,
      count: insertedCount,
      measurementErrors,
      noMeasurementData,
    });
  } catch (error: any) {
    console.error("CSV upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
