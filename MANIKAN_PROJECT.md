# Manikan — Project Documentation
> Internal team reference. Read this before writing a single line of code.

---

## 1. What Is Manikan?

Manikan is a **B2B AI-powered widget** that fashion e-commerce retailers embed into their existing store with a **single HTML script tag** — zero engineering changes required on their side.

Once embedded, the widget allows shoppers to:
- Enter 4 body measurements (height, weight, chest circumference, waist circumference)
- Optionally upload a front-facing photo
- Receive an **AI-powered size recommendation** explaining exactly which size fits them and why
- See a **realistic virtual try-on image** of the garment on their own body

**The problem we solve:** 40% of online fashion returns are caused by poor fit, not defective products. Every brand uses different size charts, different measurement conventions, and different fit philosophies — leaving shoppers unable to predict how a garment will actually fit. This costs retailers $150–200 billion annually in reverse logistics, inspection, and restocking.

**Our business model:** B2B SaaS. Retailers (our clients) pay to embed the widget. Shoppers use it for free inside the retailer's store.

---

## 2. Who Are Our Users?

| User Type | Who They Are | What They Do With Manikan |
|---|---|---|
| **Retailer (B2B client)** | Fashion e-commerce store owners | Embed the widget, upload their product catalog, view analytics |
| **Shopper (B2C end user)** | Customers on the retailer's site | Enter measurements, get size recommendations, try on garments virtually |

**Primary target market:** MENA region (Egypt-first), where in-store fitting is limited and return logistics are expensive — making wrong purchases particularly painful.

---

## 3. Core Features

### Feature 1 — Size Recommendation (Core, MVP)
- Shopper enters: height, weight, chest circumference, waist circumference
- SMPL body model generates a 3D body shape from these 4 measurements
- Recommendation agent compares body shape against retailer's size chart data
- Agent returns: recommended size + natural language explanation of why

### Feature 2 — Virtual Try-On (Phase 1 Add-on)
- Shopper optionally uploads a front-facing photo
- System sends shopper photo + garment product image to a pretrained VTON model (via Replicate API)
- Returns a realistic 2D image of the shopper wearing that specific garment
- Photo is processed in memory, never stored permanently, deleted from Replicate immediately after result is returned

### Feature 3 — SMPL 3D Body Preview with Parametric Garment Layer
The 3D output is made of **two separate layers rendered together**, not one mesh:

**Layer 1 — SMPL Body Mesh (inner layer)**
- Generated from the shopper's 4 measurements
- Represents the shopper's actual body shape as a 3D mesh
- This mesh is always the same regardless of which garment is being viewed

**Layer 2 — Parametric Garment Shape (outer layer, on top of body mesh)**
- A simplified geometric garment shape placed on top of the body mesh
- Built from basic 3D shapes calculated from the body mesh dimensions:
  - Blouse/Shirt → rectangular torso shell + two cylindrical sleeves
  - Pants → two tapered cylinders for legs + waistband rectangle
  - Skirt → cone/flared shape around the waist
- Each shape is offset outward from the body mesh (e.g., +3cm for loose blouse, +1cm for fitted shirt) so it never looks skin-tight
- Garment shape dimensions are derived from the SMPL betas — so a wider body = wider garment shape automatically

**What this achieves:** The shopper sees a realistic 3D silhouette of their body wearing that specific garment category — not a naked body, not a skin-tight texture. This is not cloth simulation (which is research-level complexity) — it is a fast, deployable approximation that is visually clear and meaningful.

**Important distinction:** This 3D layer system is separate from the VTON service. The 3D preview shows garment category/silhouette. The VTON service (2D, via Replicate) shows the actual garment fabric/print/color on the shopper's photo realistically.

### Feature 4 — Retailer Catalog Ingestion
- Retailers upload their product catalog via CSV
- System parses, validates, and stores products + size charts in DB
- Text embeddings are generated per product and stored in pgvector for RAG retrieval

