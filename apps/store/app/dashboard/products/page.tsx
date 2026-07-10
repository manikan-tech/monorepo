import React from "react";
import Link from "next/link";
import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import ProductDataGrid from "./ProductDataGrid";
import CsvUploadButton from "./CsvUploadButton";

export default async function ProductsPage() {
  const user = await getAuthFromCookies();

  if (!user) {
    redirect("/login");
  }

  const products = await prisma.product.findMany({
    where: { retailerId: user.sub },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display text-forest-900">Your Products</h2>
          <p className="text-manikan-text-secondary">Manage your catalog and view insights</p>
        </div>
        <div className="flex gap-4">
          <CsvUploadButton />
          <Link
            href="/dashboard/products/new"
            className="bg-manikan-teal hover:bg-manikan-teal-hover text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-soft"
          >
            Add New Product
          </Link>
        </div>
      </div>

      <ProductDataGrid products={products} />
    </div>
  );
}
