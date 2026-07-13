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
      <div className="flex items-center justify-between animate-fade-up transition-all duration-500 hover:translate-x-1" style={{ animationDelay: "100ms" }}>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-400/90 animate-pulse">
            Catalog Management
          </p>
          <h2 className="text-3xl font-display font-semibold text-forest-950 leading-tight">
            Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">Products</span>
          </h2>
          <p className="text-forest-700/60 text-sm mt-1 max-w-2xl">Manage your catalog and view insights.</p>
        </div>
        <div className="flex gap-4">
          <CsvUploadButton />
          <Link
            href="/dashboard/products/new"
            className="bg-manikan-teal hover:bg-manikan-teal-hover text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-soft hover:shadow-glow hover:scale-105 active:scale-95"
          >
            Add New Product
          </Link>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <ProductDataGrid products={products} />
      </div>
    </div>
  );
}
