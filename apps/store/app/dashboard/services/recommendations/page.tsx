import React from "react";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import RecommendationSettingsForm from "./RecommendationSettingsForm";
import ServiceKeyPanel from "../_components/ServiceKeyPanel";

export default async function RecommendationsPage() {
  const user = await getAuthFromCookies();

  if (!user) {
    redirect("/login");
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { recommendationSettings: true, isActivated: true },
  });

  if (!retailer?.isActivated) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-up transition-all duration-500 hover:translate-x-1" style={{ animationDelay: "100ms" }}>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-500/90 animate-pulse">
            Recommendation Engine
          </p>
          <h2 className="text-3xl font-display font-semibold text-forest-950 leading-tight">
            Size <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-emerald-700">Settings</span>
          </h2>
          <p className="text-forest-700/60 text-sm mt-1 max-w-2xl">Configure how the AI calculates the perfect fit for your shoppers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
          <RecommendationSettingsForm initialSettings={retailer?.recommendationSettings || {}} />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "300ms" }}>
          <ServiceKeyPanel service="RECOMMENDATION" scriptSrc="https://widget.manikan.tech/v1/recommend.js" />
        </div>
      </div>
    </div>
  );
}
