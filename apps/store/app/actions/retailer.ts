"use server";

import { prisma } from "../lib/prisma";
import { getAuthFromCookies } from "../lib/auth";
import { revalidatePath } from "next/cache";

export async function updateRetailerProfile(storeName: string) {
  const user = await getAuthFromCookies();
  if (!user) {
    throw new Error("Unauthorized");
  }

  if (!storeName || storeName.trim() === "") {
    throw new Error("Store name cannot be empty");
  }

  try {
    await prisma.retailer.update({
      where: { id: user.sub },
      data: { storeName: storeName.trim() },
    });
    
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    
    return { success: true };
  } catch (error) {
    console.error("Error updating retailer profile:", error);
    throw new Error("Failed to update profile");
  }
}
