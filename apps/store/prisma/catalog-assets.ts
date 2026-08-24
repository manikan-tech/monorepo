const CATALOG_BUCKET = "catalog";
const SEEDED_PRODUCTS_PREFIX = "seeded-products";

/**
 * Public URL for an asset uploaded by `upload:seed-images`.
 *
 * Seed records must use publicly reachable HTTPS URLs: FASHN.ai fetches the
 * garment image itself, so a local `/products/...` path can never work for
 * live 2D virtual try-on.
 */
export function seededCatalogImageUrl(fileName: string): string {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is required to seed catalog image URLs");
    }

    return `${supabaseUrl}/storage/v1/object/public/${CATALOG_BUCKET}/${SEEDED_PRODUCTS_PREFIX}/${encodeURIComponent(fileName)}`;
}

export const SEEDED_CATALOG_BUCKET = CATALOG_BUCKET;
export const SEEDED_CATALOG_PREFIX = SEEDED_PRODUCTS_PREFIX;
