"use client";

import React, { useState } from "react";

interface BotPlanCheckoutButtonProps {
  planId: string;
  priceInCents: number;
}

export default function BotPlanCheckoutButton({ planId, priceInCents }: BotPlanCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/bot-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login?redirect=/bot-plans";
          return;
        }
        throw new Error("Failed to start checkout");
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-2">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-3 px-4 bg-forest-900 text-white rounded-xl font-medium text-sm hover:bg-forest-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </>
        ) : (
          `Buy for EGP ${(priceInCents / 100).toFixed(2)}`
        )}
      </button>
      {error && <p className="text-red-500 text-xs text-center">{error}</p>}
    </div>
  );
}
