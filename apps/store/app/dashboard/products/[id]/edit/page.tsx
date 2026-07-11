import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/prisma";
import EditProductForm from "./EditProductForm";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { variants: true },
  });

  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-display text-forest-900">Edit Product</h2>
        <p className="text-manikan-text-secondary">Update product details and variants.</p>
      </div>
      
      <EditProductForm product={product} />
    </div>
  );
}
