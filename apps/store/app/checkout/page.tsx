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
                                <a href="/account/addresses" className="text-sm text-gold-600 hover:underline mt-2">+ Add new address</a>
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
                            {items.map((item) => (
                                <div key={item.id} className="flex justify-between text-sm">
                                    <span className="text-white/70 truncate pr-4">{item.name} × {item.quantity} <span className="text-white/40">({item.sizeLabel})</span></span>
                                    <span className="text-white font-medium whitespace-nowrap">EGP {(item.priceEgp * item.quantity).toLocaleString()}</span>
                                </div>
                            ))}
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
                            disabled={loading || (addresses.length > 0 && !selectedAddress)}
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
