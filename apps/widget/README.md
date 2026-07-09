# Widget — Manikan 3D Body Avatar & Virtual Try-On

React 19 + Three.js frontend for the Manikan widget. Talks to
[`services-python/body-service`](../../services-python/body-service) to turn
body measurements into a 3D avatar (and optionally a garment try-on).

This is currently a **standalone dev app** (a demo harness), not yet the
embeddable script-tag bundle described in `MANIKAN_PROJECT.md` — that's a
later phase. Right now it's the fastest way to run and see the widget work
end-to-end against the body service.

## What's here

```
src/
├── components/
│   ├── ManikanWidget.jsx     ← the widget itself: multi-step try-on modal
│   ├── TryOnViewer.jsx       ← 3D viewer for dressed avatars (r3f/drei)
│   ├── AvatarViewer.jsx      ← 3D viewer for bare avatars (playground)
│   ├── ControlPanel.jsx      ← measurement sliders (playground sidebar)
│   └── MeasurementSlider.jsx
├── lib/api.js                ← body-service client (env-driven base URL)
├── data/products.js          ← STATIC product/size fixture (see below)
├── App.jsx                   ← dev demo shell: two tabs (see below)
└── main.jsx
```

The dev demo (`App.jsx`) has two tabs:
- **Try-On Widget** — pick a product from the static catalog, opens
  `ManikanWidget` exactly as a retailer product page would.
- **Body Playground** — bare avatar generation with live measurement
  sliders, no product/garment involved.

## Static data — will move to the database

`src/data/products.js` is a hardcoded product/size fixture. It's the
**only** module the UI talks to for product data (`App.jsx`,
`ManikanWidget.jsx`), so wiring this up to the Store's Prisma-backed API
later is a matter of changing `getProducts()`/`getProductById()` in that
one file — no component changes needed.

## Running locally

Requires [`body-service`](../../services-python/body-service) running
(see its README for SMPL model setup):

```bash
# terminal 1
cd services-python/body-service
source .venv/bin/activate
uvicorn app.main:app --reload --port 8001

# terminal 2
cd apps/widget
npm install   # if not already installed via the workspace root
npm run dev   # → http://localhost:3001
```

## Configuration

Copy `.env.example` to `.env` to override the body-service URL:

```
VITE_BODY_API_URL=http://localhost:8001
```
