# Manikan Microservices API Contracts

This document outlines the API contracts (endpoints, request payloads, and response structures) for the Manikan services in the monorepo.

---

## 0. Store Orchestration Proxy (Next.js)
* **Base URL**: `http://localhost:3000`
* **Purpose**: The single entry point for the embeddable widget. The widget calls **only** these routes; the Store proxies to the Python Body Service, persists the `MeasurementSession`, and never exposes internal service URLs. CORS is open (`*`) so the widget can run embedded on any retailer origin.
* 🔐 **Auth (Phase 3b)**: every request must send `X-Manikan-Key: <retailer public key>` and originate from an allowed `Origin`. Failure codes (generic `403` body, no leak of which check failed): `401` (missing key), `403` (missing/disallowed `Origin`, or unknown/inactive key), `429` (rate limit — 30 req/60s per retailer, `Retry-After` header), `404` (product not owned by the authenticated retailer). See `docs/enterprise-roadmap.md § Security`.

### **POST** `/api/tryon`
Generates a 3D garment try-on. The Store reads the garment colour/measurements for `product_id` + `size` from the database (source of truth), proxies to the Body Service, persists a `MeasurementSession`, and streams back the `.glb`.

#### **Request Body**
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
  "shopper_ref": "b1f2…"
}
```
`shopper_ref` is the widget's anonymous visitor token (MVP Tier 2 identity); optional, saved to `MeasurementSession.shopperRef`.

#### **Response (200 OK)**
Binary `.glb` (`Content-Type: model/gltf-binary`). The `X-Manikan-Session-Id` response header carries the persisted `MeasurementSession` id (`none` if persistence was skipped). Errors: `400` (missing fields), `404` (unknown product), `422` (product not try-on enabled), `502` (body service unreachable).

### **POST** `/api/avatar`
Generates a bare 3D body avatar — no garment, no product context, no session.

#### **Request Body**
```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74, "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```

#### **Response (200 OK)**
Binary `.glb` (`Content-Type: model/gltf-binary`).

---

## 0.5 Retailer Dashboard API — Widget Key (Next.js)
* **Base URL**: `http://localhost:3000`
* **Auth**: retailer **session cookie** (dashboard login) — *not* the widget `X-Manikan-Key`. All routes act on the logged-in retailer's own account; there are no ids in the path. `401` if not logged in.
* **For the frontend team**: this is the backend for the dashboard's "Widget" settings page.

### **GET** `/api/retailer/widget-key`
Returns the retailer's current embed key + widget credentials (for display).
```json
{
  "apiKey": "pk_live_9f3c…",
  "isActivated": true,
  "allowedOrigins": ["https://store.com"]
}
```

### **POST** `/api/retailer/widget-key`
Rotates (regenerates) the public key. No request body. **Immediately invalidates the old key** — the retailer must update their `<script>` tag. Returns `{ "apiKey": "pk_live_…new…" }`.

### **PATCH** `/api/retailer/widget-key`
Updates widget credentials. Either field is optional; send one or both.
```json
{ "allowedOrigins": ["https://store.com", "https://www.store.com"], "isActivated": true }
```
`allowedOrigins` are validated + normalized to `scheme://host[:port]` (invalid entries → `400`). Returns the updated `{ isActivated, allowedOrigins }`.

### **GET** `/api/retailer/products/[id]/tryon-config`
Returns a product's current 3D-try-on config (garment colour + per-size garment measurements) + a computed `isTryOnEnabled`. `404` if the product isn't the caller's.
```json
{
  "productId": "…",
  "tshirtColorHex": "#1a1a2e",
  "isTryOnEnabled": true,
  "variants": [
    { "id": "…", "sizeLabel": "M", "garmentChestCm": 50, "garmentLengthCm": 70, "garmentSleeveCm": 20, "garmentShoulderCm": 44 }
  ]
}
```