### Feature 5 — Retailer Dashboard
- Retailers log in to view widget usage analytics
- Manage their product catalog (upload, update, delete products)
- Customize widget appearance (colors, language)
- View recommendation accuracy stats

---

## 4. Architecture Overview

Manikan is built as **4 independent microservices + 1 embeddable widget**. Each service can be deployed, scaled, and updated independently.

```
┌─────────────────────────────────────────────────────┐
│                  Retailer's Website                  │
│   (Shopify / WooCommerce / Custom — we don't control)│
│                                                     │
│   <script src="https://cdn.manikan.io/widget.js">   │
│                       │                             │
└───────────────────────┼─────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────┐
│        Widget Bundle          │
│  (React + Vite, standalone)   │  ← runs inside retailer's site
│  Measurement form / Try-On UI │
└──────────┬───────────────────┘
           │ HTTP requests
           ▼
┌──────────────────────────────┐
│       Store Service           │
│  (Next.js 14 + TypeScript)    │  ← central hub / orchestrator
│  API Routes + Dashboard UI    │
│  Supabase PostgreSQL + Prisma │
│  Deployed on Vercel           │
└──────┬───────────┬───────────┘
       │           │
       ▼           ▼
┌─────────────┐  ┌──────────────────────────────┐
│ Body Service│  │    Recommendation Service     │
│  (FastAPI)  │  │    (FastAPI + LangGraph)      │
│  SMPL model │  │    GPT-4o + pgvector RAG      │
│  Railway    │  │    Langfuse observability     │
└─────────────┘  └──────────────────────────────┘
                          │
                          ▼
               ┌──────────────────┐
               │   VTON Service   │
               │   (FastAPI)      │
               │ Replicate API    │
               │ Railway          │
               └──────────────────┘
```

### Request Flow (end to end)

```
1. Shopper opens widget on retailer's site
2. Shopper enters 4 measurements (+ optional photo for try-on)
3. Widget → POST /api/measurements (Store Service)
4. Store Service validates input, creates MeasurementSession in DB
5. Store Service → POST /predict-body-shape (Body Service)
6. Body Service runs SMPL → returns body shape parameters (betas)
7. Store Service saves betas to MeasurementSession
8. Store Service → POST /recommend (Recommendation Service)
9. Recommendation Service queries pgvector for matching products
10. LangGraph agent reasons over results → returns size recommendation + explanation
11. [If photo uploaded] Store Service → POST /tryon (VTON Service)
12. VTON Service calls Replicate API → returns try-on image URL
13. VTON Service deletes photo from Replicate immediately
14. Store Service returns full response to widget
15. Widget renders three outputs side by side:
    a. Size recommendation card (text: recommended size + explanation)
    b. 3D preview: body mesh (inner) + parametric garment mesh (outer) rendered together
    c. [If photo uploaded] 2D realistic try-on image from VTON service
```

---

## 5. Services In Detail

### Service 1 — Store Service (Central Hub)
**Repo path:** `apps/store/`

**Responsibilities:**
- Serves the Retailer Dashboard (login, catalog management, analytics)
- Exposes all API routes that the widget calls
- Acts as orchestrator — it calls Body Service, Recommendation Service, and VTON Service; the widget never calls these directly
- Handles retailer onboarding, authentication, and CSV catalog ingestion
- Manages all database operations via Prisma

**Tech:** Next.js 14, TypeScript, Prisma ORM, Supabase (PostgreSQL), deployed on Vercel

**Key API routes:**
```
POST /api/measurements          → create session, trigger SMPL + recommendation
POST /api/retailer/upload-catalog → ingest retailer CSV, seed pgvector
POST /api/tryon                 → [IMPLEMENTED, Phase 3a+3b] auth-gated (X-Manikan-Key + fail-closed Origin allowlist + rate limit + tenant check) proxy to Body Service /generate-dressed-avatar; reads garment data from DB, persists MeasurementSession (+ anonymous shopperRef), streams .glb. See docs/enterprise-roadmap.md § Security
POST /api/avatar                → [IMPLEMENTED, Phase 3a+3b] same auth gate; proxy to Body Service /generate-avatar; streams bare body .glb (no product/session context)
GET  /api/retailer/analytics    → dashboard stats
```

