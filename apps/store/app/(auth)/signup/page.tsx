"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthInput from "../components/AuthInput";

/* ── SVG Icons ──────────────────────────────────────────── */

const UserIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

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

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!firstName.trim() || firstName.trim().length < 2) {
      errors.firstName = "Min 2 chars";
    }

    if (!lastName.trim() || lastName.trim().length < 2) {
      errors.lastName = "Min 2 chars";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleAsyncSubmit() {
    setError("");
    if (!validate()) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      // Success — show success message instead of redirecting to activation
      if (data.requiresActivation) {
        setIsSuccess(true);
      } else {
        router.push("/");
      }
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

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-6 animate-fade-up max-w-sm mx-auto">
        <div className="w-16 h-16 bg-forest-50 text-forest-700 rounded-full flex items-center justify-center mb-2">
          {MailIcon}
        </div>
        <h1 className="font-display text-3xl font-semibold text-forest-950 tracking-tight leading-tight">
          Check your email
        </h1>
        <p className="font-sans text-sm font-light text-forest-700/80 leading-relaxed">
          We've sent an activation link to <span className="font-medium text-forest-900">{email}</span>. 
          Please check your inbox and click the link to activate your account.
        </p>
        <div className="pt-4 w-full">
          <Link
            href="/login"
            className="w-full flex items-center justify-center h-12 bg-manikan-teal text-white rounded-lg text-sm font-medium tracking-wide hover:bg-manikan-teal-hover transition-colors shadow-soft"
          >
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-fade-up" noValidate>
      {/* ── Heading ────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold text-forest-950 tracking-tight leading-tight">Create an <span className="gold-shimmer bg-clip-text text-transparent">Account</span></h1>
        <p className="font-sans text-sm font-light text-forest-700/80 leading-relaxed max-w-[340px]">
        </p>
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
          id="signup-first-name"
          label="First Name"
          type="text"
          placeholder="Jane"
          value={firstName}
          onChange={(v) => {
            setFirstName(v);
            if (fieldErrors.firstName) setFieldErrors((p) => ({ ...p, firstName: "" }));
          }}
          icon={UserIcon}
          error={fieldErrors.firstName}
          autoComplete="given-name"
        />
        <AuthInput
          id="signup-last-name"
          label="Last Name"
          type="text"
          placeholder="Doe"
          value={lastName}
          onChange={(v) => {
            setLastName(v);
            if (fieldErrors.lastName) setFieldErrors((p) => ({ ...p, lastName: "" }));
          }}
          icon={UserIcon}
          error={fieldErrors.lastName}
          autoComplete="family-name"
        />
        <AuthInput
          id="signup-email"
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
        <AuthInput
          id="signup-phone"
          label="Phone Number (Optional)"
          type="tel"
          placeholder="+20 100 123 4567"
          value={phone}
          onChange={(v) => setPhone(v)}
          icon={UserIcon} // Reusing UserIcon or could use a phone icon
          autoComplete="tel"
        />
        <AuthInput
          id="signup-password"
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
          autoComplete="new-password"
        />
      </div>

      {/* ── Submit ─────────────────────────────────────── */}
      <button
        type="submit"
        className="relative overflow-hidden flex items-center justify-center gap-2 w-full bg-forest-600 text-white hover:bg-forest-700 shadow-soft hover:shadow-card btn-glow rounded-xl px-5 py-2.5 font-medium transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100 group"
        disabled={isLoading}
        id="signup-submit"
      >
        {/* Infinite Shimmer Sweep */}
        <div className="absolute inset-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />

        <span className="relative z-10 flex items-center justify-center gap-2">
          {isLoading ? (
            <span className="inline-block w-5 h-5 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Sign Up
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
        Already have an account?{" "}
        <Link href="/login" className="text-gold-600 font-semibold underline underline-offset-4 decoration-gold-600/30 transition-colors hover:decoration-gold-600 hover:text-gold-500">
          Sign in
        </Link>
      </p>
    </form>
  );
}
