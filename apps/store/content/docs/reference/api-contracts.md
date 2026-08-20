# API Contracts

The request/response surface for every route in the monorepo: the Store's own Next.js API layer (auth, storefront, retailer dashboard, admin control plane) and the three internal Python services it fronts. This is a reference, not a narrative — for the reasoning and evidence behind any one of these services, see [T-Shirt](/docs/garments/tshirt), [Pants](/docs/garments/pants), [Combined Outfits](/docs/garments/combined-outfits), or [2D Virtual Try-On](/docs/services/vton).

:::note
Every route below was verified directly against the current source code — not copied from earlier drafts. Two real corrections came out of this pass: the retailer widget-key route now takes a required `[service]` path segment (used to be flat), and the try-on-config colour field is `garmentColorHex`, not the older `tshirtColorHex` (which still exists as an unused column, kept only for migration safety).
:::

---

## 0. Store Orchestration Proxy (Next.js)

**Base URL**: `http://localhost:3000` · **Purpose**: the single entry point for the embeddable widget. The widget calls only these routes; the Store proxies to the internal services, persists what needs persisting, and never exposes an internal service URL to the browser. CORS is open (`*`) on the widget-facing routes so they can run embedded on any retailer's own site.

🔐 **Auth**: every widget request must send `X-Manikan-Key: <retailer public key>` and originate from an allowed `Origin`. Failure responses are deliberately generic (no leak of *which* check failed): `401` missing key, `403` missing/disallowed origin or unknown/inactive key, `429` rate limit (30 req/60s per retailer, `Retry-After` header), `404` product not owned by the authenticated retailer.

---

## 1. Authentication (`/api/auth/*`)

### **POST** `/api/auth/signup`

Registers a new customer or retailer. Supabase is used for auth, then a matching DB record is created.

```json
{
  "role": "customer",
  "firstName": "Ahmed",
  "lastName": "Hassan",
  "email": "ahmed@example.com",
  "password": "securepass123",
  "phone": "+201001234567"
}
```

For `role: "retailer"`, use `storeName` instead of `firstName`/`lastName`.

**Response (201)**:
```json
{ "message": "Registration successful. Please verify your email." }
```

Errors: `400` validation failure (name < 2 chars, bad email, password < 8 chars), `409` email already registered.

---

### **POST** `/api/auth/login`

Signs in an existing customer or retailer via Supabase and sets a role cookie.

```json
{
  "email": "ahmed@example.com",
  "password": "securepass123",
  "role": "customer"
}
```

`role` is optional. If provided, it is validated against the DB record — a customer can't log in as `retailer` and vice versa. **PlatformAdmins are blocked from this route** and redirected to `/admin`.

**Response (200)**:
```json
{
  "success": true,
  "redirect": "/",
  "user": { "id": "uuid", "email": "...", "role": "customer" }
}
```

Errors: `success: false` with `error` string — `"Invalid email or password"`, `"This email belongs to a retailer…"`, `"Platform Admins cannot login here…"`.

---

### **POST** `/api/auth/logout`

Clears the Supabase session and removes the `manikan_role` cookie.

**Response (200)**: `{ "message": "Logged out successfully" }`

---

### **GET** `/api/auth/me`

Returns the current authenticated customer's profile.

