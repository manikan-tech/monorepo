import React from "react";
import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import WidgetSettingsForm from "./WidgetSettingsForm";

export default async function WidgetPage() {
  const user = await getAuthFromCookies();

  if (!user) {
    redirect("/login");
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.sub },
    select: { widgetSettings: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-up" style={{ animationDelay: "100ms" }}>
        <div>
          <h2 className="text-2xl font-display text-forest-900">Widget Customization</h2>
          <p className="text-manikan-text-secondary">Customize how the Manikan size recommendation widget appears on your store.</p>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <WidgetSettingsForm initialSettings={retailer?.widgetSettings || {}} />
      </div>
    </div>
  );
}
