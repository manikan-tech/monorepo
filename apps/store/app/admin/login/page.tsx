"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (data.success) {
          router.push("/admin");
          router.refresh();
        } else {
          setError(data.error ?? "Invalid credentials");
          setPassword("");
        }
      } catch {
        setError("Network error — please try again");
      }
    });
  }

  return (
    <div className="min-h-screen bg-forest-950 flex items-center justify-center p-4">
      <div
        className="pointer-events-none fixed -top-24 -left-24 w-96 h-96 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(200,150,102,0.12) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none fixed bottom-0 right-0 w-80 h-80 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(45,84,94,0.25) 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-md animate-fade-in-up">
        {/* Card */}
        <div
          className="rounded-3xl p-8 border"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderColor: "rgba(200,150,102,0.2)",
          }}
        >
          <div className="flex flex-col items-center mb-10">
            <div className="group">
              <Image
                src="/logo.png"
                alt="Manikan Admin Logo"
                width={224}
                height={64}
                className="object-contain transition-transform duration-500 group-hover:scale-105 brightness-0 invert opacity-90"
                priority
              />
            </div>
            <div className="text-center mt-4">
              <h1 className="font-display text-2xl font-semibold text-white">
                Admin Access
              </h1>
            </div>
            <div
              className="h-[1px] w-24 rounded-full mt-6"
              style={{ background: "linear-gradient(90deg, transparent, rgba(200,150,102,0.4), transparent)" }}
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-forest-200/60 mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@manikan.com"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-gold-500/60 focus:bg-white/8 transition-all mb-4"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-forest-200/60 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-gold-500/60 focus:bg-white/8 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || !email.trim() || !password.trim()}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: "linear-gradient(135deg, #C8966A 0%, #F0C080 50%, #C8966A 100%)",
                backgroundSize: "200% auto",
                color: "#0a2229",
              }}
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                "Enter Dashboard"
              )}
            </button>
          </form>

          <p className="text-center text-xs text-forest-400/50 mt-6">
            Manikan team access only.
          </p>
        </div>
      </div>
    </div>
  );
}
