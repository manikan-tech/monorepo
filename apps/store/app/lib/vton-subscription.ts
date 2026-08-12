import { NextResponse } from "next/server";

import { getAuthFromCookies } from "./auth";
import { prisma } from "./prisma";

const SUBSCRIPTION_REQUIRED_RESPONSE = {
  error: "Subscription required. Upgrade to access VTON developer tools.",
};

/**
 * Authenticates the retailer and confirms their newest VTON_2D subscription
 * specifically is active -- a subscription to BODY_MODELING or RECOMMENDATION
 * alone does not unlock VTON developer tools, since the three services are
 * independently subscribed to.
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
    where: { retailerId: retailer.sub, service: "VTON_2D" },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });

  if (latestSubscription?.status !== "ACTIVE") {
    return NextResponse.json(SUBSCRIPTION_REQUIRED_RESPONSE, { status: 403 });
  }

  return { retailerId: retailer.sub };
}
