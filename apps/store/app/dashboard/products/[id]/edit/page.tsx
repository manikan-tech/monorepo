import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthFromCookies } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import EditProductForm from "./EditProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthFromCookies();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
  });

  if (!product || product.retailerId !== user.sub) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Product Not Found or Unauthorized</h2>
        <Link href="/dashboard/products" className="text-forest-700 hover:underline">Return to Products</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4 animate-fade-up" style={{ animationDelay: "100ms" }}>
        <Link
          href="/dashboard/products"
          className="w-10 h-10 rounded-full bg-white border border-manikan-border flex items-center justify-center text-forest-700 hover:bg-forest-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="text-2xl font-display text-forest-900">Edit Product</h2>
          <p className="text-manikan-text-secondary">Update the details of your garment.</p>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <EditProductForm product={product} />
      </div>
    </div>
  );
}