**Response (200)**:
```json
{
  "id": "cuid",
  "email": "ahmed@example.com",
  "firstName": "Ahmed",
  "lastName": "Hassan",
  "phone": "+20…",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

`401` if not authenticated.

---

### **POST** `/api/auth/verify-otp`

Verifies a one-time password (OTP) sent to the user's email.

```json
{ "email": "ahmed@example.com", "otp": "123456" }
```

**Response (200)**: `{ "success": true }`

---

### **POST** `/api/auth/resend-otp`

Resends the OTP verification email.

```json
{ "email": "ahmed@example.com" }
```

**Response (200)**: `{ "success": true, "message": "OTP resent" }`

---

### **POST** `/api/auth/reset-password`

Sends a password-reset link to the given email.

```json
{ "email": "ahmed@example.com" }
```

**Response (200)**: `{ "success": true }` — always returns success to prevent email enumeration.

---

### **POST** `/api/auth/update-password`

Updates the authenticated user's password.

```json
{ "password": "newStrongPass456" }
```

**Response (200)**: `{ "success": true }`. `401` if not authenticated.

---

## 2. Products (Public Storefront)

### **GET** `/api/products`

Paginated, filterable, sortable product listing. All results are `isActive: true`.

| Query Param | Type | Description |
|---|---|---|
| `page` | number | Default `1` |
| `limit` | number | Default `12` |
| `gender` | string | Filter by gender (case-insensitive) |
| `category` | string | Filter by category slug or name |
| `brand` | string | Filter by brand (case-insensitive) |
| `search` | string | Full-text search on name + description |
| `sort` | string | `price_asc`, `price_desc`, or `newest` (default) |

**Response (200)**:
```json
{
  "products": [
    {
      "id": "...", "name": "Classic Tee", "slug": "classic-tee",
      "priceEgp": 499, "discountPct": 10, "imageUrl": "...",
      "brand": "Manikan", "category": "tshirt", "gender": "male",
      "stock": 40, "isActive": true,
      "variants": [{ "id": "...", "sizeLabel": "M", "stock": 15 }],
      "categoryRef": { "name": "T-Shirts", "slug": "tshirt" }
    }
  ],
  "pagination": { "total": 120, "page": 1, "limit": 12, "totalPages": 10 }
}
```

---

### **GET** `/api/products/[slug]`

Full product detail with variants, measurements, and computed `isTryOnEnabled`.

**Response (200)**:
```json
{
  "id": "...", "slug": "classic-tee", "name": "Classic Tee",
  "description": "...", "priceEgp": 499, "discountPct": 10,
  "imageUrl": "...", "images": ["..."],
  "brand": "Manikan", "category": "tshirt", "gender": "male",
  "fabric": "Cotton", "isActive": true,
  "garmentColorHex": "#1a1a2e", "isTryOnEnabled": true,
  "variants": [
    { "id": "...", "sizeLabel": "M", "stock": 15, "sku": "SKU-001",
      "garmentChestCm": 50, "garmentLengthCm": 70, "garmentSleeveCm": 20, "garmentShoulderCm": 44 }
  ],
  "categoryRef": { "name": "T-Shirts", "slug": "tshirt" }
}
```

`404` if slug not found or product is inactive.

---

### **GET** `/api/products/search`

Dedicated full-text search endpoint.

| Query Param | Description |
|---|---|
| `q` | Search query string |
| `limit` | Max results (default `10`) |

**Response (200)**: Same product shape as `/api/products`, no pagination wrapper.

---

### **GET** `/api/products/[slug]/reviews`

Paginated list of customer reviews for a product.

| Query Param | Default |
|---|---|
| `page` | `1` |
| `limit` | `10` |

**Response (200)**:
```json
{
  "reviews": [
    { "id": "...", "rating": 5, "comment": "Great fit!", "createdAt": "...",
      "customer": { "firstName": "Ahmed", "avatarUrl": null } }
  ],
  "pagination": { "total": 24, "page": 1, "limit": 10, "totalPages": 3 }
}
```

---

### **POST** `/api/products/[slug]/reviews`

Submits a review for a product. Requires authentication.

```json
{ "rating": 5, "comment": "Great fit!" }
```

`rating` must be between 1–5. `comment` is optional.

**Response (201)**: Created review object. `401` if not authenticated, `409` if already reviewed.

---

### **GET** `/api/categories`

Lists all active product categories.

**Response (200)**:
```json
{
  "categories": [
    { "id": "...", "name": "T-Shirts", "slug": "tshirt", "productCount": 24 }
  ]
}
```

---

### **GET** `/api/categories/[slug]/products`

Products filtered by category slug. Supports same query params as `/api/products` (except `category`).

---

## 3. Cart

### **GET** `/api/cart`

Retrieves all cart items for the currently authenticated customer. Calculates the total subtotal.

**Response (200)**:
```json
{
  "cartItems": [
    {
      "id": "cartitem-123", "quantity": 2,
      "product": { "id": "prod-1", "name": "Classic T-Shirt", "priceEgp": 500, "discountPct": 10, "imageUrl": "...", "isActive": true },
      "variant": { "id": "var-1", "sizeLabel": "M", "stock": 40 }
    }
  ],
  "subtotal": 900
}
```

---

### **POST** `/api/cart`

Adds an item to the cart or increments its quantity if it already exists.

```json
{ "productId": "prod-1", "variantId": "var-1", "quantity": 1 }
```

**Response (201)**: Returns the created/updated `cartItem`. Errors: `401` Unauthorized, `404` Product variant not found, `409` Out of stock or exceeding available stock, `410` Product no longer available.

---

### **PATCH** `/api/cart/[id]`

Updates the quantity of a specific cart item. Sending `quantity: 0` removes the item entirely.

```json
{ "quantity": 3 }
```

**Response (200)**: Returns the updated `cartItem` or a success message if removed. Errors: `404` Cart item not found, `409` Insufficient stock.

---

### **DELETE** `/api/cart/[id]`

Removes a specific item from the cart.

**Response (200)**: `{ "message": "Item removed from cart" }`. `404` if not found.

---

### **DELETE** `/api/cart`

Clears the entire cart for the authenticated customer.

**Response (200)**: `{ "message": "Cart cleared successfully" }`.

---

## 4. Wishlist

### **GET** `/api/wishlist`

Returns all saved products for the current customer. Returns empty list (not 401) for unauthenticated users.

**Response (200)**:
```json
{
  "wishlist": [
    { "id": "...", "createdAt": "...",
      "product": { "id": "...", "name": "...", "slug": "...", "brand": "...",
                   "priceEgp": 499, "discountPct": 0, "imageUrl": "...", "isActive": true,
                   "categoryRef": { "name": "T-Shirts", "slug": "tshirt" } } }
  ]
}
```

---

### **POST** `/api/wishlist`

Saves a product to the wishlist. Idempotent (upsert — adding twice is fine).

```json
{ "productId": "prod-1" }
```

**Response (201)**: `{ "message": "Added to wishlist" }`. Errors: `401`, `404` product not found, `410` product no longer available.

---

### **DELETE** `/api/wishlist/[id]`

Removes a specific item from the wishlist by its wishlist entry `id`.

**Response (200)**: `{ "message": "Removed from wishlist" }`. `404` if not found.

---

## 5. Orders

### **GET** `/api/orders`

Lists the authenticated customer's orders, newest first. Supports optional `?status=` filter.

Valid statuses: `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURN_PENDING`, `RETURNED`.

**Response (200)**:
```json
{
  "orders": [
    {
      "id": "...", "status": "DELIVERED", "totalAmount": 1200,
      "paymentMethod": "cash_on_delivery", "notes": null,
      "createdAt": "2026-05-01T10:00:00Z",
      "address": { "line1": "123 Nile St", "city": "Cairo", "country": "Egypt" },
      "items": [
        { "id": "...", "quantity": 2, "unitPrice": 500,
          "product": { "id": "...", "name": "Classic Tee", "slug": "...", "imageUrl": "...", "brand": "Manikan" },
          "variant": { "id": "...", "sizeLabel": "L", "sku": "SKU-001" } }
      ]
    }
  ]
}
```

---

### **GET** `/api/orders/[id]`

Full detail for a single order. `404` if not found or doesn't belong to the authenticated customer.

---

## 6. Checkout

### **POST** `/api/checkout`

Converts the customer's cart into an `Order`. Atomic: validates stock → creates order + items → decrements stock → clears cart. Race condition-safe (uses `updateMany` with a `stock >= quantity` guard).

```json
{
  "addressId": "addr-123",
  "paymentMethod": "cash_on_delivery",
  "notes": "Leave at door"
}
```

`addressId` is optional (may be null for pickup). `paymentMethod` defaults to `cash_on_delivery`.

**Response (201)**:
```json
{ "orderId": "order-abc", "message": "Order placed successfully" }
```

Errors: `400` empty cart or inactive/out-of-stock product, `401` Unauthorized, `404` address not found, `409` stock sold out mid-checkout.

---

## 7. Addresses

### **GET** `/api/addresses`

Lists all saved delivery addresses for the authenticated customer.

**Response (200)**:
```json
{
  "addresses": [
    { "id": "...", "label": "Home", "line1": "123 Nile St", "line2": null,
      "city": "Cairo", "governorate": "Cairo", "country": "Egypt",
      "postalCode": "11511", "isDefault": true }
  ]
}
```

---

### **POST** `/api/addresses`

Adds a new address. If `isDefault: true`, all other addresses are unset as default atomically.

```json
{
  "label": "Work",
  "line1": "456 Tahrir Square",
  "city": "Cairo",
  "governorate": "Cairo",
  "country": "Egypt",
  "postalCode": "11511",
  "isDefault": false
}
```

**Response (201)**: Created address object.

---

### **PATCH** `/api/addresses/[id]`

Updates any fields of an address. If setting `isDefault: true`, others are cleared atomically.

---

### **DELETE** `/api/addresses/[id]`

Deletes an address. `404` if not found or doesn't belong to the customer.

---

## 8. Reviews

### **POST** `/api/reviews`

Alternative reviews endpoint (same logic as `/api/products/[slug]/reviews` POST). Accepts `productId` in body.

```json
{ "productId": "...", "rating": 4, "comment": "Good quality" }
```

---

## 9. Measurement Sessions

### **POST** `/api/measurement-sessions`

Logs a size recommendation from the AI Size Assistant. **Auth is optional** — anonymous shoppers can be tracked via `shopperRef` (the widget's anonymous visitor token).

```json
{
  "productId": "tshirt-001",
  "shopperRef": "b1f2a3c4",
  "heightCm": 178,
  "weightKg": 74,
  "chestCm": 96,
  "waistCm": 82,
  "hipsCm": 98,
  "recommendedSize": "M",
  "confidenceScore": 0.91,
  "explanation": "Based on your chest measurement…"
}
```

**Response (201)**: `{ "id": "session-xyz" }`. `400` if any required number field is missing/NaN.

---

### **GET** `/api/measurement-sessions`

Returns paginated measurement sessions for the authenticated retailer (dashboard use).

| Query Param | Default |
|---|---|
| `page` | `1` |
| `limit` | `20` |

---

## 10. Widget Routes (External Embed)

These routes are called by the embeddable widget from third-party retailer sites. All require `X-Manikan-Key` + allowed `Origin`.

### **GET** `/api/widget/products/[id]`

Returns a product in the shape the widget expects (measurements, try-on flag, etc.). Verifies the product belongs to the authenticated retailer. `404` if not found or not owned.

### **POST** `/api/widget/recommend`

Proxies a conversation turn to the Recommendation Service. The store builds the product's size chart server-side before forwarding — the widget never sends sizing data the store doesn't already know.

```json
{
  "session_id": "session_abc123",
  "messages": [{ "role": "user", "content": "looking for something formal" }],
  "product_id": "shirt-014",
  "betas": [178, 74, 96, 82, 98]
}
```

**Response (200)**: Conversational reply + optional product suggestions.

---

### **POST** `/api/tryon`

Generates a 3D garment try-on. Reads the garment colour/measurements for `product_id` + `size` from the database, proxies to the Body Service, persists a `MeasurementSession`, streams back the `.glb`.

```json
{
  "product_id": "tshirt-001",
  "size": "M",
  "sex": "male",
  "height_cm": 178,
  "weight_kg": 74,
  "chest_cm": 96,
  "waist_cm": 82,
  "hips_cm": 98,
  "recommended_size": "M",
  "shopper_ref": "b1f2…",
  "also_wear": { "product_id": "pants-004", "size": "32" }
}
```

`shopper_ref` optional. `also_wear` optional — a second garment for layered outfits (see [Combined Outfits](/docs/garments/combined-outfits)).

**Response (200)**: binary `.glb` (`model/gltf-binary`). `X-Manikan-Session-Id` header carries the persisted session id. Errors: `400` missing fields, `404` unknown product, `422` product not try-on-enabled, `502` body service unreachable.

---

### **POST** `/api/avatar`

A bare 3D body avatar — no garment, no product context, no session.

```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74, "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```

