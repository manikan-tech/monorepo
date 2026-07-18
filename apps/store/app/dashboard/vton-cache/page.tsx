import path from "path";
import { readdir } from "fs/promises";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

const CACHE_DIR = path.join(process.cwd(), "public", "vton-cache");
const CACHE_EXTENSIONS = [".png", ".webp", ".jpg", ".jpeg"];

export default async function VtonCachePage() {
  const user = await getAuthFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [products, files] = await Promise.all([
    prisma.product.findMany({
      where: { retailerId: user.sub },
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        imageUrl: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    readdir(CACHE_DIR).catch(() => []),
  ]);

  const cachedFiles = new Set(files);
  const rows = await Promise.all(
    products.map(async (product) => {
      const cachedFile =
        CACHE_EXTENSIONS.map((ext) => `${product.id}${ext}`).find((file) => cachedFiles.has(file)) ||
        null;

      return {
        product,
        cachedFile,
      };
    })
  );

  const cachedCount = rows.filter((row) => row.cachedFile).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-gold-600">
          <span className="inline-flex h-2 w-2 rounded-full bg-gold-500" />
          VTON cache manager
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-forest-950">
              Cached try-on previews
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-forest-700/75">
              This page shows which products already have pre-generated fallback previews in
              <code className="mx-1 rounded bg-forest-50 px-1.5 py-0.5 text-xs text-forest-900">
                public/vton-cache
              </code>
              .
            </p>
          </div>

          <div className="flex gap-3">
            <div className="rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gold-700">Cached</p>
              <p className="text-xl font-semibold text-gold-800">
                {cachedCount}/{products.length}
              </p>
            </div>
            <Link
              href="/dashboard/products"
              className="inline-flex items-center justify-center rounded-2xl border border-forest-200 bg-white px-4 py-3 text-sm font-medium text-forest-900 transition-all hover:-translate-y-0.5 hover:border-gold-300 hover:text-gold-700"
            >
              Back to products
            </Link>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-forest-200 bg-white/70 p-12 text-center">
          <h2 className="font-display text-2xl font-semibold text-forest-950">No products found</h2>
          <p className="mt-2 text-sm text-forest-700/70">Add products first, then drop cached previews into vton-cache.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {rows.map(({ product, cachedFile }) => {
            const previewUrl = cachedFile ? `/api/vton/cache?productId=${product.id}` : null;

            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-3xl border border-forest-100 bg-white shadow-soft"
              >
                <div className="flex items-center justify-between border-b border-forest-100 px-5 py-4">
                  <div>
                    <h3 className="font-semibold text-forest-950">{product.name}</h3>
                    <p className="text-xs text-forest-700/70">
                      {product.brand || "Manikan"} · {product.category}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      cachedFile
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {cachedFile ? "Cached" : "Missing"}
                  </span>
                </div>

                <div className="grid gap-4 p-5">
                  <div className="overflow-hidden rounded-2xl border border-forest-100 bg-forest-50/40">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={`${product.name} cached preview`}
                        className="h-[280px] w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-[280px] items-center justify-center text-center px-6">
                        <div>
                          <p className="text-sm font-semibold text-forest-900">No cached preview yet</p>
                          <p className="mt-1 text-xs text-forest-700/70">
                            Drop a file named <code>{product.id}.png</code> or <code>.webp</code>.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-forest-50/70 p-4 text-xs text-forest-700">
                    <p className="font-semibold text-forest-950">Where to place it</p>
                    <p className="mt-1">
                      <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-forest-900">
                        apps/store/public/vton-cache/{product.id}.png
                      </code>
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
