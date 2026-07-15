"use server";

import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateProfile(formData: FormData) {
  const customerAuth = await getCustomerFromCookies();
  if (!customerAuth) {
    throw new Error("Unauthorized");
  }

  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const phone = formData.get("phone") as string;

  if (!firstName || !lastName) {
    throw new Error("First and last name are required");
  }

  await prisma.customer.update({
    where: { id: customerAuth.sub },
    data: {
      firstName,
      lastName,
      phone: phone || null,
    },
  });

  revalidatePath("/account");
  redirect("/account");
}