**Response (200)**: binary `.glb`.

---

### **POST** `/api/vton/2d/proxy`

Browser-facing entry point for the 2D try-on flow — see [2D Virtual Try-On](/docs/services/vton) for the full request lifecycle, security model, and the internal route it calls. Customer session + same-origin enforced, 5 requests/customer/hour.

---

### **GET** `/api/vton/capabilities`

Returns what the 2D VTON service currently supports (categories, limits). Used by the UI to adapt form options dynamically.

### **GET** `/api/vton/health`

Health-check for the 2D VTON worker. Returns `{ "status": "ok" }` or a 502.

### **GET** `/api/vton/cache`

Retrieves cached 2D try-on results for the authenticated customer. Cached results avoid re-running the expensive FASHN.ai pipeline for the same product+photo combination.

### **GET** `/api/vton/allowlist`

Returns the HTTPS hostname allowlist for garment image URLs (used to validate the `garment_image_url` field before calling the worker).

---

## 11. Business Inquiries

### **POST** `/api/business-inquiries`

Submits a B2B inquiry (e.g., a brand wanting to partner). No auth required.

```json
{
  "name": "Amira Khaled",
  "email": "amira@brand.com",
  "company": "EcoFashion EG",
  "message": "Interested in integrating the 3D try-on for our boutique."
}
```

