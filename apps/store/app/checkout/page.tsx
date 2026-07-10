"use client";

import { useEffect, useState } from "react";
import { useCart } from "../../components/CartContext";
import { useRouter } from "next/navigation";

type Address = { id: string; label: string; street: string; city: string; state: string; country: string; isDefault: boolean };

export default function CheckoutPage() {
    const { items, cartTotal, refreshCart } = useCart();
    const router = useRouter();

    const [addresses, setAddresses] = useState<Address[]>([]);
    const [selectedAddress, setSelectedAddress] = useState<string>("");
    const [paymentMethod, setPaymentMethod] = useState("CASH_ON_DELIVERY");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [addrLoading, setAddrLoading] = useState(true);

    const [showNewAddress, setShowNewAddress] = useState(false);
    const [newAddress, setNewAddress] = useState({ label: "Home", street: "", city: "", state: "", zipCode: "", isDefault: false });
    const [addingAddress, setAddingAddress] = useState(false);
    const [addressError, setAddressError] = useState("");

    useEffect(() => {
        fetch("/api/addresses")
            .then((r) => r.json())
            .then((data) => {
                const addrs: Address[] = data.addresses ?? [];
                setAddresses(addrs);
                const def = addrs.find((a) => a.isDefault);
                if (def) setSelectedAddress(def.id);
            })
            .catch(() => { })
            .finally(() => setAddrLoading(false));
    }, []);

    const handleAddAddress = async () => {
        setAddingAddress(true);
        setAddressError("");
        try {
            const res = await fetch("/api/addresses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newAddress),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to add address");
            setAddresses(prev => [data.address, ...prev]);
            setSelectedAddress(data.address.id);
            setShowNewAddress(false);
            setNewAddress({ label: "Home", street: "", city: "", state: "", zipCode: "", isDefault: false });
        } catch (err: any) {
            setAddressError(err.message);
        } finally {
            setAddingAddress(false);
        }
    };

    const handlePlaceOrder = async () => {
        setLoading(true);
        setError("");
        const res = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                addressId: selectedAddress || undefined,
                paymentMethod,
                notes: notes || undefined,
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            setError(data.error + (data.details ? `: ${Array.isArray(data.details) ? data.details.join(", ") : data.details}` : ""));
            setLoading(false);
            return;
        }
        await refreshCart();
        router.push(`/orders/${data.order.id}`);
    };

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <h1 className="font-display text-3xl font-semibold text-forest-950">Your cart is empty</h1>
                <button onClick={() => router.push("/store")} className="text-gold-600 hover:underline">Back to catalog</button>
            </div>
        );
    }

    return (
        <div className="max-w-[1100px] mx-auto px-6 py-12 md:py-20 w-full">
            <h1 className="font-display text-4xl font-semibold text-forest-950 mb-12 animate-fade-in-up">Checkout</h1>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Left: Shipping & Payment */}
                <div className="lg:col-span-7 flex flex-col gap-8">

                    {/* Delivery Address */}
                    <div className="bg-white rounded-3xl p-8 border border-forest-900/5 shadow-soft">
                        <h2 className="font-display text-xl font-semibold text-forest-950 mb-5">Delivery Address</h2>
                        {addrLoading ? (
                            <span className="inline-block w-5 h-5 border-[2px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
                        ) : addresses.length === 0 ? (
                            <div>
                                <p className="text-sm text-forest-700/70 mb-4">No saved addresses. <a href="/account/addresses" className="text-gold-600 hover:underline font-medium">Add one</a> to proceed.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {addresses.map((addr) => (
                                    <label key={addr.id} className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedAddress === addr.id ? "border-gold-400 bg-gold-50/60" : "border-forest-900/8 hover:border-forest-300"}`}>
                                        <input type="radio" name="address" value={addr.id} checked={selectedAddress === addr.id} onChange={() => setSelectedAddress(addr.id)} className="mt-1 accent-gold-500" />
                                        <div>
                                            <p className="font-semibold text-forest-950 text-sm">{addr.label} {addr.isDefault && <span className="text-xs text-gold-600 ml-1">Default</span>}</p>
                                            <p className="text-sm text-forest-700/70">{addr.street}, {addr.city}, {addr.state}, {addr.country}</p>
                                        </div>
                                    </label>
                                ))}
                                {!showNewAddress ? (
                                    <button onClick={() => setShowNewAddress(true)} className="text-sm font-medium text-gold-600 hover:underline mt-2 self-start">+ Add new address</button>
                                ) : (
                                    <div className="mt-4 p-5 rounded-2xl bg-forest-50 border border-forest-900/10 flex flex-col gap-4">
                                        <h3 className="font-semibold text-forest-950 text-sm">New Address Details</h3>
                                        {addressError && <p className="text-xs text-red-500">{addressError}</p>}
                                        <input type="text" placeholder="Address Label (e.g. Home, Work)" value={newAddress.label} onChange={e => setNewAddress({...newAddress, label: e.target.value})} className="px-3 py-2 rounded-xl text-sm border focus:outline-gold-400" />
                                        <input type="text" placeholder="Street Address" value={newAddress.street} onChange={e => setNewAddress({...newAddress, street: e.target.value})} className="px-3 py-2 rounded-xl text-sm border focus:outline-gold-400" />
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="text" placeholder="City" value={newAddress.city} onChange={e => setNewAddress({...newAddress, city: e.target.value})} className="px-3 py-2 rounded-xl text-sm border focus:outline-gold-400" />
                                            <input type="text" placeholder="State/Region" value={newAddress.state} onChange={e => setNewAddress({...newAddress, state: e.target.value})} className="px-3 py-2 rounded-xl text-sm border focus:outline-gold-400" />
                                        </div>
                                        <input type="text" placeholder="Zip Code (optional)" value={newAddress.zipCode} onChange={e => setNewAddress({...newAddress, zipCode: e.target.value})} className="px-3 py-2 rounded-xl text-sm border focus:outline-gold-400 w-1/2" />
                                        <label className="flex items-center gap-2 mt-1 cursor-pointer">
                                            <input type="checkbox" checked={newAddress.isDefault} onChange={e => setNewAddress({...newAddress, isDefault: e.target.checked})} className="accent-gold-500 rounded" />
                                            <span className="text-sm text-forest-700/80">Set as my default address</span>
                                        </label>
                                        <div className="flex justify-end gap-3 mt-2">
                                            <button onClick={() => setShowNewAddress(false)} className="text-xs font-medium text-forest-700/60 hover:text-forest-950">Cancel</button>
                                            <button onClick={handleAddAddress} disabled={addingAddress} className="px-4 py-2 bg-forest-900 text-white rounded-xl text-xs font-medium disabled:opacity-60">{addingAddress ? "Saving..." : "Save Address"}</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Payment Method */}
                    <div className="bg-white rounded-3xl p-8 border border-forest-900/5 shadow-soft">
                        <h2 className="font-display text-xl font-semibold text-forest-950 mb-5">Payment Method</h2>
                        <div className="flex flex-col gap-3">
                            {["CASH_ON_DELIVERY", "CREDIT_CARD"].map((method) => (
                                <label key={method} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === method ? "border-gold-400 bg-gold-50/60" : "border-forest-900/8 hover:border-forest-300"}`}>
                                    <input type="radio" name="payment" value={method} checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} className="accent-gold-500" />
                                    <span className="text-sm font-medium text-forest-950">{method === "CASH_ON_DELIVERY" ? "Cash on Delivery" : "Credit Card"}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="bg-white rounded-3xl p-8 border border-forest-900/5 shadow-soft">
                        <h2 className="font-display text-xl font-semibold text-forest-950 mb-5">Order Notes <span className="text-forest-400 text-sm font-normal">(optional)</span></h2>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any special instructions?"
                            rows={3}
                            className="w-full px-4 py-3 rounded-xl border border-forest-900/10 bg-forest-50 text-forest-900 text-sm focus:outline-none focus:border-gold-400 transition-colors resize-none"
                        />
                    </div>
                </div>

                {/* Right: Order Summary */}
                <div className="lg:col-span-5">
                    <div className="bg-forest-950 text-white rounded-3xl p-8 shadow-card sticky top-32">
                        <h2 className="font-display text-2xl font-semibold mb-6">Order Summary</h2>

                        <div className="flex flex-col gap-3 mb-6">
                            {items.map((item) => {
                                const discountedPrice = item.priceEgp * (1 - item.discountPct / 100);
                                return (
                                    <div key={item.id} className="flex flex-col text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-white/70 truncate pr-4">{item.name} × {item.quantity} <span className="text-white/40">({item.sizeLabel})</span></span>
                                            <span className="text-white font-medium whitespace-nowrap">EGP {(discountedPrice * item.quantity).toLocaleString()}</span>
                                        </div>
                                        {!item.isActive && (
                                            <span className="text-xs text-red-400 mt-1">This item is no longer available. Please remove it from your cart.</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="border-t border-white/10 pt-4 flex flex-col gap-3 text-sm mb-6">
                            <div className="flex justify-between"><span className="text-white/60">Subtotal</span><span>EGP {cartTotal.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-white/60">Shipping</span><span className="text-gold-400">EGP 50</span></div>
                        </div>

                        <div className="flex justify-between items-end mb-8 border-t border-white/10 pt-4">
                            <span className="text-white/80">Total</span>
                            <span className="font-display text-3xl font-semibold text-gold-500">EGP {(cartTotal + 50).toLocaleString()}</span>
                        </div>

                        {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-4 py-3 mb-4">{error}</p>}

                        <button
                            onClick={handlePlaceOrder}
                            disabled={loading || (addresses.length > 0 && !selectedAddress) || items.some(i => !i.isActive)}
                            className="relative overflow-hidden flex items-center justify-center gap-2 w-full bg-gold-500 text-forest-950 rounded-2xl py-4 font-semibold hover:bg-gold-400 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <div className="absolute inset-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
                            {loading ? <span className="inline-block w-5 h-5 border-[2px] border-forest-900/30 border-t-forest-900 rounded-full animate-spin relative z-10" /> : <span className="relative z-10">Place Order</span>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
