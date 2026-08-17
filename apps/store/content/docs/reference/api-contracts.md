# API Contracts

The request/response surface for every service in the monorepo: the Store's own orchestration proxy, the retailer dashboard API, and the three internal Python services it fronts. This is a reference, not a narrative — for the reasoning and evidence behind any one of these services, see [T-Shirt](/docs/garments/tshirt), [Pants](/docs/garments/pants), [Combined Outfits](/docs/garments/combined-outfits), or [2D Virtual Try-On](/docs/services/vton).

:::note
Every route below was checked directly against the current code this session, not copied from an earlier draft — two real corrections came out of that pass: the retailer widget-key route now takes a required `[service]` path segment (it used to be flat), and the try-on-config colour field is `garmentColorHex`, not the older `tshirtColorHex` (which still exists as an unused column, kept only for migration safety).
:::

---

## 0. Store Orchestration Proxy (Next.js)

**Base URL**: `http://localhost:3000` · **Purpose**: the single entry point for the embeddable widget. The widget calls only these routes; the Store proxies to the internal services, persists what needs persisting, and never exposes an internal service URL to the browser. CORS is open (`*`) on the widget-facing routes so they can run embedded on any retailer's own site.

🔐 **Auth**: every widget request must send `X-Manikan-Key: <retailer public key>` and originate from an allowed `Origin`. Failure responses are deliberately generic (no leak of *which* check failed): `401` missing key, `403` missing/disallowed origin or unknown/inactive key, `429` rate limit (30 req/60s per retailer, `Retry-After` header), `404` product not owned by the authenticated retailer.

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

`shopper_ref` is the widget's anonymous visitor token, optional. `also_wear` is optional — a second, simultaneously-worn garment in a different category (see [Combined Outfits](/docs/garments/combined-outfits)); a malformed or partial `also_wear` is treated as absent rather than an error.

**Response (200)**: binary `.glb` (`model/gltf-binary`). `X-Manikan-Session-Id` header carries the persisted session id (`none` if skipped). Errors: `400` missing fields, `404` unknown product, `422` product not try-on-enabled, `502` body service unreachable.

### **POST** `/api/avatar`

A bare 3D body avatar — no garment, no product context, no session.

```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74, "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```

**Response (200)**: binary `.glb`.

### **POST** `/api/vton/2d/proxy`

Browser-facing entry point for the 2D try-on flow — see [2D Virtual Try-On](/docs/services/vton) for the full request lifecycle, security model, and the internal route it calls. Customer session + same-origin enforced, 5 requests/customer/hour.

---

## 0.5 Retailer Dashboard API — Widget Keys (Next.js)

**Base URL**: `http://localhost:3000` · **Auth**: retailer session cookie (dashboard login), *not* the widget `X-Manikan-Key`. `401` if not logged in. All routes act on the caller's own retailer account.

:::warning
**Corrected from an earlier draft of this doc.** These routes are per-service, not flat — the path segment is required. A product decision (per-service API keys, subscriptions, and quotas, so a retailer can subscribe to Body Modeling without also paying for Recommendation) shipped 2026-08-07 and changed the route shape from `/api/retailer/widget-key` to the form below.
:::

### **GET** `/api/retailer/widget-key/[service]`

`service` is one of `BODY_MODELING`, `VTON_2D`, `RECOMMENDATION`. Lazily provisions a key on first access — no separate signup step. Returns:

```json
{
  "service": "VTON_2D",
  "apiKey": "pk_live_9f3c…",
  "isActivated": true,
  "allowedOrigins": ["https://store.com"],
  "subscription": { "planName": "Growth", "quota": 5000, "usage": 214 }
}
```

`subscription` is `null` if the retailer has no active subscription for that service.

### **POST** `/api/retailer/widget-key/[service]`

Rotates (regenerates) that service's public key. No body. **Immediately invalidates the old key.** Returns `{ "apiKey": "pk_live_…new…" }`.

### **PATCH** `/api/retailer/widget-key/[service]`

