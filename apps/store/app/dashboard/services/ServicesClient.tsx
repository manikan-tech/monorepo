"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

type SubscriptionType = {
  plan: {
    name: string;
    priceEgpMonthly: number;
    quotas: any;
  } | null;
  currentPeriodUsage: any;
} | null;

const SCOPES = [
  {
    id: "VTON_2D",
    label: "2D Virtual Try-On",
    description: "Generate AI overlays of garments on human photos.",
    icon: ImageIcon,
    color: "bg-blue-500",
  },
  {
    id: "BODY_MODELING",
    label: "3D Body Modeling",
    description: "Synthesize 3D avatars based on shopper measurements.",
    icon: Box,
    color: "bg-purple-500",
  },
  {
    id: "RECOMMENDATION",
    label: "Size Recommendations",
    description: "API calls for calculating the best fitting size.",
    icon: Activity,
    color: "bg-emerald-500",
  },
];

export default function ServicesClient({
  subscription,
}: {
  subscription: SubscriptionType;
}) {
  const router = useRouter();
  const [isUpgrading, setIsUpgrading] = useState(false);

  const plan = subscription?.plan;
  const quotas = (plan?.quotas as Record<string, number>) || {};
  const usage = (subscription?.currentPeriodUsage as Record<string, number>) || {};

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    // Real implementation would call a server action or API route to create a Stripe checkout session
    // For now, we simulate and route to billing (if it exists) or just show a loading state
    setTimeout(() => {
      setIsUpgrading(false);
      alert("Redirecting to Stripe checkout... (Not yet implemented)");
    }, 1000);
  };

  if (!plan) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
        <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-medium text-gray-900 mb-2">No Active Plan</h3>
        <p className="text-gray-500 mb-6">
          You need an active subscription to use the AI services.
        </p>
        <button
          onClick={handleUpgrade}
          className="bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          View Plans
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">
            Current Plan: <span className="font-bold">{plan.name}</span>
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {plan.priceEgpMonthly > 0
              ? `${plan.priceEgpMonthly} EGP / month`
              : "Free Tier"}
          </p>
        </div>
        <button
          onClick={handleUpgrade}
          disabled={isUpgrading}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-70"
        >
          <Zap className="w-4 h-4" />
          {isUpgrading ? "Loading..." : "Upgrade Plan"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SCOPES.map((scope) => {
          const limit = quotas[scope.id] || 0;
          const used = usage[scope.id] || 0;
          const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
          const isWarning = percentage >= 80;
          const isDanger = percentage >= 100;

          const Icon = scope.icon;

          return (
            <div
              key={scope.id}
              className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-2.5 rounded-xl bg-gray-50 text-gray-700`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 leading-tight">
                    {scope.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {scope.description}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-4 space-y-3">
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
                      isDanger
                        ? "bg-red-500"
                        : isWarning
                        ? "bg-yellow-500"
                        : scope.color
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
