# Main Store Service

`apps/store` is the one thing every other piece of this platform sits behind. Retailer dashboards, the shopper storefront, and — the part this page is really about — a **proxy**: every embeddable widget, every third-party integration, and every Python microservice call is required to pass through this one Next.js application, never reached directly. That single-choke-point design is the actual subject of this document, more than any one feature.

:::warning
**Same source-material caveat as the other recently-rebuilt docs.** This started from a write-up in the same "graduation project" template family as the Admin dashboard doc — same author framing, and its load-test table and AWS cost model are **verbatim identical** to numbers already proven fabricated there (no test tool or infrastructure config exists anywhere in this repo to have produced them). This rewrite keeps only what checks out against real code, and — this one's genuinely new — found a real, currently-open authentication gap the original write-up never mentioned at all.
:::

## The proxy, drawn as it actually works

<ArchitectureSketch />

Two different trust relationships, deliberately drawn differently: the widget on the left holds a **public** key (`pk_live_…`) and is reachable from anywhere on the internet — that's the whole point of an embeddable widget. Everything on the right holds a **private**, server-to-server key that only this Next.js server itself ever sends, and the three Python services will reject any request lacking it, no exceptions. The Store is the only thing that has both halves.

## What's done, what's open — right up front

| | Status |
|---|---|
| Public key generation + verification (`X-Manikan-Key`) | Done, shipped — see below |
| Origin allowlisting, retailer self-service | Done, shipped (real add/remove, not admin-only) |
| Per-retailer rate limiting (30 req/60s) | Done, shipped |
| Internal service-to-service keys (3 services, 3 separate secrets) | Done, shipped |
| `/api/tryon` real request lifecycle | Done, shipped — buffers then responds, doesn't stream through |
| **`/api/measurement-sessions` has no auth gate at all** | **Confirmed, currently live** — accepts arbitrary client-supplied data from anyone |
| A legacy widget bundle bypasses the proxy rule | **Confirmed, currently live** — see below |
| CSV catalog ingestion | Done, shipped — embeddings are mock data, not real |
| Load-test benchmarks, AWS cost model | **No basis anywhere in this repo** |

## The two halves of the gate

### Public side: what a widget actually holds

`generatePublicKey()` — the same function documented on the [Admin Dashboard](/docs/admin/dashboard) page:

```ts
// app/lib/service-keys.ts
export function generatePublicKey(): string {
  return `pk_live_${randomBytes(24).toString("hex")}`;
}
```

Stripe-style prefix specifically so this key can never be mistaken for a secret — it's designed to sit in public HTML, in a `<script>` tag, on someone else's website. The actual security doesn't come from the key being unguessable in isolation; it comes from what checks it against next.

### `authorizeWidgetRequest()` — the real four checks, and one that isn't actually part of it

```ts
// app/lib/widget-auth.ts, the gate every widget-facing route calls
const serviceKey = await prisma.serviceApiKey.findUnique({
  where: { apiKey: key },
  include: { retailer: true },
});
if (!serviceKey || !serviceKey.isActive || serviceKey.service !== scope || !serviceKey.retailer.isActivated) {
  return { ok: false, response: forbidden(cors) }; // generic 403, no leak of which check failed
}
```

1. **Key validity** — must exist, be active, match the scope (`BODY_MODELING`/`VTON_2D`/`RECOMMENDATION`) the route asked for, and belong to an activated retailer.
2. **Origin allowlist** — the request's `Origin` header is checked against `Retailer.widgetSettings.allowedOrigins` (a JSON array, not a separate table). Missing or unlisted origin → fail-closed `403`.
3. **Rate limit** — 30 requests / 60 seconds per retailer, `429` with `Retry-After` on breach.
4. Every failure mode returns the **same generic error body** — a deliberate anti-enumeration choice, so a caller probing the gate can't learn which of the three checks actually failed.

:::note
**What's *not* part of this shared gate, despite reading like it should be**: tenant isolation on a specific `productId` (does this product belong to the retailer the key authenticates as?) is **not** inside `authorizeWidgetRequest` — it's a route-local check, implemented separately inside `/api/tryon`'s own `resolveGarment()` helper. `grep`-confirmed zero references to `productId` anywhere in `widget-auth.ts`. Functionally the outcome matches what you'd expect (a cross-tenant product lookup returns a generic `404`), but if you're adding a new widget-facing route, don't assume the shared gate already covers product ownership — it doesn't, you have to add that check yourself, the way `/api/tryon` did.
:::

### Private side: three separate secrets, not one shared internal key

Each Python service verifies its **own** independent server-to-server secret — compromising one doesn't compromise the others:

