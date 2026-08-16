import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { generatePublicKey, isService, Service } from "../../../../lib/service-keys";

// ─── /api/retailer/widget-key/[service] ─────────────────────────────────
// Retailer-facing management of ONE service's PUBLIC widget key + widget
// credentials. Each of BODY_MODELING, VTON_2D, and RECOMMENDATION has its own
// independent key and subscription -- a retailer may use just one, some, or
// all three, and a key minted for one service can never authorize another
// (enforced in app/lib/widget-auth.ts).
//
// Auth: retailer SESSION COOKIE (getAuthFromCookies) — this is the DASHBOARD
// side (a logged-in retailer managing their own account). It is NOT the widget
// gate: the public widget requests are authorised separately by
// app/lib/widget-auth.ts (X-Manikan-Key header + Origin allowlist).
//
//   GET    /api/retailer/widget-key/:service   → { apiKey, isActivated, allowedOrigins, subscription }
//   POST   /api/retailer/widget-key/:service   → rotate key → { apiKey }   (no body)
//   PATCH  /api/retailer/widget-key/:service   → { allowedOrigins?, isActivated? }
//                                                 → { isActivated, allowedOrigins }
// All are retailer-scoped to the caller's own account; no ids in the path.
//
// `allowedOrigins` is shared account-wide (stored inside Retailer.widgetSettings)
// rather than per-service: it's the same storefront domain regardless of which
// services that retailer has subscribed to. Editing it from any service's panel
// updates the same underlying list. We always MERGE into widgetSettings so we
// never clobber the UI team's colour/language keys.

interface WidgetSettings {
  allowedOrigins?: string[];
  [key: string]: unknown;
}

function readSettings(value: unknown): WidgetSettings {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as WidgetSettings)
    : {};
}

function normalizeOrigin(raw: string): string {
  const u = new URL(raw);
  const port = u.port ? `:${u.port}` : "";
  return `${u.protocol}//${u.hostname.toLowerCase()}${port}`;
}

async function resolveService(
  params: Promise<{ service: string }>
): Promise<{ ok: true; service: Service } | { ok: false; response: NextResponse }> {
  const { service } = await params;
  if (!isService(service)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unknown service" }, { status: 404 }),
    };
  }
  return { ok: true, service };
}

// ─── GET: current key + activation + allowed origins + subscription status ───
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveService(params);
  if (!resolved.ok) return resolved.response;
  const { service } = resolved;

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { isActivated: true, widgetSettings: true },
  });
  if (!retailer) {
    return NextResponse.json({ error: "Retailer not found" }, { status: 404 });
  }

  // Lazily provision this service's key on first access -- no separate
  // signup-time step needed, and it's idempotent for retailers who already
  // have one.
  const serviceKey = await prisma.serviceApiKey.upsert({
    where: { retailerId_service: { retailerId: user.sub, service } },
    update: {},
    create: { retailerId: user.sub, service, apiKey: generatePublicKey() },
  });

  const subscription = await prisma.subscription.findFirst({
    where: { retailerId: user.sub, service, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  const settings = readSettings(retailer.widgetSettings);
  return NextResponse.json({
    service,
    apiKey: serviceKey.apiKey,
    isActivated: retailer.isActivated,
    allowedOrigins: settings.allowedOrigins ?? [],
    subscription: subscription && subscription.plan
      ? {
          planName: subscription.plan.name,
          quota: subscription.plan.quota,
          usage: subscription.currentPeriodUsage,
        }
      : null,
  });
}

// ─── POST: regenerate (rotate) this service's public key ───
// Rotating immediately invalidates the old key (apiKey is @unique), so any
// <script> tag still using the old key starts failing the widget gate. The
// dashboard should warn the retailer to update their embed snippet.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveService(params);
  if (!resolved.ok) return resolved.response;
  const { service } = resolved;

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { isActivated: true },
  });

  if (!retailer || !retailer.isActivated) {
    return NextResponse.json({ error: "Forbidden: Account is pending activation." }, { status: 403 });
  }

  const updated = await prisma.serviceApiKey.upsert({
    where: { retailerId_service: { retailerId: user.sub, service } },
    update: { apiKey: generatePublicKey() },
    create: { retailerId: user.sub, service, apiKey: generatePublicKey() },
  });

  return NextResponse.json({ apiKey: updated.apiKey });
}

// ─── PATCH: update widget credentials (allowedOrigins) + activation ───
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveService(params);
  if (!resolved.ok) return resolved.response;

  let body: { allowedOrigins?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const current = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { isActivated: true, widgetSettings: true },
  });

  if (!current || !current.isActivated) {
    return NextResponse.json({ error: "Forbidden: Account is pending activation." }, { status: 403 });
  }

  const data: Prisma.RetailerUpdateInput = {};

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

    const merged = { ...readSettings(current.widgetSettings), allowedOrigins: normalized };
    data.widgetSettings = merged as Prisma.InputJsonValue;
  }

  if (data.widgetSettings === undefined) {
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