---

### Service 2 — Body Service
**Repo path:** `apps/body-service/`

**Responsibilities:**
- Receives 4 validated measurements + the current garment category being viewed
- Runs SMPL body model to generate body shape parameters (beta values)
- Builds parametric garment shape on top of the SMPL body mesh (blouse = torso shell + sleeves, pants = leg cylinders + waistband, skirt = flared cone), offset outward per garment type so it never looks skin-tight
- Returns both the body mesh AND the garment mesh as a combined 3D scene for the widget to render
- Never called directly from the widget — only from Store Service

**Tech:** Python, FastAPI, PyTorch, SMPL (research license for ITI, commercial license post-graduation), deployed on Railway

**Key endpoint:**
```
POST /predict-body-shape
Input:  { session_id, height_cm, weight_kg, chest_cm, waist_cm, garment_category }
Output: {
  session_id,
  betas: [...],             ← SMPL shape parameters (used by recommendation service)
  body_mesh_url: "...",     ← inner layer: shopper body shape
  garment_mesh_url: "...",  ← outer layer: parametric garment shape
  fit_offset_cm: 3.0        ← how far garment layer sits from body mesh
}
```

---

### Service 3 — Recommendation Service
**Repo path:** `apps/recommendation-service/`

**Responsibilities:**
- Receives body shape parameters from Store Service
- Runs LangGraph agent that:
  1. Queries pgvector for products semantically matching the shopper's profile
  2. Cross-checks numeric size chart data for each candidate product
  3. Reasons over fit quality and generates a natural language recommendation
- Langfuse traces every agent decision for observability and debugging

**Tech:** Python, FastAPI, LangGraph, GPT-4o, pgvector (Postgres extension), Langfuse, deployed on Railway

**Key endpoint:**
```
POST /recommend
Input:  { session_id, betas, retailer_id, product_id }
Output: { recommended_size, confidence_score, explanation, alternative_size }
```

---

### Service 4 — VTON Service
**Repo path:** `apps/tryon-service/`

**Responsibilities:**
- Receives shopper photo + garment product image URL
- Calls pretrained Virtual Try-On model via Replicate API (IDM-VTON or OOTDiffusion)
- Returns try-on result image URL
- Immediately deletes shopper photo from Replicate after result is returned
- Never stores raw shopper photos anywhere

**Tech:** Python, FastAPI, Replicate Python SDK, deployed on Railway

**Security rules (non-negotiable):**
- Shopper photo processed in memory only
- Deleted from Replicate storage immediately via Replicate delete API after inference
- No logging of photo content or URLs
- HTTPS only, no raw photo stored in DB — only the output try-on image (if user saves it)

**Key endpoint:**
```
POST /tryon
Input:  { session_id, human_img_url (temp), garment_img_url }
Output: { tryon_result_url }
```

---

### Widget (Frontend)
**Repo path:** `apps/widget/`

**What it is:** A standalone React bundle (not a full app) that compiles to a single JS file. Retailers embed it via one script tag.

**Responsibilities:**
- Measurement input form (step 1)
- Optional photo upload for try-on (step 2)
- Displays: size recommendation card + 3D body shape preview + try-on image
- Communicates only with Store Service API — never directly with Body/Recommendation/VTON services

**Tech:** React 18, TypeScript, Vite (library mode build), Tailwind CSS

**Embed code (what retailer puts in their site):**
```html
<script src="https://cdn.manikan.io/widget.js"
        data-retailer-id="RETAILER_ID"
        data-product-id="PRODUCT_ID">
</script>
```

---

### Retailer Dashboard (Frontend)
**Repo path:** `apps/store/` (same Next.js app as Store Service, different routes)

**Pages:**
- `/dashboard` — usage analytics, recommendation stats
- `/catalog` — upload CSV, manage products
- `/settings` — widget customization (colors, language, logo)
- `/billing` — subscription management (post-ITI)

---

