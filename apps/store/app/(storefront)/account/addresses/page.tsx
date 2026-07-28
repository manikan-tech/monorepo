"use client";

import { useEffect, useState } from "react";

type Address = { id: string; label: string; street: string; city: string; state: string; zipCode?: string; country: string; isDefault: boolean };

const emptyForm = { label: "Home", street: "", city: "", state: "", zipCode: "", country: "Egypt", isDefault: false };

export default function AddressesPage() {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const refresh = () => {
        setLoading(true);
        fetch("/api/addresses")
            .then((r) => r.json())
            .then((d) => setAddresses(d.addresses ?? []))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => { refresh(); }, []);

    const handleAdd = async () => {
        if (!form.street || !form.city || !form.state) {
            setError("Street, City, and State are required.");
            return;
        }
        setSubmitting(true);
        setError("");
        const res = await fetch("/api/addresses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
            setError(data.error ?? "Failed to add address");
        } else {
            setShowForm(false);
            setForm(emptyForm);
            refresh();
        }
        setSubmitting(false);
    };

    const handleDelete = async (id: string) => {
        await fetch(`/api/addresses/${id}`, { method: "DELETE" });
        setAddresses((prev) => prev.filter((a) => a.id !== id));
    };

    return (
        <div className="max-w-[700px] mx-auto px-6 py-12 md:py-20 w-full">
            <div className="flex items-center justify-between mb-10">
                <h1 className="font-display text-4xl font-semibold text-forest-950">Addresses</h1>
                <button
                    onClick={() => setShowForm((v) => !v)}
                    className="flex items-center gap-2 bg-forest-900 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-forest-800 transition-all"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                    Add Address
                </button>
            </div>

            {/* Add Form */}
            {showForm && (
                <div className="bg-white rounded-3xl p-8 border border-forest-900/5 shadow-soft mb-8 animate-fade-in-up">
                    <h2 className="font-display text-xl font-semibold text-forest-950 mb-6">New Address</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-widest text-forest-700/60 block mb-1.5">Label</label>
                            <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-forest-50 text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-widest text-forest-700/60 block mb-1.5">Street *</label>
                            <input value={form.street} onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-forest-50 text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-widest text-forest-700/60 block mb-1.5">City *</label>
                            <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-forest-50 text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-widest text-forest-700/60 block mb-1.5">State *</label>
                            <input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-forest-50 text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-widest text-forest-700/60 block mb-1.5">Zip Code</label>
                            <input value={form.zipCode} onChange={(e) => setForm((p) => ({ ...p, zipCode: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-forest-50 text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-widest text-forest-700/60 block mb-1.5">Country</label>
                            <input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-forest-50 text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors" />
                        </div>
                        <div className="col-span-2 flex items-center gap-3">
                            <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} className="accent-gold-500 w-4 h-4" />
                            <label htmlFor="isDefault" className="text-sm font-medium text-forest-900">Set as default address</label>
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
                    <div className="flex gap-3 mt-6">
                        <button onClick={handleAdd} disabled={submitting} className="flex-1 bg-forest-900 text-white rounded-xl py-3 font-medium text-sm hover:bg-forest-800 transition-colors disabled:opacity-60">
                            {submitting ? "Saving..." : "Save Address"}
                        </button>
                        <button onClick={() => { setShowForm(false); setError(""); }} className="px-5 rounded-xl border border-forest-200 text-forest-700 text-sm font-medium hover:bg-forest-50 transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Address List */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <span className="inline-block w-8 h-8 border-[3px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
                </div>
            ) : addresses.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="w-16 h-16 bg-forest-50 rounded-full flex items-center justify-center text-forest-900/30">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                    </div>
                    <p className="text-forest-700/70 text-sm">No saved addresses yet.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {addresses.map((addr, i) => (
                        <div key={addr.id} className="flex items-start justify-between gap-4 bg-white rounded-2xl p-6 border border-forest-900/5 shadow-soft animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="font-semibold text-forest-950">{addr.label}</p>
                                    {addr.isDefault && <span className="text-xs font-semibold text-gold-600 bg-gold-50 px-2 py-0.5 rounded-full">Default</span>}
                                </div>
                                <p className="text-sm text-forest-700/70">{addr.street}, {addr.city}, {addr.state}</p>
                                {addr.zipCode && <p className="text-sm text-forest-700/50">{addr.zipCode}</p>}
                                <p className="text-sm text-forest-700/50">{addr.country}</p>
                            </div>
                            <button onClick={() => handleDelete(addr.id)} className="text-sm text-forest-700/50 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
