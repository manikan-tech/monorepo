// ─── Docs navigation config — the ONLY thing that publishes a doc ─────────
//
// A markdown file existing under content/docs/ does NOT make it visible.
// It has to have an entry here. This is deliberate: it lets a doc be
// written, reviewed, and sit in this folder for as long as needed before
// anyone decides it's ready — nothing auto-discovers or auto-publishes it.
//
// To publish a reviewed doc:
//   1. Confirm the markdown file exists at content/docs/<slug>.md
//   2. Add one entry to the matching category's `docs` array below
//   3. That's it — sidebar, search, and the page route all pick it up
//      automatically from this one file.
//
// To remove a doc from the site without deleting its content: delete (or
// comment out) its entry here. The .md file can stay on disk, unpublished.
//
// `slug` is the file path under content/docs/, without the .md extension,
// and is also the URL: content/docs/garments/tee.md -> /docs/garments/tee.

export type NavDoc = {
  /** Sidebar label and page <title> fallback. */
  title: string;
  /** File path under content/docs/, no extension. Also the URL segment(s) after /docs/. */
  slug: string;
  /** Sort order within its category, ascending. */
  order: number;
  /** Optional short line shown under the title in search results. */
  description?: string;
};

export type NavCategory = {
  title: string;
  /** Sort order among categories, ascending. */
  order: number;
  docs: NavDoc[];
};

export const nav: NavCategory[] = [
  {
    title: "Architecture",
    order: 1,
    docs: [
      {
        title: "Main Store Service",
        slug: "architecture/main-store",
        order: 1,
        description: "The proxy every widget and microservice call goes through: public vs. private key trust zones, real request lifecycles, and a currently-open auth gap.",
      },
    ],
  },
  {
    title: "Garments",
    order: 2,
    docs: [
      {
        title: "T-Shirt",
        slug: "garments/tshirt",
        order: 1,
        description: "Kinematic + physics-baked drape pipeline: architecture, iteration history, retailer guide, benchmarks, cost model.",
      },
      // Placeholder unpublished now that real content is live — file kept
      // on disk at content/docs/garments/tshirt-placeholder.md, unlisted.
      {
        title: "Pants",
        slug: "garments/pants",
        order: 2,
        description: "Active investigation, not production-proven — bake-grid holes, crotch-bridge droop, and the full recipe-search history.",
      },
      {
        title: "Combined Outfits",
        slug: "garments/combined-outfits",
        order: 3,
        description: "Tee + pants worn together: real measured clipping, the ragged-hem fix, and what's shipped vs. still not wired into the app.",
      },
    ],
  },
  {
    title: "Services",
    order: 3,
    docs: [
      {
        title: "2D Virtual Try-On",
        slug: "services/vton",
        order: 1,
        description: "FASHN.ai-backed photo-to-photo try-on: architecture, live-verified security posture, demo catalogue, and cost model.",
      },
      {
        title: "3D Body Modeling & Try-On",
        slug: "services/body-modeling",
        order: 2,
        description: "The SMPL shape-optimisation engine: retailer key + embed flow, the Store's proxy role, live-run renders across real bodies, and two bugs found and fixed this session.",
      },
      {
        title: "Recommendation Service",
        slug: "services/recommendation-service",
        order: 3,
        description: "DeepSeek semantic classification, LangGraph 5-node workflow, TF-IDF + pgvector RAG, deterministic sizing, ActiveSearch state arbitration, and internal gateway auth.",
      },
    ],
  },
  {
    title: "API Reference",
    order: 4,
    docs: [
      {
        title: "API Contracts",
        slug: "reference/api-contracts",
        order: 1,
        description: "Every route across the Store proxy, retailer dashboard, and the three internal services — request/response shapes, real and verified.",
      },
    ],
  },
  {
    title: "Admin",
    order: 5,
    docs: [
      {
        title: "Admin Dashboard",
        slug: "admin/dashboard",
        order: 1,
        description: "The internal control plane: real auth flow, the real route surface, what RBAC actually covers today, and what didn't check out from the original write-up.",
      },
    ],
  },
];
