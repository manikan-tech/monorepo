"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent, ClipboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const OTP_LENGTH = 6;
const COOLDOWN_SECONDS = 60;

/* ── SVG Icons ──────────────────────────────────────────── */

const ShieldIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const MailIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

/* ── Activation Form Component ──────────────────────────── */

export default function ActivationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Cooldown timer ─────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // ── Focus first input on mount ─────────────────────────
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // ── Redirect if no email ───────────────────────────────
  useEffect(() => {
    if (!email) {
      router.push("/signup");
    }
  }, [email, router]);

  // ── Input handlers ─────────────────────────────────────
  function handleChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError("");

    // Auto-focus next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits are filled
    if (digit && index === OTP_LENGTH - 1) {
      const fullCode = newOtp.join("");
      if (fullCode.length === OTP_LENGTH) {
        handleVerify(fullCode);
      }
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData.charAt(i);
    }
    setOtp(newOtp);

    // Focus the next empty input or the last one
    const nextEmptyIndex = newOtp.findIndex((d) => !d);
    const focusIndex = nextEmptyIndex === -1 ? OTP_LENGTH - 1 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();

    // Auto-submit if all digits pasted
    if (pastedData.length === OTP_LENGTH) {
      handleVerify(pastedData);
    }
  }

  // ── Verify OTP ─────────────────────────────────────────
  async function handleVerify(code?: string) {
    const otpCode = code || otp.join("");
    if (otpCode.length !== OTP_LENGTH) {
      setError("Please enter the full 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          code: otpCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed. Please try again.");
        setOtp(Array(OTP_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
        return;
      }

      // Success — redirect to dashboard
      router.push("/");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Resend OTP ─────────────────────────────────────────
  async function handleResend() {
    if (cooldown > 0) return;

    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.retryAfterSeconds) {
          setCooldown(data.retryAfterSeconds);
        }
        setError(data.error || "Could not resend code. Please try again.");
        return;
      }

      setSuccessMessage("A new code has been sent to your email.");
      setCooldown(COOLDOWN_SECONDS);
      setOtp(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
  }

  // ── Submit handler ─────────────────────────────────────
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleVerify();
  }

  function formatCooldown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (!email) return null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-fade-up" noValidate>
      {/* ── Heading ────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-forest-600/10 text-forest-600 mb-1">
          {ShieldIcon}
        </div>
        <h1 className="font-display text-4xl font-semibold text-forest-950 tracking-tight leading-tight">
          Verify your{" "}
          <span className="gold-shimmer bg-clip-text text-transparent">Email</span>
        </h1>
        <div className="flex items-center gap-2 text-forest-700/80">
          <span className="text-forest-700/60">{MailIcon}</span>
          <p className="font-sans text-sm font-light leading-relaxed">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-forest-900">{email}</span>
          </p>
        </div>
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

      {/* ── Success Banner ────────────────────────────── */}
      {successMessage && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-700 text-xs font-normal animate-fade-in" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      {/* ── OTP Input Boxes ───────────────────────────── */}
      <div className="flex flex-col gap-2">
        <label className="font-sans text-xs font-medium text-forest-900 tracking-wide">
          Verification Code
        </label>
        <div className="flex items-center justify-between gap-3">
          {Array.from({ length: OTP_LENGTH }).map((_, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              id={`otp-input-${index}`}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={otp[index]}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              className={`
                w-full aspect-square max-w-[56px] text-center font-display text-2xl font-semibold
                bg-manikan-input-bg border-[1.5px] rounded-xl
                outline-none transition-all duration-300 ease-out
                focus:shadow-glow
                ${otp[index]
                  ? "border-forest-600 text-forest-900"
                  : "border-manikan-border text-forest-700"
                }
                ${error
                  ? "border-manikan-error focus:ring-[3px] focus:ring-red-500/10"
                  : "focus:border-manikan-border-focus focus:ring-[3px] focus:ring-[#1b3a4b]/15"
                }
                placeholder:text-forest-700/30
              `}
              placeholder="·"
              disabled={isLoading}
              aria-label={`Digit ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* ── Submit ─────────────────────────────────────── */}
      <button
        type="submit"
        className="relative overflow-hidden flex items-center justify-center gap-2 w-full bg-forest-600 text-white hover:bg-forest-700 shadow-soft hover:shadow-card btn-glow rounded-xl px-5 py-2.5 font-medium transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100 group"
        disabled={isLoading || otp.join("").length !== OTP_LENGTH}
        id="activation-submit"
      >
        {/* Infinite Shimmer Sweep */}
        <div className="absolute inset-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
        
        <span className="relative z-10 flex items-center justify-center gap-2">
          {isLoading ? (
            <span className="inline-block w-5 h-5 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Verify & Continue
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </>
          )}
        </span>
      </button>

      {/* ── Resend & Footer ───────────────────────────── */}
      <div className="flex flex-col items-center gap-3">
        <div className="text-center">
          {cooldown > 0 ? (
            <p className="font-sans text-sm font-light text-forest-700/60">
              Resend code in{" "}
              <span className="font-semibold text-forest-900 tabular-nums">
                {formatCooldown(cooldown)}
              </span>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="font-sans text-sm font-semibold text-gold-600 underline underline-offset-4 decoration-gold-600/30 transition-colors hover:decoration-gold-600 hover:text-gold-500"
              id="resend-otp-btn"
            >
              Resend verification code
            </button>
          )}
        </div>
        <p className="text-center font-sans text-sm font-light text-forest-700/80">
          Wrong email?{" "}
          <Link href="/signup" className="text-gold-600 font-semibold underline underline-offset-4 decoration-gold-600/30 transition-colors hover:decoration-gold-600 hover:text-gold-500">
            Sign up again
          </Link>
        </p>
      </div>
    </form>
  );
}
