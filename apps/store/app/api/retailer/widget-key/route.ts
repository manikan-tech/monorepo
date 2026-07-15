import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

// ─── /api/retailer/widget-key ───────────────────────────────────────────
// Retailer-facing management of the PUBLIC widget key + widget credentials.
// The dashboard uses these to (a) show the retailer their embed key, (b) rotate
// it, and (c) manage which Origins are allowed to run their widget + toggle
// activation.
//
// Auth: retailer SESSION COOKIE (getAuthFromCookies) — this is the DASHBOARD
// side (a logged-in retailer managing their own account). It is NOT the widget
// gate: the public widget requests are authorised separately by
// app/lib/widget-auth.ts (X-Manikan-Key header + Origin allowlist).
//
// FRONTEND TEAM — this is your backend for the "Widget" settings page:
//   GET    /api/retailer/widget-key   → { apiKey, isActivated, allowedOrigins }
//   POST   /api/retailer/widget-key   → rotate key → { apiKey }   (no body)
//   PATCH  /api/retailer/widget-key   → { allowedOrigins?, isActivated? }
//                                        → { isActivated, allowedOrigins }
// All are retailer-scoped to the caller's own account; no ids in the path.

// `allowedOrigins` is stored INSIDE Retailer.widgetSettings (JSON) because that
// is exactly where the deployed widget auth gate reads it from. We therefore
// always MERGE into widgetSettings so we never clobber the UI team's
// colour/language keys.
// ─── ENTERPRISE NOTE (future): promote `allowedOrigins` to a dedicated
//     `Retailer.allowedOrigins String[]` column. A security-critical array
//     living inside a shared JSON blob is fragile — any non-merging write to
//     widgetSettings wipes it. See docs/enterprise-roadmap.md § Security. ───

interface WidgetSettings {
  allowedOrigins?: string[];
  [key: string]: unknown;
}

function readSettings(value: unknown): WidgetSettings {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as WidgetSettings)
    : {};
}

// Public keys are recognizable (Stripe-style `pk_live_…`) so they can never be
// mistaken for a secret. Keys minted/rotated here use this format; pre-existing
// cuid keys keep working until rotated.
// ─── ENTERPRISE NOTE (future): signup still mints a bare `cuid` default
//     (schema @default(cuid()), owned by the auth/UI team). Ideally signup is
//     switched to mint this same `pk_live_` format for consistency. ───
function generatePublicKey(): string {
  return `pk_live_${randomBytes(24).toString("hex")}`;
}

// Normalise an origin to `scheme://host[:port]` (lowercased host, no trailing
// slash) — same shape the widget auth gate compares against.
function normalizeOrigin(raw: string): string {
  const u = new URL(raw);
  const port = u.port ? `:${u.port}` : "";
  return `${u.protocol}//${u.hostname.toLowerCase()}${port}`;
}

// ─── GET: current key + activation + allowed origins (for display) ───
export async function GET() {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { apiKey: true, isActivated: true, widgetSettings: true },
  });
  if (!retailer) {
    return NextResponse.json({ error: "Retailer not found" }, { status: 404 });
  }

  const settings = readSettings(retailer.widgetSettings);
  return NextResponse.json({
    apiKey: retailer.apiKey,
    isActivated: retailer.isActivated,
    allowedOrigins: settings.allowedOrigins ?? [],
  });
}

// ─── POST: regenerate (rotate) the public key ───
// Rotating immediately invalidates the old key (apiKey is @unique), so any
// <script> tag still using the old key starts failing the widget gate. The
// dashboard should warn the retailer to update their embed snippet.
export async function POST() {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await prisma.retailer.update({
    where: { id: user.sub },
    data: { apiKey: generatePublicKey() },
    select: { apiKey: true },
  });

  return NextResponse.json({ apiKey: updated.apiKey });
}

// ─── PATCH: update widget credentials (allowedOrigins) + activation ───
export async function PATCH(request: NextRequest) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { allowedOrigins?: unknown; isActivated?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Prisma.RetailerUpdateInput = {};

  // ── isActivated toggle ──
  // MVP: the retailer flips their OWN activation so we can test the widget flow
  // end-to-end without an admin dashboard or a billing system.
  // ─── ENTERPRISE NOTE (future): this MUST become admin-only + paywall-gated.
  //     A retailer must not be able to self-activate a paid feature. See
  //     docs/enterprise-roadmap.md § Security. ───
  if (body.isActivated !== undefined) {
    if (typeof body.isActivated !== "boolean") {
      return NextResponse.json(
        { error: "isActivated must be a boolean" },
        { status: 400 }
      );
    }
    data.isActivated = body.isActivated;
  }

  // ── allowedOrigins (validated, then MERGED into widgetSettings) ──
  if (body.allowedOrigins !== undefined) {
    if (!Array.isArray(body.allowedOrigins)) {
      return NextResponse.json(
        { error: "allowedOrigins must be an array of origin strings" },
        { status: 400 }
      );
    }

    const normalized: string[] = [];
    for (const raw of body.allowedOrigins) {
      if (typeof raw !== "string") {
        return NextResponse.json(
          { error: "allowedOrigins must contain only strings" },
          { status: 400 }
        );
      }
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        normalized.push(normalizeOrigin(trimmed));
      } catch {
        return NextResponse.json(
          { error: `Invalid origin: "${raw}" (expected e.g. https://store.com)` },
          { status: 400 }
        );
      }
    }

    const current = await prisma.retailer.findUnique({
      where: { id: user.sub },
      select: { widgetSettings: true },
    });
    // MERGE — never overwrite the UI team's colour/language keys.
    const merged = { ...readSettings(current?.widgetSettings), allowedOrigins: normalized };
    data.widgetSettings = merged as Prisma.InputJsonValue;
  }

  if (data.isActivated === undefined && data.widgetSettings === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.retailer.update({
    where: { id: user.sub },
    data,
    select: { isActivated: true, widgetSettings: true },
  });

  const settings = readSettings(updated.widgetSettings);
  return NextResponse.json({
    isActivated: updated.isActivated,
    allowedOrigins: settings.allowedOrigins ?? [],
  });
}
