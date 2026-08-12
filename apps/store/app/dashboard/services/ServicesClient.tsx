"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Inline SVGs to replace lucide-react
const Zap = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const Activity = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const ImageIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);
const Box = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

type ServiceId = "VTON_2D" | "BODY_MODELING" | "RECOMMENDATION";

type Plan = { id: string; name: string; priceEgpMonthly: number; quota: number };

type SubscriptionForService = {
  service: ServiceId;
  subscription: {
    plan: Plan | null;
    currentPeriodUsage: number;
  } | null;
  plans: Plan[];
};

const SCOPES: Record<ServiceId, { label: string; description: string; icon: typeof Zap; color: string }> = {
  VTON_2D: {
    label: "2D Virtual Try-On",
    description: "Generate AI overlays of garments on human photos.",
    icon: ImageIcon,
    color: "bg-blue-500",
  },
  BODY_MODELING: {
    label: "3D Body Modeling",
    description: "Synthesize 3D avatars based on shopper measurements.",
    icon: Box,
    color: "bg-purple-500",
  },
  RECOMMENDATION: {
    label: "Size Recommendations",
    description: "API calls for calculating the best fitting size.",
    icon: Activity,
    color: "bg-emerald-500",
  },
};

// Each service is subscribed to, billed, and quota-tracked independently --
// a retailer may have an active plan on some services and none on others, so
// each card below manages its own plan choice and checkout call rather than
// sharing one account-wide plan/quota.
export default function ServicesClient({
  subscriptions,
}: {
  subscriptions: SubscriptionForService[];
}) {
  const router = useRouter();
  const [busyService, setBusyService] = useState<ServiceId | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Record<ServiceId, string>>(() => {
    const initial = {} as Record<ServiceId, string>;
    for (const { service, subscription, plans } of subscriptions) {
      initial[service] = subscription?.plan?.id ?? plans[0]?.id ?? "";
    }
    return initial;
  });
  const [error, setError] = useState<{ service: ServiceId; message: string } | null>(null);

  const handleCheckout = async (service: ServiceId) => {
    const planId = selectedPlan[service];
    if (!planId) return;

    setBusyService(service);
    setError(null);
    try {
      const res = await fetch("/api/retailer/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      if (data.url) {
        // Paid plan: Stripe redirects back to /dashboard/services when done.
        window.location.href = data.url;
        return;
      }

      // Free plan: activated immediately, nothing to redirect to.
      router.refresh();
    } catch (err) {
      setError({
        service,
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setBusyService(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {subscriptions.map(({ service, subscription, plans }) => {
        const { label, description, icon: Icon, color } = SCOPES[service];
        const plan = subscription?.plan ?? null;
        const used = subscription?.currentPeriodUsage ?? 0;
        const limit = plan?.quota ?? 0;
        const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
        const isWarning = percentage >= 80;
        const isDanger = percentage >= 100;
        const isBusy = busyService === service;
        const hasOtherTiers = plans.length > 1;
        const chosenPlanIsCurrent = selectedPlan[service] === plan?.id;

        return (
          <div
            key={service}
            className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-xl bg-gray-50 text-gray-700">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 leading-tight">{label}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{description}</p>
              </div>
            </div>

            {plan ? (
              <>
                <div className="mb-4">
                  <p className="text-sm text-gray-900">
                    <span className="font-semibold">{plan.name}</span>
                    <span className="text-gray-500">
                      {" "}
                      &middot; {plan.priceEgpMonthly > 0 ? `${plan.priceEgpMonthly} EGP / month` : "Free Tier"}
                    </span>
                  </p>
                </div>

                <div className="mb-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">
                      {used.toLocaleString()} <span className="text-gray-400 font-normal">used</span>
                    </span>
                    <span className="text-gray-900 font-medium">
                      {limit > 0 ? limit.toLocaleString() : "∞"}
                    </span>
                  </div>

                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        isDanger ? "bg-red-500" : isWarning ? "bg-yellow-500" : color
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {isDanger && (
                    <p className="text-xs text-red-600 font-medium text-center">
                      Quota exceeded. Please upgrade.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-sm mb-4">Not subscribed to this service yet.</p>
            )}

            <div className="mt-auto pt-2 space-y-3">
              {hasOtherTiers && (
                <select
                  value={selectedPlan[service] ?? ""}
                  onChange={(e) =>
                    setSelectedPlan((prev) => ({ ...prev, [service]: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.priceEgpMonthly > 0 ? `${p.priceEgpMonthly} EGP/mo` : "Free"}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={() => handleCheckout(service)}
                disabled={isBusy || (chosenPlanIsCurrent && !!plan)}
                className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
                  plan
                    ? "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                {!plan && <Zap className="w-4 h-4" />}
                {isBusy
                  ? "Loading..."
                  : plan
                    ? chosenPlanIsCurrent
                      ? "Current plan"
                      : "Change plan"
                    : "Subscribe"}
              </button>

              {error?.service === service && (
                <p className="text-xs text-red-600 text-center">{error.message}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
