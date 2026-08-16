import { randomBytes } from "crypto";

// The three independently-billed, independently-keyed services. A retailer
// may subscribe to one, some, or all three -- each has its own ServiceApiKey
// and Subscription row. Shared here so the service list/validation can't
// drift between the widget-key route, the dashboard panels, and scripts.
export const SERVICES = ["BODY_MODELING", "VTON_2D", "RECOMMENDATION"] as const;
export type Service = (typeof SERVICES)[number];

export function isService(value: string): value is Service {
  return (SERVICES as readonly string[]).includes(value);
}

// Public keys are recognizable (Stripe-style `pk_live_…`) so they can never
// be mistaken for a secret -- they're sent by the browser widget and are not
// confidential (security comes from the Origin allowlist pairing, not key
// secrecy). See app/lib/service-auth.ts for the separate, private,
// server-to-server keys the Python services verify.
export function generatePublicKey(): string {
  return `pk_live_${randomBytes(24).toString("hex")}`;
}
