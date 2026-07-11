# Manikan — Enterprise Roadmap (Widget)

This document records the **deliberate MVP → Enterprise transitions** for the
embeddable widget. The MVP code ships intentionally simplified versions of each
concern below; the inline `TODO(Phase 3b …)` / `TODO(Enterprise …)` comments in
the codebase point here. Read this before "hardening" any of these areas so the
target design is shared.

Status legend: ✅ implemented · 🟡 MVP stub · 🔴 not implemented

---

## § Security & Auth

**Current (MVP, Phase 3b):** 🟡 The proxy routes (`/api/tryon`, `/api/avatar`)
are gated by `apps/store/app/lib/widget-auth.ts`, enforced fail-closed before
any product/engine logic:
1. ✅ **Retailer key validation** — the widget sends a *public* key as the
   `X-Manikan-Key` header (`= Retailer.apiKey`). Resolved to an **active**
   retailer (`isActivated`), else `401` (missing) / `403` (unknown/inactive).
2. ✅ **Fail-closed Origin gate** — a **missing** `Origin` → `403`; an `Origin`
   not in `Retailer.widgetSettings.allowedOrigins` → `403`.
3. ✅ **Rate limiting** — per-retailer fixed-window stub (30 req / 60s),
   `lib/rate-limit.ts` → `429` + `Retry-After`.
4. ✅ **Tenant isolation** — the requested product must belong to the
   authenticated retailer, else `404` (`/api/tryon`).

Auth failures return a **generic `403`** body (no enumeration oracle).

⚠️ **Accepted residual risk:** `Origin` is trivially forged by a server-side
caller, so someone holding BOTH a leaked valid key AND a known allowed origin
can still reach the engine — the rate limit only caps the blast radius. Still
🔴 (future): **plan/quota enforcement** via `Retailer.plan`; a **shared-store
(Redis/Upstash)** limiter with cross-instance coordination; an **IP/global
pre-limit** to shield the DB from bogus-key floods; a **`pk_live_` key format**
distinct from any secret key.

**Enterprise (future):** 🔴
- **Two-Key (Backend-to-Frontend Token) system:** the public key only mints a
  short-lived, signed session token (from the retailer's backend or our token
  endpoint); the widget sends *that* token, not a long-lived key. Limits blast
  radius of a leaked key and enables per-session revocation.
- **FastAPI VPC network isolation:** the Body/Recommendation/VTON services live
  on a private network reachable *only* by the Store service — never a public
  door. The Store becomes the sole authenticated ingress.

---

## § Measurement Sessions & Shopper Identity

The shopper (retailer's end customer) has **no Manikan account** — so identity
is delegated / anonymous. Precedence: `customerRef` (enterprise) → `shopperRef`
(MVP) → fully anonymous.

**Current (MVP, Phase 3a — Tier 2 "Anonymous Server Token"):** 🟡
- The widget generates a `manikan_visitor_id` (UUID) in `localStorage`
  (`apps/widget/src/lib/visitor.js`) and sends it as `shopper_ref` on every
  call. The proxy saves it to `MeasurementSession.shopperRef`.
- Links a returning shopper's sessions **per device / per browser / per
  top-level site** (localStorage is partitioned) with zero login.
- Limitation: does **not** follow the shopper across devices; lost on storage
  clear / private mode (helper returns `null` → treated as anonymous).

**Enterprise (future — Tier 3 "Retailer-Provided Identity"):** 🔴
- A retailer whose shopper is logged into *their* site passes a **signed**
  reference: `Manikan.init({ customerRef, signature })` where
  `signature = HMAC_sha256(customerRef, retailerSharedSecret)`.
- The proxy verifies the HMAC with that retailer's stored secret and keys
  sessions by `(retailerId, customerRef)` → **cross-device** continuity.
- `customerRef` takes precedence over the anonymous `shopperRef` when present.
- Requires: a `RetailerSecret` store + a small integration on the retailer side
  (more than the one-line script tag → an opt-in enhancement).

---

## § Catalog & Garment Data

**Current (MVP, Phase 3a — Option A):** 🟡
- Catalog is populated **manually**: CSV seed (`seed.ts` /
  `demo-retailer-catalog-final.csv`) + the demo t-shirt seed
  (`demo-tshirts.ts`). The `/api/tryon` proxy reads garment data **strictly
  from Prisma** as the single source of truth.
- Limitation: retailers won't re-upload a CSV as their catalog changes → data
  goes stale. Fine for pilot/demo, not for scale.

**Enterprise (future):** 🔴
- **Option C — Platform webhook sync:** a Shopify app / WooCommerce plugin
  pulls the catalog via the platform API and stays fresh via
  `product/created|updated` webhooks. (WooCommerce matters for MENA.)
- **Option D — Lazy pull + cache:** on an unknown/stale `product_id`, fetch that
  one product on-demand from the retailer's platform API / feed URL, cache with
  a TTL. Self-healing, no full-catalog upload.
- 🔴 **The "Garment Gap" (the real hard problem):** flat garment tech-pack
  measurements (`garmentSleeveCm`, `garmentShoulderCm`, `garmentLengthCm`,
  flat chest) are *manufacturing* data and are almost never present on a
  storefront/product page or in a standard product feed. Sync solves freshness
  but **not** this gap. Needs one of: (a) a tech-pack / size-spec importer,
  (b) a model that derives garment measurements from the retailer's size chart
  + a per-category garment template, or (c) retailer-supplied spec sheets at
  onboarding.

---

*Last updated: Phase 3a (widget orchestration + anonymous shopper identity).*
