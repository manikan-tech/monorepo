# Admin Dashboard

The internal control plane for the platform team — not retailer-facing. One `PlatformAdmin` account type manages every tenant's lifecycle, subscription, and API keys from `/admin`, separate from both the retailer dashboard and the shopper storefront.

:::warning
**About the source material for this document.** It was rebuilt from an existing write-up styled as an academic/enterprise specification. Checking it against the real code surfaced an unusually high fabrication rate for this session's docs work: entire sections (load-test benchmarks, the AWS cost model) have **no supporting artifact anywhere in this repository** — no test tool, no script, no infrastructure config, nothing the specific numbers could have come from. The cost model's cloud topology also directly contradicts an already-verified fact from this session's own work (it costs out a "Replicate GPU" VTON backend; the real, confirmed integration is FASHN.ai). Rather than launder those numbers into a published doc, this rewrite keeps only what checks out against real code, states plainly what didn't, and adds real capabilities the original write-up never mentioned at all (customer, order, and inquiry management all exist and are real — none of the three appeared in the source material).
:::

## What's done, what's open — right up front

| | Status |
|---|---|
| Admin auth (`getAdminSession`, 8h session) | Done, shipped, verified to match its own source exactly |
| Retailer activation + audit log | Done, shipped — **narrower than commonly assumed**, see below |
| Per-service subscription & key management | Done, shipped |
| Customers / Orders / Inquiries admin views | Done, shipped — real, substantial, previously undocumented |
| Analytics (30-day usage, active subscriptions, top retailers) | Done, shipped |
| Role-based access control (`SUPER_ADMIN` vs `SUPPORT`) | **Partially enforced** — gates Plan management only, nothing else |
| Retailer search/filter, admin-side key rotation, admin-side origin-adding | **Do not exist** — confirmed absent, not partially built |
| Load-test benchmarks, AWS cost model | **No basis anywhere in this repo** — not measured, not modeled here |

## Architecture

**Stack, corrected**: Next.js **16.2.0** (App Router, Server Components) — the source material said "14." TypeScript strict mode, Prisma ORM over Supabase-hosted PostgreSQL, Supabase Auth for identity. No pgvector-backed RAG runs here (see the aside below) — that's a claim about the *recommendation service*, not the admin surface, and it doesn't hold either way.

### The real data model

```prisma
enum AdminRole {
  SUPER_ADMIN
  SUPPORT
}

model PlatformAdmin {
  id        String             @id @default(cuid())
  authId    String             @unique
  email     String             @unique
  role      AdminRole          @default(SUPPORT)
  createdAt DateTime           @default(now())
  auditLogs RetailerAuditLog[]
}

model RetailerAuditLog {
  id         String      @id @default(cuid())
  retailerId String
  adminId    String
  action     AuditAction // ACTIVATED | SUSPENDED | PLAN_CHANGED
  reason     String?
  createdAt  DateTime    @default(now())
}
```

