"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthInput from "../components/AuthInput";
import styles from "./page.module.css";

/* ── SVG Icons ──────────────────────────────────────────── */

const UserIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const MailIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/* ── Page Component ─────────────────────────────────────── */

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!name.trim() || name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
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

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      {/* ── Logo ──────────────────────────────────────── */}
      <div className={styles.logoArea}>
        <div className={styles.logoMark}>
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <path
              d="M20 2C10.06 2 2 10.06 2 20s8.06 18 18 18 18-8.06 18-18S29.94 2 20 2z"
              stroke="var(--manikan-teal)"
              strokeWidth="2.5"
              fill="none"
            />
            <path
              d="M12 28c2-6 4-16 8-16s6 10 8 16"
              stroke="var(--manikan-teal)"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      </div>

      {/* ── Heading ────────────────────────────────────── */}
      <div className={styles.headingArea}>
        <h1 className={styles.title}>Create an Account</h1>
        <p className={styles.subtitle}>
          Join Manikan to generate high-fidelity 3D human avatars.
        </p>
      </div>

      {/* ── Error Banner ──────────────────────────────── */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ── Fields ─────────────────────────────────────── */}
      <div className={styles.fields}>
        <AuthInput
          id="signup-name"
          label="Full Name"
          type="text"
          placeholder="Jane Doe"
          value={name}
          onChange={(v) => {
            setName(v);
            if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: "" }));
          }}
          icon={UserIcon}
          error={fieldErrors.name}
          autoComplete="name"
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
        className={styles.submitBtn}
        disabled={isLoading}
        id="signup-submit"
      >
        {isLoading ? (
          <span className={styles.spinner} />
        ) : (
          <>
            Sign Up
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </>
        )}
      </button>

      {/* ── Footer Link ───────────────────────────────── */}
      <p className={styles.footerText}>
        Already have an account?{" "}
        <Link href="/login" className={styles.footerLink}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