## 6. Database Schema (Simplified)

```prisma
model Retailer {
  id        String    @id @default(cuid())
  name      String
  apiKey    String    @unique
  products  Product[]
  sessions  MeasurementSession[]
}

model Product {
  id         String           @id @default(cuid())
  retailerId String
  name       String
  category   String           // blouse | pants | shirt | skirt
  gender     String           // women | men
  brand      String
  fabric     String
  priceEgp   Float
  imageUrl   String
  embedding  Unsupported("vector(1536)")?
  variants   ProductVariant[]
  retailer   Retailer         @relation(fields: [retailerId], references: [id])
}

model ProductVariant {
  id        String  @id @default(cuid())
  productId String
  sizeLabel String  // S | M | L | XL | XXL
  chestCm   Float?
  waistCm   Float?
  hipCm     Float?
  lengthCm  Float?
  inseamCm  Float?
  product   Product @relation(fields: [productId], references: [id])
}

model MeasurementSession {
  id                   String   @id @default(cuid())
  retailerId           String
  heightCm             Float
  weightKg             Float
  chestCm              Float
  waistCm              Float
  measurementMethodVer String   @default("v1")
  bodyShapeParams      Json?    // SMPL betas
  recommendedSize      String?
  confidenceScore      Float?
  explanation          String?
  tryonResultUrl       String?  // output only, never raw shopper photo
  createdAt            DateTime @default(now())
  retailer             Retailer @relation(fields: [retailerId], references: [id])
}
```

---

## 7. Technology Stack Summary

| Layer | Technology | Why |
|---|---|---|
| Widget | React 18 + Vite (library mode) + TypeScript | Compiles to single JS file, embeddable in any site |
| Widget Styling | Tailwind CSS | Utility-first, keeps bundle small |
| Dashboard + Store API | Next.js 14 + TypeScript | SSR, routing, API routes in one framework |
| ORM | Prisma | Type-safe DB queries, migration management |
| Database | Supabase (PostgreSQL) | Managed Postgres + built-in auth + Storage for images |
| Vector Store (RAG) | pgvector (Postgres extension) | No extra infra — reuses existing Postgres |
| Store Hosting | Vercel | Edge delivery, fast for MENA, fits Next.js perfectly |
| Body Service | Python + FastAPI + PyTorch + SMPL | Python required for SMPL/ML ecosystem |
| Recommendation Service | Python + FastAPI + LangGraph + GPT-4o | Stateful agent orchestration for RAG flow |
| Agentic Observability | Langfuse | Trace LangGraph decisions, debug RAG quality |
| VTON Service | Python + FastAPI + Replicate API | Pretrained try-on model, no GPU needed on our side |
| Python Services Hosting | Railway | Simple Python deploy, handles compute for SMPL |
| Containerization | Docker (all 4 services) | Consistent local/prod parity, independent scaling |
| Version Control | Git + GitHub (monorepo) | Single repo, centralized PR review for 5-person team |
| Embedding Model | OpenAI text-embedding-3-small | Product catalog embeddings for pgvector RAG |

---

## 8. Repo Structure

```
manikan/
├── apps/
│   ├── store/                    ← Next.js 14 (Dashboard + API)
│   ├── widget/                   ← React + Vite (embeddable bundle)
│   ├── body-service/             ← Python FastAPI + SMPL
│   ├── recommendation-service/   ← Python FastAPI + LangGraph
│   └── tryon-service/            ← Python FastAPI + Replicate
├── packages/
│   └── shared-types/             ← TypeScript types shared across apps
├── docs/
│   ├── api-contracts.md          ← Request/response shapes between all services
│   └── sample-data/
│       └── demo-retailer-catalog.csv  ← Mock catalog for demo/seeding
└── README.md
```

---

## 9. Team Task Split (Suggested)

