"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthInput from "../components/AuthInput";

const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

import { createClient } from "../../lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message || "Unauthorized. Please try requesting a new password reset link.");
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch {
      setError("Network error. Please try again.");
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
        <h1 className="font-display text-3xl font-semibold text-forest-950">Password Updated</h1>
        <p className="font-sans text-sm font-light text-forest-700/80 leading-relaxed max-w-[340px]">
          Your password has been changed successfully. Redirecting you to login...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-fade-up" noValidate>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold text-forest-950 tracking-tight leading-tight">New Password</h1>
        <p className="font-sans text-sm font-light text-forest-700/80 leading-relaxed max-w-[340px]">
          Please enter your new password below.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-md text-red-600 text-xs font-normal" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <AuthInput
          id="new-password"
          label="New Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setError("");
          }}
          icon={LockIcon}
          autoComplete="new-password"
        />
      </div>

      <button
        type="submit"
        className="flex items-center justify-center gap-2 w-full bg-forest-600 text-white hover:bg-forest-700 shadow-soft rounded-xl px-5 py-2.5 font-medium transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="inline-block w-5 h-5 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin" />
        ) : "Update Password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