```json
{ "allowedOrigins": ["https://store.com", "https://www.store.com"] }
```

Updates the allowed-origins allowlist for that service, validated and normalized to `scheme://host[:port]` (`400` on an invalid entry). **Only `allowedOrigins` is read from the body** — `isActivated` is not settable through this route despite appearing in the `GET` response; activation is controlled elsewhere in the dashboard flow.

### **GET** `/api/retailer/products/[id]/tryon-config`

Current 3D-try-on config for a product + a computed `isTryOnEnabled`. `404` if not the caller's product.

```json
{
  "productId": "…",
  "category": "tshirt",
  "garmentColorHex": "#1a1a2e",
  "isTryOnEnabled": true,
  "variants": [
    { "id": "…", "sizeLabel": "M", "garmentChestCm": 50, "garmentLengthCm": 70, "garmentSleeveCm": 20, "garmentShoulderCm": 44 }
  ]
}
```

Field name is **`garmentColorHex`** — not `tshirtColorHex`, which is a vestigial, unused schema column kept only so an in-flight migration never breaks. `grep`-confirmed zero live usages of `tshirtColorHex` anywhere in app code.

The exact variant fields required depend on the product's category (`CATEGORY_GARMENT_FIELDS` is the single source of truth every route reads):

| Category | Required per-variant fields |
|---|---|
| `tshirt` | `garmentChestCm`, `garmentLengthCm`, `garmentSleeveCm`, `garmentShoulderCm` |
| `pants` | `garmentWaistCm`, `garmentHipCm`, `garmentInseamCm`, `garmentRiseCm` |

### **PUT** `/api/retailer/products/[id]/tryon-config`

Makes a product 3D-try-on-ready: sets `garmentColorHex` plus the per-size garment measurements for its category. Atomic. `sizeLabel`s must already exist on the product.

```json
{
  "garmentColorHex": "#1a1a2e",
  "variants": [
    { "sizeLabel": "M", "garmentChestCm": 50, "garmentLengthCm": 70, "garmentSleeveCm": 20, "garmentShoulderCm": 44 }
  ]
}
```

`400` on a bad hex, missing/non-positive measurement, or unknown `sizeLabel`. Returns the same shape as `GET`.

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

### **POST** `/api/retailer/products`

Creates a product + variants atomically. Slug auto-generated. Required: `productCode, name, category, gender, brand, fabric, imageUrl, priceEgp (>0)`. Optional: `description, images[], stock, discountPct, isActive, variants[]` (unique `sizeLabel` per variant; garment/try-on fields are set separately via `tryon-config`, not here). `201` on success, `409` if `productCode` already exists for this retailer, `400` on validation failure.

### **GET** `/api/retailer/products/[id]`

Full product detail with variants + `isTryOnEnabled`. `404` if not the caller's.

### **PATCH** `/api/retailer/products/[id]`

Edits scalar fields only (`name, description, category, gender, brand, fabric, imageUrl, images, priceEgp, discountPct, stock, isActive`) — send only what changes. Never touches variants or garment data. `404`/`400` as above.

### **DELETE** `/api/retailer/products/[id]`

Hard-deletes (cascades variants/cart/wishlist/reviews/sessions). **`409` if the product has order history** — deactivate instead (`PATCH { isActive: false }`) to preserve records. `404` if not the caller's.

> **Embed snippet**, generated per-service in the dashboard:
> ```html
> <script src="https://cdn.manikan.io/widget.js"
>         data-retailer-key="pk_live_…"
>         data-product-id="PRODUCT_ID"></script>
> ```

---

## 1. 3D Body Service

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

## 2. Recommendation Service

**Base URL**: `http://localhost:8002` · **Purpose**: LangGraph conversational styling/sizing agent, multi-provider (Gemini, Bedrock, DeepSeek, Ollama, with automatic fallback). Proxied by `/api/widget/recommend` — the widget never calls this directly either, same rule as every other internal service.

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

## 3. 2D Virtual Try-On (VTON) Service

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
