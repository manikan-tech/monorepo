"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";

type OrderItem = { id: string; quantity: number; unitPriceEgp: number; sizeLabel: string; product: { name: string; slug: string; imageUrl: string } };
type Order = { id: string; status: string; totalEgp: number; createdAt: string; items: OrderItem[] };

const STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
    CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
    PROCESSING: "bg-purple-50 text-purple-700 border-purple-200",
    SHIPPED: "bg-indigo-50 text-indigo-700 border-indigo-200",
    DELIVERED: "bg-green-50 text-green-700 border-green-200",
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Auth guard — redirect guests to login
    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) {
                router.push("/login");
            } else {
                fetch("/api/orders")
                    .then((r) => r.json())
                    .then((d) => setOrders(d.orders ?? []))
                    .catch(() => {})
                    .finally(() => setLoading(false));
            }
        });
    }, [router]);

    return (
        <div className="max-w-[900px] mx-auto px-6 py-12 md:py-20 w-full">
            <h1 className="font-display text-4xl font-semibold text-forest-950 mb-10 animate-fade-in-up">My Orders</h1>

            {loading ? (
                <div className="flex justify-center py-20">
                    <span className="inline-block w-8 h-8 border-[3px] border-forest-900/20 border-t-forest-900 rounded-full animate-spin" />
                </div>
            ) : orders.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center animate-fade-in-up">
                    <div className="w-20 h-20 bg-forest-50 rounded-full flex items-center justify-center text-forest-900/30">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 4 0M9 5h6m-3 7h3m-3 4h3M9 12h.01M9 16h.01" /></svg>
                    </div>
                    <h2 className="font-display text-2xl font-semibold text-forest-950">No orders yet</h2>
                    <p className="text-forest-700/70">Your order history will appear here.</p>
                    <Link href="/store" className="mt-2 bg-forest-900 text-white rounded-xl px-8 py-3 font-medium hover:bg-forest-800 transition-colors">Start Shopping</Link>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {orders.map((order, i) => (
                        <Link
                            key={order.id}
                            href={`/orders/${order.id}`}
                            className="group bg-white rounded-3xl p-6 border border-forest-900/5 shadow-soft hover:shadow-card transition-all duration-300 hover:-translate-y-1 animate-fade-in-up block"
                            style={{ animationDelay: `${i * 80}ms` }}
                        >
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <p className="text-xs text-forest-700/50 uppercase tracking-widest font-bold mb-1">Order #{order.id.slice(-8).toUpperCase()}</p>
                                    <p className="text-sm text-forest-700/70">{new Date(order.createdAt).toLocaleDateString("en-EG", { day: "numeric", month: "long", year: "numeric" })}</p>
                                </div>
                                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${STATUS_COLORS[order.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                                    {order.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                {order.items.slice(0, 3).map((item) => (
                                    <div key={item.id} className="text-sm text-forest-900 bg-forest-50 rounded-lg px-3 py-1.5">
                                        {item.product.name} × {item.quantity}
                                    </div>
                                ))}
                                {order.items.length > 3 && <span className="text-sm text-forest-700/50">+{order.items.length - 3} more</span>}
                            </div>
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-forest-900/5">
                                <span className="text-xl font-semibold text-forest-950">EGP {order.totalEgp.toLocaleString()}</span>
                                <span className="text-xs font-medium text-gold-600 group-hover:underline">View Details →</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
