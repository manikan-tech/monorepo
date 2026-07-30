import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../lib/prisma";
import { requireActiveVtonSubscription } from "../../../lib/vton-subscription";

const MAX_ALLOWED_ORIGINS = 5;

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function isResponse(
  value: { retailerId: string } | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export async function GET() {
  const access = await requireActiveVtonSubscription();
  if (isResponse(access)) return access;

  const origins = await prisma.originAllowlist.findMany({
    where: { retailerId: access.retailerId },
    select: { id: true, origin: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ origins });
}

export async function POST(request: NextRequest) {
  const access = await requireActiveVtonSubscription();
  if (isResponse(access)) return access;

  let body: { origin?: unknown; domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawOrigin = body.origin ?? body.domain;
  if (typeof rawOrigin !== "string") {
    return NextResponse.json(
      { error: "origin must be a string." },
      { status: 400 },
    );
  }

  const origin = normalizeOrigin(rawOrigin);
  if (!origin) {
    return NextResponse.json(
      {
        error:
          "origin must be an absolute HTTP or HTTPS origin without a path.",
      },
      { status: 400 },
    );
  }

  try {
    const entry = await prisma.$transaction(
      async (tx) => {
        const count = await tx.originAllowlist.count({
          where: { retailerId: access.retailerId },
        });
        if (count >= MAX_ALLOWED_ORIGINS) return null;

        return tx.originAllowlist.create({
          data: { retailerId: access.retailerId, origin },
          select: { id: true, origin: true, createdAt: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!entry) {
      return NextResponse.json(
        { error: "A maximum of 5 allowed origins is permitted." },
        { status: 400 },
      );
    }

    return NextResponse.json({ origin: entry }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Origin already exists." },
          { status: 409 },
        );
      }
      if (error.code === "P2034") {
        return NextResponse.json(
          { error: "Concurrent origin update. Please retry." },
          { status: 409 },
        );
      }
    }

    console.error("Failed to create VTON origin allowlist entry");
    return NextResponse.json(
      { error: "Unable to add origin." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireActiveVtonSubscription();
  if (isResponse(access)) return access;

  let body: { id?: unknown; origin?: unknown; domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let where: { retailerId: string; id?: string; origin?: string };
  if (typeof body.id === "string" && body.id.trim()) {
    where = { retailerId: access.retailerId, id: body.id.trim() };
  } else {
    const rawOrigin = body.origin ?? body.domain;
    if (typeof rawOrigin !== "string") {
      return NextResponse.json(
        { error: "Provide an origin ID or origin string." },
        { status: 400 },
      );
    }

    const origin = normalizeOrigin(rawOrigin);
    if (!origin) {
      return NextResponse.json({ error: "Invalid origin." }, { status: 400 });
    }
    where = { retailerId: access.retailerId, origin };
  }

  const result = await prisma.originAllowlist.deleteMany({ where });
  if (result.count === 0) {
    return NextResponse.json({ error: "Origin not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted: result.count });
}