| Service | Env var (Store side) | Header sent | Verified by |
|---|---|---|---|
| Body Service | `BODY_SERVICE_KEY` | (internal, service-specific) | `verify_internal_key` equivalent in `body-service` |
| Recommendation Service | `RECOMMENDATION_SERVICE_KEY` | (internal, service-specific) | `recommendation-service/app/config.py`'s `recommend_api_key` |
| 2D VTON Service | `TRYON_SERVICE_KEY` | `X-Manikan-Internal-Key` | `verify_internal_key()`, fail-closed, `hmac.compare_digest`, rotation-aware via `TRYON_SERVICE_KEY_PREVIOUS` — see [2D Virtual Try-On](/docs/services/vton#4-security-verified-live-this-session) |

None of these three values are ever sent to a browser. A Python service reachable directly (bypassing the Store) is a real, separately-tracked risk per service — the VTON page already documents its own worker's live CORS gap in detail.

## `/api/tryon` — the real request lifecycle, corrected

The source material's sequence diagram had the right actors but the wrong mechanics — it showed the body-service response streaming straight through to the shopper, with session logging happening somewhere alongside. The real code buffers the entire mesh into memory first, and only then does everything else:

```flow
actor S: Shopper's widget
actor P: POST /api/tryon
actor D: Database
actor B: Body Service

S -> P: { product_id, size, height_cm, weight_kg, chest_cm, waist_cm, hips_cm }
P -> P: authorizeWidgetRequest — key, Origin, rate limit
P -> D: resolveGarment — product lookup, tenant-isolation check
P -> B: POST /generate-dressed-avatar, internal key
B -> P: full .glb, awaited into memory (not streamed through)
P -> D: create MeasurementSession — non-fatal if this fails
P -> S: the .glb response, X-Manikan-Session-Id header
```

Two real details worth knowing if you're debugging this route: the `.glb` is fully buffered (`await upstream.arrayBuffer()`) before anything else happens, not streamed live — so "large mesh, slow body-service" shows up as one long wait, not a progressive download. And the `MeasurementSession` write is wrapped in its own try/catch — if it fails, the shopper still gets their `.glb`, just without a session id, per the response header's own documented `"none"` fallback value.

## A real, currently-open gap the source material never mentioned

:::warning
**`POST /api/measurement-sessions` has no authentication gate at all.** Not a weaker one — none. It doesn't call `authorizeWidgetRequest`, doesn't check an `X-Manikan-Key`, doesn't check `Origin`. It accepts `{ productId, shopperRef, heightCm, weightKg, chestCm, waistCm, hipsCm, recommendedSize, confidenceScore, explanation }` from **any caller**, looks up the product only to derive a `retailerId` to attach the row to, and writes a `MeasurementSession` with whatever `recommendedSize`/`confidenceScore`/`explanation` the caller sent — verbatim, unvalidated, from the client. There is no server-side recommendation engine on the other end of this route; it's a passive logging sink that trusts its caller completely.

The source material's own sequence diagram invented a whole pipeline for this route (Store → Recommendation Engine → pgvector → GPT-4o → back to Store) that doesn't exist — the *real* recommendation flow is a completely separate, properly-gated route (`/api/widget/recommend`, proxying to `recommendation-service`), which has nothing to do with this one. `widget.js` (see below) calls the real recommend route first, then separately POSTs whatever it got back to this unguarded logging endpoint — so in the one client that uses it today, the data happens to be legitimate. But nothing about the route itself enforces that; anyone who finds this endpoint can write arbitrary fake `MeasurementSession` rows with fabricated size recommendations and confidence scores attributed to a real product and retailer.
:::

## Three widget bundles, not one — and they don't all follow the proxy rule

The source material described one widget script. There are really three, doing different jobs, at different levels of architectural correctness:

| Bundle | Where it's actually embedded | Follows the proxy rule? |
|---|---|---|
| `recommend-widget.js` | Per-product, real storefront pages (`ManikanRecommendWidget.tsx`) | **Yes** — calls `/api/widget/recommend`, the Store's own proxy |
| `manikan-widget.js` | Per-product, alongside the above, for 3D try-on | Yes, by the same pattern |
| `widget.js` | Globally, in `Navbar.tsx`, on Manikan's **own** demo storefront (`data-retailer-id="haneen"`) | **No** — calls the external recommendation-service URL directly, bypassing `/api/widget/recommend` entirely |

`widget.js` is a legacy bundle, superseded by `recommend-widget.js` for real retailer embeds, but it's still live on Manikan's own site today. It's the one already covered earlier this session (the "Connection error" chat-widget bug traced to it pointing at an undeclared env var) — that fix was rolled back at your request, so as of this writing `widget.js` is back to bypassing the proxy the same way it did before, which is worth knowing precisely because this document is making the "always proxy" rule out to be a strict architectural invariant. It mostly is — just not for this one legacy file, currently.

**The real embed snippet** (what `ServiceKeyPanel.tsx` actually generates for retailers, not the source material's invented `data-manikan-key`):

```html
<script src="https://widget.manikan.tech/v1/recommend.js"
        data-retailer-key="pk_live_…"
        data-product-id="PRODUCT_ID"></script>
```

Two different real script hosts depending on which service the snippet is for — `/v1/recommend.js` for Recommendation, `/v1/embed.js` for Body Modeling — neither is the source material's `cdn.manikan.io`. And the `<button id="manikan-fit-button">` trigger-element pattern the source material showed doesn't exist anywhere in this codebase — zero matches, fully invented.

## Real dashboard paths, corrected

- **CSV catalog upload**: `/dashboard/products` (`CsvUploadButton.tsx` → `POST /api/products/upload-csv`) — not a "Catalog" section, which doesn't exist in the real sidebar nav.
- **A separate, more structured size-chart flow** the source material didn't mention at all: `/dashboard/products/size-charts`, its own ingestion pipeline (`SizeChartIngestion` model), distinct from the CSV catalog importer.
- **Origin allowlist management**: lives under **AI Services** (`/dashboard/services/body-modeling`, `/dashboard/services/recommendations` — `ServiceKeyPanel.tsx`), not "Settings" — the real Settings page only handles store-name and password. And unlike the Admin dashboard (which can only *remove* an origin), the retailer's own self-service panel here supports full add **and** remove, via `PATCH /api/retailer/widget-key/[service]`.

## Catalog ingestion — real pipeline, fake embeddings

The CSV upload flow is real and does write a `pgvector` embedding column on every product. But same finding as the [Admin Dashboard](/docs/admin/dashboard) page's recommendation-engine section:

```ts
// app/api/products/upload-csv/route.ts
function generateMockEmbedding(dim = 1536) {
  // Generate random mock embeddings since we don't have an OpenAI key available.
  return new Array(dim).fill(0).map(() => Math.random() * 2 - 1);
}
```

Real infrastructure, fake data — every product's "embedding" is uniform random noise, not a real text or image embedding. Any semantic-similarity feature built on top of this column today would be operating on noise, not meaning.

## The data model, corrected

The source material's `Product` and `ProductVariant` excerpts were heavily simplified to the point of being wrong, not just incomplete. Real `Product` has `productCode`/`name` (not a single `title`), `slug`, `gender`, `brand`, `fabric`, `priceEgp`, `discountPct`, an `images[]` array, `stock`, the `embedding vector(1536)` column above, and — same duplicate-field drift already documented on the [T-Shirt](/docs/garments/tshirt) page — both `garmentColorHex` (real, live) and `tshirtColorHex` (vestigial, unused) columns. Real `ProductVariant` additionally carries the *customer-facing* body-fit measurements (`chestCm`, `waistCm`, `hipCm`, `lengthCm`, `inseamCm` — what the garment fits, not the garment's own flat measurements) plus pants-specific `garmentInseamCm`/`garmentRiseCm`, none of which appeared in the source material at all.

`MeasurementSession`'s field list was mostly accurate, but omitted real columns `measurementVersion`, `bodyShapeParams` (JSON), `tryonResultUrl`, and `isPurchased` — and, per the finding above, `recommendedSize`/`confidenceScore`/`explanation` are real columns that currently get populated with **unvalidated client input**, not a server-computed recommendation, which matters a great deal for how much you should trust their contents today.

## What wasn't real, stated plainly

Identical pattern to the [Admin Dashboard](/docs/admin/dashboard) page, because it's largely the same fabricated material reused:

- **The load-test table** (`169.11`/`56.48`/`32.45`/`41.94` req/s) — verbatim identical numbers to the Admin doc's fabricated table, applied here to different route names. No load-testing tool or results artifact exists anywhere in this repo.
- **The AWS cost model** — same invented topology (ECS Fargate, RDS, ElastiCache Redis, S3+CloudFront, Replicate GPU) with no Terraform/CDK/docker-compose/deployment README anywhere in the repo to support it, and the same direct contradiction: the real VTON backend is FASHN.ai, not Replicate.
- **"GPT-4o Size Recommendation"** and pgvector-backed RAG — fabricated in the same way as the Admin doc's finding. The real recommendation service runs Gemini/Bedrock/DeepSeek/Ollama with fallback, and — per this page's own finding above — the catalog's pgvector embeddings are mock random data regardless of which model would eventually read them.
- **Market-sizing claims** ("$150B–$200B annually," "40% of returns") — external industry figures, not checkable against this codebase, left out rather than repeated as verified fact.

## Roadmap

- **Gate `/api/measurement-sessions`.** This is the one genuinely urgent item on this page — an unauthenticated write endpoint that lets anyone attach fabricated size recommendations to a real product and retailer.
- **Decide `widget.js`'s fate.** Either migrate Manikan's own demo storefront onto `recommend-widget.js` like every real retailer embed, or formally document `widget.js` as a deliberate, contained exception to the proxy rule — right now it's neither, just an inconsistency waiting to be noticed.
- **A real load-test and cost model**, if operational confidence at scale is actually needed — nothing on this page has been measured yet, matching the Admin dashboard's own open item.
- **Reconcile the two catalog-ingestion pipelines** (CSV importer vs. the separate size-chart ingestion flow) if they're meant to converge, or document why they're deliberately kept apart.
