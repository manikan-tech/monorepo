"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import AuthInput from "../components/AuthInput";

const MailIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      errors.email = "Please enter a valid email address";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!validate()) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col gap-6 animate-fade-up items-center text-center mt-8">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-semibold text-forest-950">Check your email</h1>
        <p className="font-sans text-sm font-light text-forest-700/80 leading-relaxed max-w-[340px]">
          We have sent a password reset link to <span className="font-medium">{email}</span>. Please check your inbox.
        </p>
        <Link href="/login" className="mt-4 px-6 py-2.5 bg-forest-900 text-white rounded-xl font-medium hover:bg-forest-800 transition-colors">
          Return to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-fade-up" noValidate>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold text-forest-950 tracking-tight leading-tight">Reset Password</h1>
        <p className="font-sans text-sm font-light text-forest-700/80 leading-relaxed max-w-[340px]">
          Enter your email address and we will send you instructions to reset your password.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-md text-red-600 text-xs font-normal" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <AuthInput
          id="reset-email"
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
      </div>

      <button
        type="submit"
        className="flex items-center justify-center gap-2 w-full bg-forest-600 text-white hover:bg-forest-700 shadow-soft rounded-xl px-5 py-2.5 font-medium transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="inline-block w-5 h-5 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin" />
        ) : "Send Reset Link"}
      </button>

      <p className="text-center font-sans text-sm font-light text-forest-700/80">
        Remember your password?{" "}
        <Link href="/login" className="text-gold-600 font-semibold underline underline-offset-4 decoration-gold-600/30 transition-colors hover:decoration-gold-600">
          Back to login
        </Link>
      </p>
    </form>
  );
}