### **PUT** `/api/retailer/products/[id]/tryon-config`
Makes a product 3D-try-on-ready: sets the garment colour + the flat garment measurements per size (the "garment gap" data a CSV import doesn't carry). Atomic. `sizeLabel`s must already exist on the product.
```json
{
  "tshirtColorHex": "#1a1a2e",
  "variants": [
    { "sizeLabel": "M", "garmentChestCm": 50, "garmentLengthCm": 70, "garmentSleeveCm": 20, "garmentShoulderCm": 44 }
  ]
}
```
Validation → `400` (bad hex, missing/non-positive measurements, or unknown `sizeLabel`). Returns the same shape as `GET`.

### **GET** `/api/retailer/products`
Lists the retailer's **own** products (paginated). Query: `?page=1&limit=20`.
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
Creates a product + its variants (atomic). Slug is auto-generated. Required: `productCode, name, category, gender, brand, fabric, imageUrl, priceEgp (>0)`. Optional: `description, images[], stock, discountPct, isActive, variants[]` (each variant needs a unique `sizeLabel`; garment/try-on fields are NOT set here — use `tryon-config`). `201` on success; `409` if `productCode` already exists for this retailer; `400` on validation.

### **GET** `/api/retailer/products/[id]`
Full product detail (with variants + `isTryOnEnabled`). `404` if not the caller's.

### **PATCH** `/api/retailer/products/[id]`
Edits product **scalar** fields (`name, description, category, gender, brand, fabric, imageUrl, images, priceEgp, discountPct, stock, isActive`) — send only what changes. Does **not** touch variants or garment data. `404` if not the caller's; `400` on validation.

### **DELETE** `/api/retailer/products/[id]`
Hard-deletes a product (cascades variants/cart/wishlist/reviews/sessions). **`409` if the product has order history** — deactivate instead (`PATCH { isActive: false }`) to preserve order records. `404` if not the caller's.

> **Embed snippet** the retailer pastes into their product page:
> ```html
> <script src="https://cdn.manikan.io/widget.js"
>         data-retailer-key="pk_live_…"
>         data-product-id="PRODUCT_ID"></script>
> ```

---

## 1. 3D Body Service
* **Base URL**: `http://localhost:8001`
* **Purpose**: Performs estimations of SMPL shape parameters, volume calculations, and mesh parameters based on input physical metrics.

### **POST** `/generate-avatar`
Runs the differentiable SMPL optimiser and returns a bare A-pose avatar mesh.

#### **Request Body**
```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74, "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```

#### **Response (200 OK)**
Binary `.glb` (`Content-Type: model/gltf-binary`).

### **POST** `/generate-dressed-avatar`
Same optimiser plus a **real fitted garment mesh** (Pipeline 1) with a **physics-baked drape** for male bodies (Pipeline 2, falls back to the kinematic fit otherwise). Adds `tshirt_color_hex`, `garment_chest_cm`, `garment_length_cm`, `garment_sleeve_cm`, `garment_shoulder_cm` to the request body. Returns a 2-node (`body` + `garment`) binary `.glb`.

Optional texturing fields:
* `product_image_url` — absolute URL of the product's flat-lay photo. When present and loadable, the garment is textured with it (segmented, then recoloured to `tshirt_color_hex` with the photo's fold/weave shading preserved); on any failure it falls back cleanly to a flat `tshirt_color_hex` fill. The Store's `/api/tryon` proxy resolves the product's `imageUrl` (relative → absolute) and passes it here.
* `product_id` — catalog id, diagnostics/cache label only.

Engine toggles (env, Body Service): `MANIKAN_DRESSED_ENGINE=v1` reverts to the legacy vertex-paint garment; `MANIKAN_PHYSICS_DRAPE=0` disables the physics drape (kinematic fit only).

> The widget does not call these directly — the Store proxy (`/api/tryon`, `/api/avatar`) does.

---

## 2. Recommendation Service
* **Base URL**: `http://localhost:8002`
* **Purpose**: LangGraph-powered conversational/personalization agent returning fashion and sizing suggestions.

### **POST** `/recommend/items`
Retrieves a matched outfit recommendation given the user's styling queries, body mesh metrics, and catalog preferences.

#### **Request Header**
```http
Content-Type: application/json
```

#### **Request Body**
```json
{
  "user_id": "usr_99824",
  "body_shape_parameters": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  "preferences": ["formal", "dark colors", "slim-fit"]
}
```

#### **Response Body (200 OK)**
```json
{
  "status": "success",
  "user_id": "usr_99824",
  "recommendations": [
    {
      "item_id": "outfit_01",
      "name": "Classic Fit Suit",
      "match_confidence": 0.95
    },
    {
      "item_id": "outfit_02",
      "name": "Minimalist Casual",
      "match_confidence": 0.88
    }
  ]
}
```

---

## 3. Virtual Try-On (VTON) Service
* **Base URL**: `http://localhost:8003`
* **Purpose**: Integrates diffusion-based VTON algorithms utilizing Replicate APIs to overlay target garments onto user person images.

### **POST** `/tryon/generate`
Generates a virtual try-on image queue ticket using a target human model image and target apparel image.

#### **Request Header**
```http
Content-Type: application/json
```

#### **Request Body**
```json
{
  "person_image_url": "https://img.manikan.ai/profiles/usr_99824_front.jpg",
  "garment_image_url": "https://img.manikan.ai/catalog/outfit_01_jacket.jpg"
}
```

#### **Response Body (202 Accepted)**
```json
{
  "status": "queued",
  "prediction_id": "mock_replicate_pred_12345",
  "info": "To trigger actual model, configure REPLICATE_API_TOKEN environment variable."
}
```
