"use client";

import { useState } from "react";
import { SERVICES } from "../../../lib/service-keys";
import Modal from "../../../../components/Modal";

type Plan = {
  id: string;
  name: string;
  service: string;
  priceEgpMonthly: number;
  quota: number;
};

export default function PlansManager({ 
  initialPlans,
  adminRole,
}: { 
  initialPlans: Plan[];
  adminRole: string;
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<string | null>(null);
  
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newService, setNewService] = useState<string>(SERVICES[0]);
  const [newPrice, setNewPrice] = useState("");
  const [newQuota, setNewQuota] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQuota, setEditQuota] = useState("");

  const canEdit = adminRole === "SUPER_ADMIN";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    setLoadingId("new");
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          service: newService,
          priceEgpMonthly: parseFloat(newPrice),
          quota: parseInt(newQuota, 10),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create plan");

      setPlans([...plans, data.plan].sort((a, b) => {
        if (a.service !== b.service) return a.service.localeCompare(b.service);
        return a.priceEgpMonthly - b.priceEgpMonthly;
      }));
      
      setIsCreating(false);
      setNewName("");
      setNewPrice("");
      setNewQuota("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingId(null);
    }
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditName(plan.name);
    setEditPrice(plan.priceEgpMonthly.toString());
    setEditQuota(plan.quota.toString());
  }

  async function handleSaveEdit(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          priceEgpMonthly: parseFloat(editPrice),
          quota: parseInt(editQuota, 10),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update plan");

      setPlans(plans.map(p => p.id === id ? data.plan : p));
      setEditingId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingId(null);
    }
  }

  async function confirmDelete() {
    if (!confirmModal) return;
    const id = confirmModal;
    setConfirmModal(null);
    setLoadingId(id);
    try {
      const res = await fetch(`/api/admin/plans/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete plan");
      
      setPlans(plans.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-4 py-2 bg-forest-900 text-white rounded-lg text-sm font-medium hover:bg-forest-800 transition-colors shadow-sm"
          >
            {isCreating ? "Cancel" : "+ New Plan"}
          </button>
        </div>
      )}

      {isCreating && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-2xl shadow-card border border-manikan-border grid grid-cols-1 md:grid-cols-5 gap-4 animate-fade-up">
          <div>
            <label className="block text-xs font-semibold text-forest-700 uppercase tracking-wider mb-1">Service</label>
            <select
              value={newService}
              onChange={e => setNewService(e.target.value)}
              required
              className="w-full px-3 py-2 bg-cream-50/50 border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors"
            >
              {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-forest-700 uppercase tracking-wider mb-1">Plan Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              required
              placeholder="e.g. Starter"
              className="w-full px-3 py-2 bg-cream-50/50 border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-forest-700 uppercase tracking-wider mb-1">Price (EGP/mo)</label>
            <input
              type="number"
              step="0.01"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              required
              min="0"
              className="w-full px-3 py-2 bg-cream-50/50 border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-forest-700 uppercase tracking-wider mb-1">Monthly Quota</label>
            <input
              type="number"
              value={newQuota}
              onChange={e => setNewQuota(e.target.value)}
              required
              min="0"
              className="w-full px-3 py-2 bg-cream-50/50 border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loadingId === "new"}
              className="w-full px-4 py-2 bg-gold-500 text-white rounded-lg text-sm font-semibold hover:bg-gold-600 transition-colors disabled:opacity-50"
            >
              {loadingId === "new" ? "Creating..." : "Create Plan"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-forest-50/60 text-forest-700/70 text-xs font-bold uppercase tracking-widest border-b border-manikan-border">
              <th className="px-6 py-4">Service</th>
              <th className="px-6 py-4">Plan Name</th>
              <th className="px-6 py-4">Price (EGP/mo)</th>
              <th className="px-6 py-4">Quota</th>
              {canEdit && <th className="px-6 py-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-manikan-border/50">
            {plans.map((plan) => (
              <tr key={plan.id} className="hover:bg-cream-50/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-forest-50 text-forest-700 border-forest-200">
                    {plan.service}
                  </span>
                </td>
                <td className="px-6 py-4 font-medium text-forest-900">
                  {editingId === plan.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full px-2 py-1 border border-gold-300 rounded focus:outline-none text-sm"
                    />
                  ) : plan.name}
                </td>
                <td className="px-6 py-4 font-mono text-forest-900 text-sm">
                  {editingId === plan.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                      className="w-24 px-2 py-1 border border-gold-300 rounded focus:outline-none text-sm"
                    />
                  ) : `${plan.priceEgpMonthly.toFixed(2)}`}
                </td>
                <td className="px-6 py-4 font-mono text-forest-900 text-sm">
                  {editingId === plan.id ? (
                    <input
                      type="number"
                      value={editQuota}
                      onChange={e => setEditQuota(e.target.value)}
                      className="w-24 px-2 py-1 border border-gold-300 rounded focus:outline-none text-sm"
                    />
                  ) : plan.quota.toLocaleString()}
                </td>
                {canEdit && (
                  <td className="px-6 py-4 text-right">
                    {editingId === plan.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setEditingId(null)}
                          className="text-xs text-forest-400 hover:text-forest-600 font-medium"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleSaveEdit(plan.id)}
                          disabled={loadingId === plan.id}
                          className="text-xs bg-gold-500 text-white px-3 py-1 rounded font-medium hover:bg-gold-600 disabled:opacity-50"
                        >
                          {loadingId === plan.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <button 
                          onClick={() => startEdit(plan)}
                          disabled={loadingId === plan.id}
                          className="text-forest-600 hover:text-forest-800 transition-colors disabled:opacity-50"
                          title="Edit"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                          </svg>
                        </button>
                        <button 
                          onClick={() => setConfirmModal(plan.id)}
                          disabled={loadingId === plan.id}
                          className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-6 py-12 text-center text-forest-700/50">
                  No plans configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Delete Plan"
        footer={
          <>
            <button
              onClick={() => setConfirmModal(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-soft"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-forest-700/80 text-sm">
          Are you sure you want to delete this plan? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
