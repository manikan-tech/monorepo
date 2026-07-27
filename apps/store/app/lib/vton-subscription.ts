import { NextResponse } from "next/server";

import { getAuthFromCookies } from "./auth";
import { prisma } from "./prisma";

const SUBSCRIPTION_REQUIRED_RESPONSE = {
  error: "Subscription required. Upgrade to access VTON developer tools.",
};

/**
 * Authenticates the retailer and confirms their newest subscription is active.
 * The returned ID is always the database Retailer ID, never an untrusted value
 * from a route parameter or request body.
 */
export async function requireActiveVtonSubscription(): Promise<
  { retailerId: string } | NextResponse
> {
  const retailer = await getAuthFromCookies();
  if (!retailer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latestSubscription = await prisma.subscription.findFirst({
    where: { retailerId: retailer.sub },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });

  if (latestSubscription?.status !== "ACTIVE") {
    return NextResponse.json(SUBSCRIPTION_REQUIRED_RESPONSE, { status: 403 });
  }

  return { retailerId: retailer.sub };
}
