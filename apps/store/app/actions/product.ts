"use server";

import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { getAuthFromCookies } from "../lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createProduct(formData: FormData) {
  const user = await getAuthFromCookies();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const name = formData.get("name") as string;
  const productCode = formData.get("productCode") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const gender = formData.get("gender") as string;
  const brand = formData.get("brand") as string;
  const fabric = formData.get("fabric") as string;
  const priceEgp = parseFloat(formData.get("priceEgp") as string);
  const variantSizes = formData.getAll("variant_size[]") as string[];
  const variantSkus = formData.getAll("variant_sku[]") as string[];
  const variantStocks = formData.getAll("variant_stock[]") as string[];
  const variantPrices = formData.getAll("variant_price[]") as string[];
  const imageUrl = formData.get("imageUrl") as string;

  // Basic validation
  if (!name || !productCode || !category || isNaN(priceEgp) || !imageUrl) {
    throw new Error("Missing required fields");
  }

  // Keep the values in each submitted variant row together before filtering
  // blank rows, so a blank row cannot shift a later SKU or stock value.
  const variantsData = variantSizes
    .map((size, i) => ({
      sizeLabel: size.trim(),
      sku: variantSkus[i] || `${user.sub}-${productCode}-${size.trim()}`,
      stock: parseInt(variantStocks[i] || "0", 10),
      priceOverride: variantPrices[i] ? parseFloat(variantPrices[i]) : null,
    }))
    .filter((variant) => variant.sizeLabel !== "");

  if (variantsData.length === 0) {
    throw new Error("You must add at least one product variant/size.");
  }

  const totalStock = variantsData.reduce((sum, v) => sum + v.stock, 0);

  // Generate slug with a cryptographic random suffix to prevent collisions
  const baseSlug = `${brand.toLowerCase()}-${name.toLowerCase()}-${productCode.toLowerCase()}`
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  const slug = `${baseSlug}-${randomBytes(3).toString("hex")}`;

  try {
    await prisma.product.create({
      data: {
        retailerId: user.sub,
        name,
        productCode,
        description,
        category,
        gender,
        brand,
        fabric,
        priceEgp,
        stock: totalStock,
        imageUrl,
        slug,
        images: [imageUrl], // Add as first image in array too
        variants: {
          create: variantsData
        }
      },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    throw new Error("Failed to create product. Make sure the product code is unique.");
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function updateProduct(formData: FormData) {
  const user = await getAuthFromCookies();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const productId = formData.get("productId") as string;
  const name = formData.get("name") as string;
  const productCode = formData.get("productCode") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const gender = formData.get("gender") as string;
  const brand = formData.get("brand") as string;
  const fabric = formData.get("fabric") as string;
  const priceEgp = parseFloat(formData.get("priceEgp") as string);
  const imageUrl = formData.get("imageUrl") as string;

  const variantIds = formData.getAll("variant_id[]") as string[];
  const variantSizes = formData.getAll("variant_size[]") as string[];
  const variantSkus = formData.getAll("variant_sku[]") as string[];
  const variantStocks = formData.getAll("variant_stock[]") as string[];
  const variantPrices = formData.getAll("variant_price[]") as string[];

  if (!productId || !name || !productCode || !category || isNaN(priceEgp) || !imageUrl) {
    throw new Error("Missing required fields");
  }

  if (variantSizes.length === 0) {
    throw new Error("You must have at least one product variant/size.");
  }

  const totalStock = variantStocks.reduce((sum, v) => sum + parseInt(v || "0", 10), 0);

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Verify product belongs to retailer (inside transaction for consistency)
      const existing = await tx.product.findUnique({ where: { id: productId } });
      if (!existing || existing.retailerId !== user.sub) {
        throw new Error("Product not found or unauthorized");
      }

      // 2. Update base product
      await tx.product.update({
        where: { id: productId },
        data: {
          name,
          productCode,
          description,
          category,
          gender,
          brand,
          fabric,
          priceEgp,
          stock: totalStock,
          imageUrl,
        },
      });

      // 3. Upsert variants — all inside the same transaction so a failed
      // variant write rolls back the product update too, leaving the DB clean.
      const currentVariants = await tx.productVariant.findMany({
        where: { productId },
        select: { id: true }
      });
      const validVariantIds = new Set(currentVariants.map(v => v.id));

      const existingVariantIds = variantIds.filter(id => id); // non-empty
      await tx.productVariant.deleteMany({
        where: {
          productId,
          id: { notIn: existingVariantIds }
        }
      });

      for (let i = 0; i < variantSizes.length; i++) {
        const id = variantIds[i];
        const sizeLabel = variantSizes[i];
        if (!sizeLabel) continue;

        const data = {
          sizeLabel: sizeLabel,
          sku: variantSkus[i] || `${user.sub}-${productCode}-${sizeLabel}`,
          stock: parseInt(variantStocks[i] || "0", 10),
          priceOverride: variantPrices[i] ? parseFloat(variantPrices[i] as string) : null,
        };

        if (id && validVariantIds.has(id)) {
          // Known existing variant — update by its primary key
          await tx.productVariant.update({
            where: { id },
            data,
          });
        } else {
          // New variant OR ID not tracked (e.g. CSV-uploaded products) —
          // upsert by SKU so we never hit a unique constraint error.
          await tx.productVariant.upsert({
            where: { sku: data.sku },
            create: { ...data, productId },
            update: { sizeLabel: data.sizeLabel, stock: data.stock, priceOverride: data.priceOverride },
          });
        }
      }
    });
  } catch (error) {
    console.error("Error updating product:", error);
    const msg = error instanceof Error ? error.message : "Failed to update product.";
    throw new Error(msg);
  }

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${productId}/edit`);
  redirect("/dashboard/products");
}
