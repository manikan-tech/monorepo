import { NextResponse } from "next/server";

import { prisma } from "../../../lib/prisma";
import { requireActiveVtonSubscription } from "../../../lib/vton-subscription";

function isResponse(
  value: { retailerId: string } | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

// Returns cache metadata only. Cached objects are not exposed through this
// developer-management endpoint.
export async function GET() {
  const access = await requireActiveVtonSubscription();
  if (isResponse(access)) return access;

  const cacheEntries = await prisma.vtonCacheEntry.findMany({
    where: { retailerId: access.retailerId },
    select: {
      id: true,
      cacheKey: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ cacheEntries });
}

// Invalidates only cache rows owned by the authenticated active retailer.
export async function DELETE() {
  const access = await requireActiveVtonSubscription();
  if (isResponse(access)) return access;

  const result = await prisma.vtonCacheEntry.deleteMany({
    where: { retailerId: access.retailerId },
  });

  return NextResponse.json({ invalidated: result.count });
}
