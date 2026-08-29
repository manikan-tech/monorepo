import React from "react";
import { prisma } from "../../lib/prisma";
import BotPlanCheckoutButton from "../../../components/account/BotPlanCheckoutButton";
import Link from "next/link";

export default async function BotPlansPage(props: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const resolvedSearchParams = await props.searchParams;
  const plans = await prisma.botPlan.findMany({
    where: { isActive: true },
    orderBy: { priceInCents: "asc" },
  });

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12 md:py-20 w-full animate-fade-in-up">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-forest-950 mb-4">
          Telegram Bot Plans
        </h1>
        <p className="text-forest-700/80 text-lg">
          Purchase additional AI try-on credits for the Manikan Telegram Bot. Credits are permanently added to your account and never expire.
        </p>
      </div>

      {resolvedSearchParams.success === "true" && (
        <div className="max-w-2xl mx-auto mb-10 bg-green-50 border border-green-200 text-green-800 rounded-2xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 mt-0.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="font-semibold">Payment Successful!</h4>
            <p className="text-sm mt-1">Your credits have been added to your account. You can now use them in the Telegram bot.</p>
            <Link href="/account" className="text-sm font-medium underline mt-2 block">
              Back to Account
            </Link>
          </div>
        </div>
      )}

      {resolvedSearchParams.canceled === "true" && (
        <div className="max-w-2xl mx-auto mb-10 bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="font-semibold">Payment Canceled</h4>
            <p className="text-sm mt-1">Your payment was canceled and you have not been charged.</p>
          </div>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-xl font-medium text-forest-900">No plans available at the moment.</h3>
          <p className="text-forest-700 mt-2">Please check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div key={plan.id} className="bg-white rounded-3xl p-8 border border-forest-900/10 shadow-soft flex flex-col relative overflow-hidden group hover:border-gold-300 transition-colors">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor" className="text-forest-900">
                  <path d="M12 2L2 22h20L12 2zm0 4.5l6.5 13.5h-13L12 6.5z" />
                </svg>
              </div>

              <h3 className="font-display text-2xl font-semibold text-forest-950 mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-forest-950">EGP {(plan.priceInCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex-1">
                <ul className="space-y-4">
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-forest-700">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-forest-800 font-medium">{plan.credits} AI Generations</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-forest-700">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-forest-800">Never expires</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-forest-700">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-forest-800">Priority processing</span>
                  </li>
                </ul>
              </div>

              <BotPlanCheckoutButton planId={plan.id} priceInCents={plan.priceInCents} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