**Response (201)**: `{ "message": "Inquiry submitted" }`.

---

## 12. Retailer Dashboard API

**Base URL**: `http://localhost:3000` · **Auth**: retailer session cookie (dashboard login), *not* the widget `X-Manikan-Key`. `401` if not logged in. All routes act on the caller's own retailer account.

### **GET** `/api/retailer/me`

Returns the authenticated retailer's profile and settings.

**Response (200)**:
```json
{
  "id": "...", "email": "store@brand.com", "storeName": "Manikan Store",
  "isActivated": true, "createdAt": "...",
  "widgetSettings": { "primaryColor": "#12343b" },
  "recommendationSettings": { "tone": "casual" }
}
```

---

### **GET** `/api/retailer/products`

Paginated list of the retailer's own products. Query: `?page=1&limit=20`.

```json
{
  "products": [
    { "id": "…", "productCode": "SKU1", "name": "…", "category": "shirt", "priceEgp": 500,
      "imageUrl": "…", "stock": 40, "isActive": true, "variantCount": 4, "isTryOnEnabled": false, "createdAt": "…" }
  ],
  "pagination": { "total": 12, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### **POST** `/api/retailer/products`

Creates a product + variants atomically. Slug auto-generated. Required: `productCode, name, category, gender, brand, fabric, imageUrl, priceEgp (>0)`. Optional: `description, images[], stock, discountPct, isActive, variants[]`. `201` on success, `409` if `productCode` already exists, `400` on validation failure.

---

### **GET** `/api/retailer/products/[id]`

Full product detail with variants + `isTryOnEnabled`. `404` if not the caller's.

### **PATCH** `/api/retailer/products/[id]`

Edits scalar fields only (`name, description, category, gender, brand, fabric, imageUrl, images, priceEgp, discountPct, stock, isActive`). Never touches variants or garment data. Send only what changes.

### **DELETE** `/api/retailer/products/[id]`

Hard-deletes (cascades variants/cart/wishlist/reviews/sessions). **`409` if the product has order history** — deactivate instead (`PATCH { isActive: false }`) to preserve records.

---

### **GET** `/api/retailer/products/[id]/tryon-config`

Current 3D-try-on config for a product + a computed `isTryOnEnabled`. `404` if not the caller's.

```json
{
  "productId": "…", "category": "tshirt", "garmentColorHex": "#1a1a2e", "isTryOnEnabled": true,
  "variants": [
    { "id": "…", "sizeLabel": "M", "garmentChestCm": 50, "garmentLengthCm": 70, "garmentSleeveCm": 20, "garmentShoulderCm": 44 }
  ]
}
```

| Category | Required per-variant fields |
|---|---|
| `tshirt` | `garmentChestCm`, `garmentLengthCm`, `garmentSleeveCm`, `garmentShoulderCm` |
| `pants` | `garmentWaistCm`, `garmentHipCm`, `garmentInseamCm`, `garmentRiseCm` |

### **PUT** `/api/retailer/products/[id]/tryon-config`

Sets garment measurements for 3D try-on. Atomic. `sizeLabel`s must already exist on the product.

```json
{
  "garmentColorHex": "#1a1a2e",
  "variants": [
    { "sizeLabel": "M", "garmentChestCm": 50, "garmentLengthCm": 70, "garmentSleeveCm": 20, "garmentShoulderCm": 44 }
  ]
}
```

`400` on bad hex, missing/non-positive measurement, or unknown `sizeLabel`. Returns the same shape as `GET`.

---

### **GET** `/api/retailer/products/upload-csv`

Returns the CSV template for bulk product upload.

### **POST** `/api/products/upload-csv`

Bulk-creates products from a CSV file. Accepts `multipart/form-data` with a `file` field. Returns a summary of created, skipped, and failed rows.

---

### **GET** `/api/retailer/widget-key/[service]`

`service` is one of `BODY_MODELING`, `VTON_2D`, `RECOMMENDATION`. Lazily provisions a key on first access.

```json
{
  "service": "VTON_2D", "apiKey": "pk_live_9f3c…", "isActivated": true,
  "allowedOrigins": ["https://store.com"],
  "subscription": { "planName": "Growth", "quota": 5000, "usage": 214 }
}
```

`subscription` is `null` if no active subscription for that service.

### **POST** `/api/retailer/widget-key/[service]`

Rotates (regenerates) the service's public key. No body. **Immediately invalidates the old key.** Returns `{ "apiKey": "pk_live_…new…" }`.

### **PATCH** `/api/retailer/widget-key/[service]`

```json
{ "allowedOrigins": ["https://store.com", "https://www.store.com"] }
```

Updates the allowed-origins allowlist. Validated to `scheme://host[:port]`. `400` on invalid entry.