| Person | Primary Ownership | Secondary |
|---|---|---|
| **Alaa** | Store Service (API routes, DB schema, CSV ingestion, Prisma) | Architecture decisions, integration lead |
| **Person 2** | Recommendation Service (LangGraph agent, RAG, pgvector) | Langfuse setup |
| **Person 3** | Body Service (SMPL integration, FastAPI, parametric offset) | Docker for body service |
| **Person 4** | Widget (React bundle, Vite config, measurement form, try-on UI) | Dashboard UI pages |
| **Person 5** | VTON Service (Replicate integration, security, photo deletion) + Retailer Dashboard pages | Deployment (Railway + Vercel) |

---

## 10. Development Phases

### Phase 1 — Setup (Week 1)
- [ ] Repo structure + GitHub team access
- [ ] API contracts agreed and documented (`docs/api-contracts.md`)
- [ ] DB schema designed and first Prisma migration
- [ ] All 4 services scaffolded with `/health` endpoint running locally
- [ ] Docker setup per service

### Phase 2 — Core Build (Weeks 2–6, parallel)
- [ ] Store Service: CSV ingestion, measurement session API, embedding generation
- [ ] Body Service: SMPL integration, parametric garment shapes per category (blouse/shirt/pants/skirt), loose-fit offset per garment type
- [ ] Recommendation Service: LangGraph agent, pgvector retrieval, GPT-4o reasoning
- [ ] Widget: measurement form, UI components
- [ ] VTON Service: Replicate integration, security/photo deletion flow

### Phase 3 — Integration (Weeks 7–8)
- [ ] Connect all services through Store Service orchestration
- [ ] End-to-end test: measurement input → size recommendation → try-on image
- [ ] Fix contract mismatches between services

### Phase 4 — Polish + Demo Prep (Weeks 9–10)
- [ ] Seed demo catalog (mock retailer data + generated product images)
- [ ] Widget UI polish
- [ ] Dashboard UI polish
- [ ] Deployment stable on Vercel + Railway
- [ ] Demo script rehearsed

---

## 11. Key Design Decisions (Do Not Change Without Discussion)

1. **Widget never calls Body/Recommendation/VTON services directly** — always routes through Store Service. Reason: security (no internal URLs exposed), single validation point, rate limiting control.

2. **All measurements stored in metric (cm/kg) in DB** — unit conversion happens client-side in widget only, never at API level.

3. **`measurement_method_version` field on every session** — required for data integrity when we improve measurement instructions in future versions.

4. **pgvector over external vector DB (Pinecone etc.)** — keeps infra simple, reuses existing Postgres, sufficient scale for B2B2C catalog sizes.

5. **Shopper photos never stored** — VTON photo processed in memory, deleted from Replicate immediately. Output try-on image only stored if user explicitly saves it.

6. **3D preview is two separate layers, not one mesh** — SMPL body mesh (inner, always same) + parametric garment shape (outer, changes per garment category). These are rendered together in the widget but generated and stored separately. Never confuse this with cloth simulation — it is a fast geometric approximation, intentionally so.

7. **Parametric garment shapes are built from SMPL betas, not hardcoded** — the garment shell dimensions scale with the shopper's body shape output, so a size L body automatically gets a larger garment shell than a size S body. This keeps the 3D preview proportionally accurate per shopper.

8. **SMPL used under research license for ITI** — commercial license required before any real-money product launch post-graduation.

---

*Last updated: July 2026 | Manikan Team*

---

## 12. 3D Output — Visual Reference

```
What the widget renders in the 3D panel:

         [Garment Mesh — outer layer]
        /  e.g. blouse shell, pants legs  \
       /                                   \
      | ← fit_offset_cm gap from body →    |
       \   [SMPL Body Mesh — inner layer]  /
        \      shopper's body shape       /

For pants:          For blouse:          For skirt:
  ___                  ___                  ___
 |   |                |   |                |   |
 |   |  ← torso       |   |  ← torso       |   |
  | |   ← waist        | |   ← waist       \   /  ← flare
  | |                  | |                  \ /
 /| |\  ← legs        / \ ← sleeves         V
/ | | \

All garment shapes are geometric approximations — not cloth simulation.
Each shape scales automatically with the shopper's SMPL beta values.
```
