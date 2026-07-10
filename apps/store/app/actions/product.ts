"use server";

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
  const stock = parseInt(formData.get("stock") as string, 10);
  const imageUrl = formData.get("imageUrl") as string;

  // Basic validation
  if (!name || !productCode || !category || isNaN(priceEgp) || !imageUrl) {
    throw new Error("Missing required fields");
  }

  // Generate slug
  const baseSlug = `${brand.toLowerCase()}-${name.toLowerCase()}-${productCode.toLowerCase()}`
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  const uniqueSuffix = Math.floor(Math.random() * 1000).toString();
  const slug = `${baseSlug}-${uniqueSuffix}`;

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
        stock,
        imageUrl,
        slug,
        images: [imageUrl], // Add as first image in array too
      },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    throw new Error("Failed to create product. Make sure the product code is unique.");
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}