---

### **GET/POST** `/api/retailer/widget`

Retailer widget configuration and settings management.

---

### **GET/PATCH** `/api/retailer/recommendation-settings`

Gets or updates the retailer's recommendation AI tone and behaviour settings.

---

### **GET** `/api/retailer/size-charts`

Lists all size chart ingestion jobs for this retailer.

### **POST** `/api/retailer/size-charts`

Uploads a size chart (CSV). Starts an async ingestion job (`PENDING → PROCESSING → COMPLETE | ACTION_REQUIRED | FAILED`).

### **GET** `/api/retailer/size-charts/[id]`

Status and detail for a specific ingestion job, including any per-row validation errors.

### **DELETE** `/api/retailer/size-charts/[id]`

Deletes a size chart ingestion record and its committed measurements.

### **GET** `/api/retailer/size-charts/template`

Downloads a blank CSV template for the retailer to fill in.

---

### **POST** `/api/retailer/billing/checkout`

Creates a billing checkout session (Stripe or equivalent). Returns `{ "checkoutUrl": "https://..." }`.

---

### **GET** `/api/dashboard/orders/[id]`

Order detail view from the retailer's perspective (includes customer info, shipping address, all line items).

---

## 13. Admin Control Plane (`/api/admin/*`)

**Auth**: `manikan_role=admin` cookie set by `/api/admin/login`. Separate from the retailer/customer auth path.

