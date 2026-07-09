/* ─────────────────────────────────────────────────────────────────────────
   Product Catalog — STATIC placeholder data.

   This is the ONLY module the widget's UI code talks to for product/size
   data (see App.jsx, ManikanWidget.jsx). It is intentionally static for
   now — when the Store's product API is ready, replace the bodies of
   getProducts()/getProductById() below with fetch() calls (e.g. to
   `${STORE_API_URL}/api/products`) and nothing else in the widget needs
   to change, since every caller already goes through this seam.

   The shape mirrors apps/store's Prisma Product + ProductVariant models
   (see apps/store/prisma/schema.prisma) closely enough that mapping a
   real API response onto it later should be mechanical:
     - id/name/price(Egp)/imageUrl/category  → Product
     - color_hex/color_name                  → Product (display-only)
     - sizes[label].chest_width_cm etc.       → ProductVariant (per size)
   ───────────────────────────────────────────────────────────────────────── */

export const PRODUCTS = [
  {
    id: 'tshirt-001',
    name: 'Essential Cotton Crew',
    description: 'Premium 100% organic cotton crew-neck tee. Soft, breathable fabric with a relaxed modern fit. Pre-shrunk and garment-dyed for a lived-in feel from day one.',
    price: 749.75,
    currency: 'EGP',
    category: 'T-Shirts',
    image: '/products/tshirt-navy.png',
    color_name: 'Midnight Navy',
    color_hex: '#1a1a2e',
    sizes: {
      S:   { chest_width_cm: 46, body_length_cm: 68, sleeve_length_cm: 19, shoulder_width_cm: 42 },
      M:   { chest_width_cm: 50, body_length_cm: 70, sleeve_length_cm: 20, shoulder_width_cm: 44 },
      L:   { chest_width_cm: 54, body_length_cm: 72, sleeve_length_cm: 21, shoulder_width_cm: 46 },
      XL:  { chest_width_cm: 58, body_length_cm: 74, sleeve_length_cm: 22, shoulder_width_cm: 48 },
      XXL: { chest_width_cm: 62, body_length_cm: 76, sleeve_length_cm: 23, shoulder_width_cm: 50 },
    },
  },
  {
    id: 'tshirt-002',
    name: 'Heritage Organic Tee',
    description: 'Clean lines and a timeless silhouette in organic cotton. Ribbed collar, double-stitched hems, and a slightly oversized fit that drapes beautifully.',
    price: 874.75,
    currency: 'EGP',
    category: 'T-Shirts',
    image: '/products/tshirt-cream.png',
    color_name: 'Vintage Cream',
    color_hex: '#f5f0e1',
    sizes: {
      S:   { chest_width_cm: 48, body_length_cm: 69, sleeve_length_cm: 20, shoulder_width_cm: 43 },
      M:   { chest_width_cm: 52, body_length_cm: 71, sleeve_length_cm: 21, shoulder_width_cm: 45 },
      L:   { chest_width_cm: 56, body_length_cm: 73, sleeve_length_cm: 22, shoulder_width_cm: 47 },
      XL:  { chest_width_cm: 60, body_length_cm: 75, sleeve_length_cm: 23, shoulder_width_cm: 49 },
      XXL: { chest_width_cm: 64, body_length_cm: 77, sleeve_length_cm: 24, shoulder_width_cm: 51 },
    },
  },
  {
    id: 'tshirt-003',
    name: 'Explorer Rugged Tee',
    description: 'Built for adventure. Heavy-weight cotton with reinforced shoulders. Perfect for layering or wearing solo on the trail.',
    price: 824.75,
    currency: 'EGP',
    category: 'T-Shirts',
    image: '/products/tshirt-green.png',
    color_name: 'Forest Olive',
    color_hex: '#3d4a2e',
    sizes: {
      S:   { chest_width_cm: 47, body_length_cm: 68, sleeve_length_cm: 19, shoulder_width_cm: 43 },
      M:   { chest_width_cm: 51, body_length_cm: 70, sleeve_length_cm: 20, shoulder_width_cm: 45 },
      L:   { chest_width_cm: 55, body_length_cm: 72, sleeve_length_cm: 21, shoulder_width_cm: 47 },
      XL:  { chest_width_cm: 59, body_length_cm: 74, sleeve_length_cm: 22, shoulder_width_cm: 49 },
      XXL: { chest_width_cm: 63, body_length_cm: 76, sleeve_length_cm: 23, shoulder_width_cm: 51 },
    },
  },
  {
    id: 'tshirt-004',
    name: 'Urban Stealth Tee',
    description: 'The essential black tee, elevated. Made from ultra-soft ringspun cotton with a contemporary slim fit. Goes with everything.',
    price: 699.75,
    currency: 'EGP',
    category: 'T-Shirts',
    image: '/products/tshirt-black.png',
    color_name: 'Jet Black',
    color_hex: '#1a1a1a',
    sizes: {
      S:   { chest_width_cm: 45, body_length_cm: 67, sleeve_length_cm: 18, shoulder_width_cm: 41 },
      M:   { chest_width_cm: 49, body_length_cm: 69, sleeve_length_cm: 19, shoulder_width_cm: 43 },
      L:   { chest_width_cm: 53, body_length_cm: 71, sleeve_length_cm: 20, shoulder_width_cm: 45 },
      XL:  { chest_width_cm: 57, body_length_cm: 73, sleeve_length_cm: 21, shoulder_width_cm: 47 },
      XXL: { chest_width_cm: 61, body_length_cm: 75, sleeve_length_cm: 22, shoulder_width_cm: 49 },
    },
  },
  {
    id: 'tshirt-005',
    name: 'Artisan Dyed Crew',
    description: 'Rich garment-dyed burgundy on heavyweight cotton. Each piece develops a unique patina over time. Boxy relaxed fit.',
    price: 924.75,
    currency: 'EGP',
    category: 'T-Shirts',
    image: '/products/tshirt-burgundy.png',
    color_name: 'Deep Burgundy',
    color_hex: '#5c1a2a',
    sizes: {
      S:   { chest_width_cm: 48, body_length_cm: 69, sleeve_length_cm: 20, shoulder_width_cm: 44 },
      M:   { chest_width_cm: 52, body_length_cm: 71, sleeve_length_cm: 21, shoulder_width_cm: 46 },
      L:   { chest_width_cm: 56, body_length_cm: 73, sleeve_length_cm: 22, shoulder_width_cm: 48 },
      XL:  { chest_width_cm: 60, body_length_cm: 75, sleeve_length_cm: 23, shoulder_width_cm: 50 },
      XXL: { chest_width_cm: 64, body_length_cm: 77, sleeve_length_cm: 24, shoulder_width_cm: 52 },
    },
  },
  {
    id: 'tshirt-006',
    name: 'Metro Blend Tee',
    description: 'Cotton-polyester blend for all-day comfort. Moisture-wicking, wrinkle-resistant, and perfect for commute-to-weekend transitions.',
    price: 799.75,
    currency: 'EGP',
    category: 'T-Shirts',
    image: '/products/tshirt-gray.png',
    color_name: 'Heather Charcoal',
    color_hex: '#4a4a4a',
    sizes: {
      S:   { chest_width_cm: 46, body_length_cm: 68, sleeve_length_cm: 19, shoulder_width_cm: 42 },
      M:   { chest_width_cm: 50, body_length_cm: 70, sleeve_length_cm: 20, shoulder_width_cm: 44 },
      L:   { chest_width_cm: 54, body_length_cm: 72, sleeve_length_cm: 21, shoulder_width_cm: 46 },
      XL:  { chest_width_cm: 58, body_length_cm: 74, sleeve_length_cm: 22, shoulder_width_cm: 48 },
      XXL: { chest_width_cm: 62, body_length_cm: 76, sleeve_length_cm: 23, shoulder_width_cm: 50 },
    },
  },
]

export function getProducts() {
  return PRODUCTS
}

export function getProductById(id) {
  return PRODUCTS.find(p => p.id === id) || null
}
