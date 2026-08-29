export const HOSTED_SERVICES = [
  "BODY_MODELING",
  "VTON_2D",
  "RECOMMENDATION",
] as const;

export type HostedService = (typeof HOSTED_SERVICES)[number];
export type HostedServiceAvailabilityState =
  | "AVAILABLE"
  | "QUOTA_EXHAUSTED"
  | "NOT_SUBSCRIBED";

export type HostedServiceAvailability = Record<
  HostedService,
  { state: HostedServiceAvailabilityState }
>;

export function isHostedServiceAvailable(
  availability: HostedServiceAvailability | undefined,
  service: HostedService,
): boolean {
  return availability?.[service]?.state === "AVAILABLE";
}