### **POST** `/api/admin/login`

Authenticates a PlatformAdmin. Verifies Supabase credentials, then cross-checks the `PlatformAdmin` table.

```json
{ "email": "admin@manikan.io", "password": "adminpass" }
```

**Response (200)**: `{ "success": true }` + sets `manikan_role=admin` cookie.

### **POST** `/api/admin/logout`

Clears the admin session cookie.

---

### **GET** `/api/admin/retailers/[id]`

Full retailer profile including subscriptions, API keys, audit log, and origin allowlist.

### **PATCH** `/api/admin/retailers/[id]`

Updates retailer fields (e.g., `isActivated`, `storeName`). Changes are audit-logged.

---

### **GET/POST** `/api/admin/retailers/[id]/keys/[service]`

View or rotate a retailer's API key for a specific service. Admin-only version of the retailer self-service key route.

### **GET/PATCH** `/api/admin/retailers/[id]/origins`

View or update the origin allowlist for a retailer.

### **GET/PATCH/DELETE** `/api/admin/retailers/[id]/subscriptions/[service]`

Manage a retailer's subscription for a specific service (activate, change plan, cancel).

---

### **GET** `/api/admin/plans`

Lists all available subscription plans.

### **PATCH** `/api/admin/plans/[id]`

Updates a plan's name, quota, or price. Changes take effect for new subscribers only.

