"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthInput from "../components/AuthInput";

/* ── SVG Icons ──────────────────────────────────────────── */

const MailIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/* ── Page Component ─────────────────────────────────────── */

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"customer" | "retailer">("customer");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleAsyncSubmit() {
    setError("");
    if (!validate()) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
          role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If account exists but not activated, redirect to activation page
        if (data.requiresActivation) {
          router.push(`/activation?email=${encodeURIComponent(data.email)}`);
          return;
        }
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      // Success — redirect based on role provided by backend
      router.push(data.redirect || "/");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleAsyncSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-fade-up" noValidate>
      {/* ── Heading ────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold text-forest-950 tracking-tight leading-tight">Welcome <span className="gold-shimmer bg-clip-text text-transparent">Back</span></h1>
        <p className="font-sans text-sm font-light text-forest-700/80 leading-relaxed max-w-[340px]">
          Sign in to your Manikan account.
        </p>
      </div>

      {/* ── Role Tabs ──────────────────────────────────── */}
      <div className="flex bg-forest-50 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => { setRole("customer"); setError(""); }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${role === "customer" ? "bg-white text-forest-900 shadow-sm" : "text-forest-700/70 hover:text-forest-900"}`}
        >
          Shopper
        </button>
        <button
          type="button"
          onClick={() => { setRole("retailer"); setError(""); }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${role === "retailer" ? "bg-white text-forest-900 shadow-sm" : "text-forest-700/70 hover:text-forest-900"}`}
        >
          Retailer
        </button>
      </div>

      {/* ── Error Banner ──────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-md text-red-600 text-xs font-normal animate-fade-in" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ── Fields ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <AuthInput
          id="login-email"
          label="Email Address"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" }));
          }}
          icon={MailIcon}
          error={fieldErrors.email}
          autoComplete="email"
        />
        <div className="flex flex-col gap-1">
          <AuthInput
            id="login-password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (fieldErrors.password)
                setFieldErrors((p) => ({ ...p, password: "" }));
            }}
            icon={LockIcon}
            error={fieldErrors.password}
            autoComplete="current-password"
          />
          <div className="flex justify-end mt-1">
            <Link href="/forgot-password" className="text-xs font-medium text-gold-600 hover:text-gold-700 transition-colors">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>

      {/* ── Submit ─────────────────────────────────────── */}
      <button
        type="submit"
        className="relative overflow-hidden flex items-center justify-center gap-2 w-full bg-forest-600 text-white hover:bg-forest-700 shadow-soft hover:shadow-card btn-glow rounded-xl px-5 py-2.5 font-medium transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100 group"
        disabled={isLoading}
        id="login-submit"
      >
        {/* Infinite Shimmer Sweep */}
        <div className="absolute inset-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
        
        <span className="relative z-10 flex items-center justify-center gap-2">
          {isLoading ? (
            <span className="inline-block w-5 h-5 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Sign In
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </>
          )}
        </span>
      </button>

      {/* ── Footer Link ───────────────────────────────── */}
      <p className="text-center font-sans text-sm font-light text-forest-700/80">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-gold-600 font-semibold underline underline-offset-4 decoration-gold-600/30 transition-colors hover:decoration-gold-600 hover:text-gold-500">
          Sign up
        </Link>
      </p>
    </form>
  );
}
