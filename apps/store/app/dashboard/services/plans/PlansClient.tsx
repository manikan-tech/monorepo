"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
const Check = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
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
  BODY_MODELING: {
    label: "3D Body Modeling",
    description: "Synthesize 3D avatars based on shopper measurements.",
    icon: Box,
    color: "bg-purple-500",
  },
  VTON_2D: {
    label: "2D Virtual Try-On",
    description: "Generate AI overlays of garments on human photos.",
    icon: ImageIcon,
    color: "bg-blue-500",
  },
  RECOMMENDATION: {
    label: "Size Recommendations",
    description: "API calls for calculating the best fitting size.",
    icon: Activity,
    color: "bg-emerald-500",
  },
};

const PLAN_FEATURES: Record<string, string[]> = {
  Free: ["Community Support", "Standard Processing Speed", "Standard Analytics"],
  Starter: ["Email Support", "Priority Processing", "Advanced Analytics"],
  Pro: ["24/7 Priority Support", "Highest Priority Processing", "Custom Integrations", "Dedicated Account Manager"],
};

export default function PlansClient({ subscriptions }: { subscriptions: SubscriptionForService[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ServiceId>("BODY_MODELING");
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [error, setError] = useState<{ planId: string; message: string } | null>(null);

  const activeServiceData = subscriptions.find((s) => s.service === activeTab);
  if (!activeServiceData) return null;

  const currentPlanId = activeServiceData.subscription?.plan?.id;

  const handleCheckout = async (planId: string) => {
    setBusyPlanId(planId);
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
        window.location.href = data.url;
        return;
      }

      router.refresh();
    } catch (err) {
      setError({
        planId,
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setBusyPlanId(null);
    }
  };

  return (
    <div className="py-6 animate-fade-in">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-display font-semibold text-gray-900 mb-4">Choose Your AI Capabilities</h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Scale your e-commerce store with our powerful AI services. Choose the right plan for each service to match your business needs.
        </p>
      </div>

      <div className="flex justify-center mb-12">
        <div className="inline-flex bg-gray-100 p-1.5 rounded-xl">
          {(Object.keys(SCOPES) as ServiceId[]).map((service) => {
            const { label, icon: Icon } = SCOPES[service];
            const isActive = activeTab === service;
            return (
              <button
                key={service}
                onClick={() => setActiveTab(service)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {activeServiceData.plans.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          const isBusy = busyPlanId === plan.id;
          const isFree = plan.priceEgpMonthly === 0;
          
          // Match features based on plan name, fallback to Starter features
          const features = PLAN_FEATURES[plan.name] || PLAN_FEATURES["Starter"];

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-8 flex flex-col relative transition-all duration-200 ${
                isCurrent ? "border-2 border-blue-500 shadow-md transform -translate-y-1" : "border border-gray-200 shadow-sm hover:shadow-md"
              }`}
            >
              {isCurrent && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-blue-500 text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                    Current Plan
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-gray-900">
                    {isFree ? "Free" : `EGP ${plan.priceEgpMonthly.toLocaleString()}`}
                  </span>
                  {!isFree && <span className="text-gray-500 font-medium">/mo</span>}
                </div>
              </div>

              <div className="mb-8">
                <div className="bg-blue-50 text-blue-800 text-sm font-medium py-2 px-3 rounded-lg inline-block mb-6">
                  {plan.quota > 0 ? `${plan.quota.toLocaleString()} generations/mo` : "Unlimited generations"}
                </div>
                <ul className="space-y-4">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                      <Check className="w-5 h-5 text-blue-500 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto">
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={isBusy || isCurrent}
                  className={`w-full py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
                    isCurrent
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : isFree
                      ? "bg-gray-900 text-white hover:bg-gray-800"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isBusy ? "Processing..." : isCurrent ? "Active" : isFree ? "Get Started" : "Subscribe Now"}
                </button>
                {error?.planId === plan.id && (
                  <p className="text-xs text-red-600 text-center mt-3">{error.message}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
