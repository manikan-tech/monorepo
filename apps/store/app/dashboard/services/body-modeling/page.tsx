import React from "react";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import WidgetSettingsForm from "./WidgetSettingsForm";
import ServiceKeyPanel from "../_components/ServiceKeyPanel";

export default async function BodyModelingPage() {
  const user = await getAuthFromCookies();

  if (!user) {
    redirect("/login");
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { widgetSettings: true, isActivated: true },
  });

  if (!retailer?.isActivated) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-up transition-all duration-500 hover:translate-x-1" style={{ animationDelay: "100ms" }}>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-400/90 animate-pulse">
            3D Body Modeling
          </p>
          <h2 className="text-3xl font-display font-semibold text-forest-950 leading-tight">
            API & <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">Widget Settings</span>
          </h2>
          <p className="text-forest-700/60 text-sm mt-1 max-w-2xl">Manage your API keys, allowed domains, and customize how the widget appears on your store.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
          <WidgetSettingsForm initialSettings={retailer?.widgetSettings || {}} />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "300ms" }}>
          <ServiceKeyPanel service="BODY_MODELING" scriptSrc="https://widget.manikan.tech/v1/embed.js" />
        </div>
      </div>
    </div>
  );
}
