"use client";

import { useState } from "react";
import Modal from "../../../../../components/Modal";
import { SERVICES } from "../../../../lib/service-keys";

type ServiceData = {
  service: string;
  subscription: {
    id: string;
    status: string;
    planName: string;
    usage: number;
    quota: number;
  } | null;
  apiKey: {
    id: string;
    key: string;
    isActive: boolean;
  } | null;
};

type Props = {
  retailerId: string;
  services: ServiceData[];
  initialOrigins: string[];
  allPlans: Record<string, { id: string; name: string }[]>;
};

const SERVICE_LABELS: Record<(typeof SERVICES)[number], string> = {
  BODY_MODELING: "Body Modeling",
  VTON_2D: "2D Try-On",
  RECOMMENDATION: "Recommendations",
};

export default function RetailerServicesManagement({
  retailerId,
  services: initialServices,
  initialOrigins,
  allPlans,
}: Props) {
  const [servicesData, setServicesData] = useState(initialServices);
  const [origins, setOrigins] = useState<string[]>(initialOrigins);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<string | null>(null);

  const toggleSubscription = async (service: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "CANCELLED" : "ACTIVE";
    setLoadingAction(`sub-${service}`);
    try {
      const res = await fetch(`/api/admin/retailers/${retailerId}/subscriptions/${service}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update subscription");
      
      setServicesData((prev) =>
        prev.map((s) =>
          s.service === service && s.subscription
            ? { ...s, subscription: { ...s.subscription, status: newStatus } }
            : s
        )
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const changePlan = async (service: string, planId: string) => {
    setLoadingAction(`sub-${service}`);
    try {
      const res = await fetch(`/api/admin/retailers/${retailerId}/subscriptions/${service}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error("Failed to assign plan");
      
      const newPlan = allPlans[service]?.find(p => p.id === planId);
      if (!newPlan) return;

      setServicesData((prev) =>
        prev.map((s) =>
          s.service === service
            ? { ...s, subscription: s.subscription ? { ...s.subscription, planName: newPlan.name } : { id: 'new', status: 'ACTIVE', planName: newPlan.name, usage: 0, quota: 0 } }
            : s
        )
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleApiKey = async (service: string, currentActive: boolean) => {
    setLoadingAction(`key-${service}`);
    try {
      const res = await fetch(`/api/admin/retailers/${retailerId}/keys/${service}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!res.ok) throw new Error("Failed to update API Key");
      
      setServicesData((prev) =>
        prev.map((s) =>
          s.service === service && s.apiKey
            ? { ...s, apiKey: { ...s.apiKey, isActive: !currentActive } }
            : s
        )
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const confirmRemoveOrigin = async () => {
    if (!confirmModal) return;
    const origin = confirmModal;
    setConfirmModal(null);
    setLoadingAction(`origin-${origin}`);
    try {
      const res = await fetch(`/api/admin/retailers/${retailerId}/origins`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin }),
      });
      if (!res.ok) throw new Error("Failed to remove origin");
      setOrigins((prev) => prev.filter((o) => o !== origin));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-up" style={{ animationDelay: "300ms" }}>
      {/* Services & API Keys */}
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-8">
        <h2 className="text-lg font-display font-semibold text-forest-900 mb-6">Services & API Keys</h2>
        <div className="space-y-6">
          {servicesData.map((svc) => (
            <div key={svc.service} className="border border-manikan-border rounded-xl p-5 bg-forest-50/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-forest-900">{SERVICE_LABELS[svc.service as keyof typeof SERVICE_LABELS]}</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Subscription Details */}
                <div className="bg-white p-4 rounded-lg border border-manikan-border/50">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-semibold text-forest-700/60 uppercase tracking-wider">Subscription</p>
                    <select 
                      className="text-xs border border-manikan-border rounded p-1 max-w-[120px]"
                      value=""
                      onChange={(e) => changePlan(svc.service, e.target.value)}
                      disabled={loadingAction === `sub-${svc.service}`}
                    >
                      <option value="" disabled>Assign Plan...</option>
                      {allPlans[svc.service]?.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {svc.subscription ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Plan:</span>
                        <span className="text-sm text-forest-800 bg-gold-50 px-2 py-0.5 rounded border border-gold-200">{svc.subscription.planName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Usage:</span>
                        <span className="text-sm text-forest-800">{svc.subscription.usage} / {svc.subscription.quota}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-manikan-border/50">
                        <span className="text-sm font-medium">Status:</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-semibold ${svc.subscription.status === 'ACTIVE' ? 'text-green-600' : 'text-red-500'}`}>
                            {svc.subscription.status}
                          </span>
                          <button
                            onClick={() => toggleSubscription(svc.service, svc.subscription!.status)}
                            disabled={loadingAction === `sub-${svc.service}`}
                            className="text-xs bg-forest-100 hover:bg-forest-200 text-forest-800 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            Toggle
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-forest-700/60 italic mt-3">No subscription</p>
                  )}
                </div>

                {/* API Key Details */}
                <div className="bg-white p-4 rounded-lg border border-manikan-border/50">
                  <p className="text-xs font-semibold text-forest-700/60 uppercase tracking-wider mb-2">API Key</p>
                  {svc.apiKey ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Key:</span>
                        <code className="text-xs bg-forest-50 px-2 py-1 rounded text-forest-800 border border-forest-100 break-all ml-4">
                          {svc.apiKey.key}
                        </code>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-manikan-border/50">
                        <span className="text-sm font-medium">Status:</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-semibold ${svc.apiKey.isActive ? 'text-green-600' : 'text-red-500'}`}>
                            {svc.apiKey.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                          <button
                            onClick={() => toggleApiKey(svc.service, svc.apiKey!.isActive)}
                            disabled={loadingAction === `key-${svc.service}`}
                            className="text-xs bg-forest-100 hover:bg-forest-200 text-forest-800 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            Toggle
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-forest-700/60 italic">No API Key generated</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Allowed Origins */}
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-8">
        <h2 className="text-lg font-display font-semibold text-forest-900 mb-6">Allowed Origins</h2>
        {origins.length === 0 ? (
          <p className="text-sm text-forest-700/60 italic">No allowed origins found for this retailer.</p>
        ) : (
          <ul className="space-y-2">
            {origins.map((origin) => (
              <li key={origin} className="flex items-center justify-between p-3 border border-manikan-border rounded-lg bg-forest-50/10">
                <span className="text-sm text-forest-800 font-medium">{origin}</span>
                <button
                  onClick={() => setConfirmModal(origin)}
                  disabled={loadingAction === `origin-${origin}`}
                  className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Remove Origin"
        footer={
          <>
            <button
              onClick={() => setConfirmModal(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmRemoveOrigin}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-soft"
            >
              Remove
            </button>
          </>
        }
      >
        <p className="text-forest-700/80 text-sm">
          Are you sure you want to remove <span className="font-semibold text-forest-900">{confirmModal}</span>? API requests from this origin will be rejected.
        </p>
      </Modal>
    </div>
  );
}