`adminId` is a **required** field (every audit entry has a real actor — there's no anonymous/system audit row), and `reason` is a **plain optional string**, not a structured JSON delta. In practice it's populated with a short human-readable line (e.g. `"RECOMMENDATION subscription updated. Status: ..."`) for subscription changes, and left `null` for a plain activate/suspend toggle.

### Admin login — a single server route, not a multi-step browser flow

The real flow is simpler than a client-side Supabase call followed by a separate authorization step: the browser only ever talks to one endpoint.

```flow
actor B: Admin's browser
actor R: POST /api/admin/login

B -> R: { email, password }
R -> R: supabase.auth.signInWithPassword(email, password)
R -> R: prisma.platformAdmin.findUnique({ where: { email } })
R -> R: not found -> supabase.auth.signOut(), return { success: false }
R -> R: found -> set manikan_role cookie, 8h max-age
R -> B: { success: true }
```

`getAdminSession()` — the gate every admin route calls — matches its own real implementation exactly:

```ts
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const role = cookieStore.get("manikan_role")?.value;
  if (role !== "admin") return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return null;

  const admin = await prisma.platformAdmin.findUnique({ where: { email: user.email } });
  if (!admin) return null;

  return { authenticated: true, id: admin.id, email: admin.email, role: admin.role };
}
```

**Session details, precisely**: `ADMIN_SESSION_MAX_AGE = 8 * 60 * 60` (28,800 seconds, exact). Cookie is `HttpOnly` and `SameSite=Lax` unconditionally — but `Secure` only when `NODE_ENV === "production"`, not unconditionally as a flat "Secure" claim would suggest (correct for local dev over plain HTTP, worth knowing if you're testing cookie behavior locally and it looks different from prod).

**API keys**: `pk_live_` prefix is real, but the length claim was off — `randomBytes(24).toString("hex")` produces **48 hex characters**, not 32. Stripe-style prefix specifically so a key can never be mistaken for a secret; the actual security boundary is the Origin allowlist pairing, not key secrecy.

## The real route surface

### `/admin` — overview

Four real KPI cards: **Total Retailers**, **Active Retailers** (`isActivated: true` count), **Widget Sessions** (all-time `MeasurementSession` count, not a monthly rate), **New Inquiries** (`BusinessInquiry` where `status: "NEW"`). Plus a recent-inquiries list (5 most recent) and a top-5-retailers-by-session-count list.

:::warning
**Not real, despite reading plausibly**: there is no "system health" indicator anywhere on this page, and no "quick action" bar for one-click approval/suspension. Confirmed absent by reading the full page source, not inferred from a screenshot.
:::

### `/admin/analytics`

Real and substantive: a 30-day rolling chart of `ServiceUsageDailyRollup`, broken out per service (`BODY_MODELING` / `VTON_2D` / `RECOMMENDATION`), active-subscription counts grouped by service, total measurement sessions, total products indexed, and a top-5-retailers-by-30-day-usage list with a donut chart (Recharts).

:::warning
**Not real**: "API call distribution," "VTON cache hit ratio," and any latency percentile (p50/p90/p99) shown on this page. `VtonCacheEntry` is a real model, but it's only ever read/written by a retailer-facing cache-management endpoint — nothing in `/admin` touches it, and there is no hit/miss counter anywhere in the codebase to compute a ratio from.
:::

### `/admin/retailers` and `/admin/retailers/[id]`

**Real**: the retailer list (paginated, 10/page), the activate/suspend toggle (`PATCH /api/admin/retailers/[id]`), and — on the detail page — per-service subscription management (`PATCH /api/admin/retailers/[id]/subscriptions/[service]`) and a per-service key active/inactive toggle (`PATCH /api/admin/retailers/[id]/keys/[service]`).

:::warning
**Real capabilities that are narrower than the source material implied:**
- **No search or filter** on the retailer list — confirmed by reading the full table component; pagination is the only real control.
- **Origins can only be removed, never added, from the admin side.** `DELETE /api/admin/retailers/[id]/origins` is the only method this route supports. Adding an origin is a retailer self-service action (their own dashboard, a different route), not something an admin does from here.
- **"Rotate keys" doesn't exist.** The admin UI only flips a key's `isActive` boolean — there's no regenerate/rotate action anywhere in `app/api/admin/`. `generatePublicKey()` is only ever called from the retailer's own self-service route and from seed scripts.
:::

:::tip
**A real, worth-knowing subtlety: two different "allowlist" concepts exist, backed by different storage.** The admin's origin management above reads/writes `Retailer.widgetSettings` (a JSON field, `allowedOrigins` array) — this is the widget's own CORS-style Origin check. A *separate* `OriginAllowlist` Prisma model also exists, but it's used exclusively by the VTON image-host allowlist (`/api/vton/allowlist`), a completely different concern (which HTTPS hosts a product image can be fetched from, not which sites can embed the widget). If you're debugging an origin-related rejection, check which of the two you're actually looking at.
:::

### Retailer activation — the real side effects, not the assumed ones

```ts
// app/api/admin/retailers/[id]/route.ts, inside one prisma.$transaction
await tx.retailer.update({ where: { id }, data: { isActivated } });
await tx.retailerAuditLog.create({
  data: { retailerId: id, adminId: session.id, action: isActivated ? "ACTIVATED" : "SUSPENDED", reason: null },
});
```

:::warning
**Flipping `isActivated` does not generate `ServiceApiKey` rows.** That's the one substantive factual error worth flagging clearly, since it changes how you'd actually operate this: keys are **lazily self-served**, one service at a time, by the retailer's own dashboard (`GET`/`PATCH /api/retailer/widget-key/[service]`) — and that route itself refuses to issue a key (`403`) unless the admin has already activated the account. The real order is: sign up → admin activates (audit log only, no keys yet) → retailer later requests their own key per service, whenever they actually need it. An admin toggling a retailer "on" does not hand them working credentials in the same action.
:::

### `/admin/plans` — real tiers, gated by role

Three real tiers, **not four** — there is no "Enterprise" tier and no "unlimited" quota anywhere in the schema or seed data. Quotas are per-service, not one flat number per tier:

| Tier | Price (EGP/mo) | BODY_MODELING | VTON_2D | RECOMMENDATION |
|---|---:|---:|---:|---:|
| Free | 0 | 100 | 50 | 500 |
| Starter | 999 | 1,000 | 200 | 5,000 |
| Growth | 2,499 | 5,000 | 1,000 | 20,000 |

:::note
The seed script's own comment flags these as provisional: `// ⚠️ PRODUCT OWNER: these quotas/prices are placeholders. Confirm actual go-to-market pricing before deploying to production.` Treat the table above as "what the system currently enforces," not "final pricing."
:::

This is the **one place role-based access control is actually enforced**: `GET/PUT/DELETE` on plans all check `session.role !== "SUPER_ADMIN"` and return `403` otherwise, and the dashboard UI itself hides the create/edit/delete controls from a `SUPPORT`-role admin (`canEdit = adminRole === "SUPER_ADMIN"`).

### `/admin/audit-log`

Real: timestamp, admin email, target retailer, action (`ACTIVATED`/`SUSPENDED`/`PLAN_CHANGED`), and the optional `reason` string described above.

### Customers, Orders, and Inquiries — real, and missing from the original write-up entirely

None of these three appeared anywhere in the source material, despite being real, shipped admin pages backed by real data:

- **`/admin/customers`** — lists real `Customer` records.
- **`/admin/orders`** — lists real `Order` records.
- **`/admin/inquiries`** — lists real `BusinessInquiry` records (the same model the `/admin` overview's "New Inquiries" KPI and recent-activity list read from).

## Security: the one claim that held up completely

:::tip
**Fail-closed suspension, confirmed strongly.** Every widget-facing proxy route runs through `authorizeWidgetRequest()`, whose real check is:
```ts
const serviceKey = await prisma.serviceApiKey.findUnique({ where: { apiKey: key }, include: { retailer: true } });
if (!serviceKey || !serviceKey.isActive || serviceKey.service !== scope || !serviceKey.retailer.isActivated) {
  return { ok: false, response: forbidden(cors) }; // generic 403, no leak of which check failed
}
```
A suspended retailer's key is rejected with a generic `403` before any product or engine logic runs — genuinely fail-closed, and the file's own header comment documents the "no oracle" reasoning behind the generic error body deliberately, not by accident.
:::

## What role-based access control actually covers today

The `AdminRole` enum (`SUPER_ADMIN` / `SUPPORT`) is real and is real-checked — but only in one place. `SUPER_ADMIN` is required for Plan create/edit/delete; every other admin action (activate/suspend a retailer, remove an origin, toggle a key, change a subscription) runs with **no role check at all** — any authenticated `PlatformAdmin`, regardless of role, can do all of it. Worth stating plainly rather than leaving it implied: this is a **partial** rollout of RBAC, not "not yet started," and not "fully realized" either.

## What wasn't real, stated plainly

- **Load-test benchmarks** (§5 of the source material — specific throughput/latency numbers across 4 endpoints). No load-testing tool, script, or results artifact exists anywhere in this repository. The exact figures don't appear anywhere else either. The one real, hand-measured load test in this whole codebase is a completely different thing — a manual concurrency-1/2/4/8 check against `body-service` (documented on the [T-Shirt](/docs/garments/tshirt) page), which found throughput does *not* scale with concurrency on that service — a real, useful, but unrelated finding.
- **The AWS cost model** (§6). No Terraform, CDK, docker-compose, or deployment README exists in this repo. Redis/ElastiCache: zero references anywhere in any `package.json` or `requirements.txt`. Replicate: zero references anywhere — and this one matters beyond "unsupported," since the real, already-verified VTON backend is **FASHN.ai** (see [2D Virtual Try-On](/docs/services/vton)), not Replicate. A cost model built on the wrong backend isn't just unmeasured, it's modeling a system that isn't the one running.
- **"RAG with GPT-4o over pgvector catalog embeddings."** Zero references to GPT-4o or OpenAI models anywhere in `recommendation-service` (it actually runs Gemini/Bedrock/DeepSeek/Ollama with fallback — see the [API Contracts](/docs/reference/api-contracts) page). A `pgvector` column does exist on the product-upload path, but the embedding written into it comes from a function named, literally, `generateMockEmbedding()` — placeholder data, not a real embedding model.
- **Market-sizing claims** ("$150B–$200B annually," "40% of returns"). These are external industry figures, not something checkable against this codebase either way — they're left out of this rewrite rather than repeated as if this platform verified them.

## Roadmap

Grounded in what's actually open, per the findings above:

- **Decide whether RBAC should extend beyond Plan management**, or whether a single unified admin role is the intended design going forward — right now it's a partial state, not a deliberate stopping point that's been written down anywhere.
- **Add admin-side origin-adding and real key rotation**, if that's meant to be an admin capability — today both are retailer self-service only, and "rotate" specifically doesn't exist for anyone.
- **A real load-test pass against the admin API**, if operational confidence at scale is actually needed — nothing here has been measured yet.
- **A real cost model against the actual deployed topology** (FASHN.ai, not Replicate; whatever the real database/hosting choice ends up being), once that topology is decided — reusing the same Fargate-rate methodology already established for the [T-Shirt](/docs/garments/tshirt), [Pants](/docs/garments/pants), and [VTON](/docs/services/vton) cost models, for consistency.
- **If real RAG-based recommendations are still the goal**, the mock-embedding placeholder on the product-upload path is the concrete first step, not a documentation fix.