---

### **GET/PATCH** `/api/admin/orders/[id]`

View or update an order's status (admin can override to any `OrderStatus`).

---

### **GET/PATCH** `/api/admin/inquiries/[id]`

View or mark a B2B business inquiry as handled.

---

## 14. Webhooks

### **POST** `/api/webhooks/billing`

Receives billing lifecycle events (subscription created/cancelled/renewed). Validates webhook signature before processing.

### **POST** `/api/webhooks/payment`

Receives payment status updates (paid, failed, refunded). Updates `Order.paymentStatus` accordingly.

---

## 15. Health

### **GET** `/api/health`

Returns overall system health.

**Response (200)**:
```json
{ "status": "ok", "db": "connected", "timestamp": "2026-08-21T00:00:00Z" }
```

---

## 16. 3D Body Service (Internal)

**Base URL**: `http://localhost:8001` · **Purpose**: SMPL shape-parameter estimation and garment mesh fitting. See [T-Shirt](/docs/garments/tshirt) and [Pants](/docs/garments/pants) for the full pipeline.

### **POST** `/generate-avatar`

```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74, "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```

**Response (200)**: binary `.glb`.

### **POST** `/generate-dressed-avatar`

Same optimiser plus a garment. Adds category-specific fields (`garment_waist_cm` etc. for pants; `tshirt_color_hex`, `garment_chest_cm` etc. for tees) and an optional `also_wear` object for a layered second garment. Returns binary `.glb`.

> The widget never calls this directly — the Store proxy (`/api/tryon`, `/api/avatar`) does.

---

## 17. Recommendation Service (Internal)

**Base URL**: `http://localhost:8002` · **Purpose**: LangGraph conversational styling/sizing agent, multi-provider (Gemini, Bedrock, DeepSeek, Ollama, with automatic fallback). Proxied by `/api/widget/recommend`.

### **POST** `/recommend` (via the proxy)

```http
Content-Type: application/json
X-Manikan-Key: <retailer public key>
```

```json
{
  "session_id": "session_abc123",
  "messages": [{ "role": "user", "content": "looking for something formal" }],
  "product_id": "shirt-014",
  "betas": [178, 74, 96, 82, 98]
}
```

**Response (200)**: a conversational reply plus, where applicable, matched product suggestions. The size chart used for sizing advice is built server-side by the proxy from the product's own variant data — never trusted from the request body.

---

## 18. 2D Virtual Try-On (VTON) Service (Internal)

**Base URL**: `http://localhost:8003` · **Purpose**: internal FastAPI worker orchestrating FASHN.ai Try-On Max. Full architecture, security posture, and cost model on its [own page](/docs/services/vton) — this section is the request/response contract only.

### **POST** `/api/vton/2d`

Internal route — the Store's own server calls this, browsers never do directly. Requires `X-Manikan-Internal-Key`.

```http
Content-Type: multipart/form-data
```

| Field | Type | Rule |
|---|---|---|
| `human_image` | Image file | Minimum 400 × 600px |
| `garment_image_url` | String | HTTPS, allowlisted host, minimum 300 × 300px |
| `category` | String | `blouse`, `shirt`, `jacket`, `pants`, `skirt`, or `dress` |
| `session_id` | String, optional | Accepted for compatibility, not used by the worker |

**Response**: `200` with `image/png` binary, `Content-Disposition: attachment`. `400`/`422` on validation failure, `502 FASHN_API_FAILURE` on provider failure, `500 TEMPORARY_IMAGE_PROCESSING_FAILED` on local processing failure. Full error table and live-verified examples on the [VTON page](/docs/services/vton#4-security-verified-live-this-session).

