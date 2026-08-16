"use client";

import { useState, FormEvent } from "react";

interface FieldErrors {
  companyName?: string;
  contactName?: string;
  email?: string;
}

export default function DemoRequestForm() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [monthlyOrders, setMonthlyOrders] = useState("");
  const [message, setMessage] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleAsyncSubmit() {
    setGlobalError("");
    setFieldErrors({});
    setIsLoading(true);

    try {
      const res = await fetch("/api/business-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName,
          email,
          phone,
          website,
          monthlyOrders,
          message,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
        } else {
          setGlobalError(data.error || "Something went wrong. Please try again.");
        }
        return;
      }

      setSubmitted(true);
    } catch {
      setGlobalError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleAsyncSubmit();
  }

  const inputCls =
    "w-full px-4 py-3 rounded-xl border bg-forest-50/50 text-forest-900 placeholder:text-forest-700/40 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-all duration-200";
  const errorBorder = "border-red-400 focus:ring-red-400/30 focus:border-red-400";
  const normalBorder = "border-forest-200";

  if (submitted) {
    return (
      <div className="text-center py-16 px-8 animate-fade-in-up">
        <div className="w-20 h-20 bg-green-50 border border-green-200 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-soft">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 className="font-display text-2xl font-semibold text-forest-950 mb-3">
          You&apos;re on our radar!
        </h3>
        <p className="text-forest-700/80 max-w-sm mx-auto leading-relaxed">
          Thanks for reaching out. Our team will review your request and get back to you within <strong>1–2 business days</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {globalError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {globalError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Company Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="biz-company" className="text-xs font-medium text-forest-900 uppercase tracking-wide">
            Company Name <span className="text-gold-600">*</span>
          </label>
          <input
            id="biz-company"
            type="text"
            placeholder="Acme Fashion Co."
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); setFieldErrors((p) => ({ ...p, companyName: "" })); }}
            className={`${inputCls} ${fieldErrors.companyName ? errorBorder : normalBorder}`}
          />
          {fieldErrors.companyName && <p className="text-xs text-red-500">{fieldErrors.companyName}</p>}
        </div>

        {/* Contact Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="biz-contact" className="text-xs font-medium text-forest-900 uppercase tracking-wide">
            Your Name <span className="text-gold-600">*</span>
          </label>
          <input
            id="biz-contact"
            type="text"
            placeholder="Sara Ahmed"
            value={contactName}
            onChange={(e) => { setContactName(e.target.value); setFieldErrors((p) => ({ ...p, contactName: "" })); }}
            className={`${inputCls} ${fieldErrors.contactName ? errorBorder : normalBorder}`}
          />
          {fieldErrors.contactName && <p className="text-xs text-red-500">{fieldErrors.contactName}</p>}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="biz-email" className="text-xs font-medium text-forest-900 uppercase tracking-wide">
            Work Email <span className="text-gold-600">*</span>
          </label>
          <input
            id="biz-email"
            type="email"
            placeholder="sara@acmefashion.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: "" })); }}
            className={`${inputCls} ${fieldErrors.email ? errorBorder : normalBorder}`}
          />
          {fieldErrors.email && <p className="text-xs text-red-500">{fieldErrors.email}</p>}
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="biz-phone" className="text-xs font-medium text-forest-900 uppercase tracking-wide">
            Phone
          </label>
          <input
            id="biz-phone"
            type="tel"
            placeholder="+20 10 1234 5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${inputCls} ${normalBorder}`}
          />
        </div>

        {/* Website */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="biz-website" className="text-xs font-medium text-forest-900 uppercase tracking-wide">
            Website
          </label>
          <input
            id="biz-website"
            type="url"
            placeholder="https://acmefashion.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className={`${inputCls} ${normalBorder}`}
          />
        </div>

        {/* Monthly Orders */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="biz-orders" className="text-xs font-medium text-forest-900 uppercase tracking-wide">
            Monthly Orders
          </label>
          <select
            id="biz-orders"
            value={monthlyOrders}
            onChange={(e) => setMonthlyOrders(e.target.value)}
            className={`${inputCls} ${normalBorder}`}
          >
            <option value="">Select range…</option>
            <option value="Under 100">Under 100</option>
            <option value="100–1,000">100–1,000</option>
            <option value="1,000+">1,000+</option>
          </select>
        </div>
      </div>

      {/* Message */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="biz-message" className="text-xs font-medium text-forest-900 uppercase tracking-wide">
          Message
        </label>
        <textarea
          id="biz-message"
          rows={4}
          placeholder="Tell us about your store and what you're looking to achieve…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputCls} ${normalBorder} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        id="biz-submit"
        className="relative overflow-hidden flex items-center justify-center gap-2 w-full bg-gold-500 text-forest-950 hover:bg-gold-400 rounded-xl px-6 py-3.5 font-semibold text-sm transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] shadow-soft hover:shadow-card disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] bg-[length:200%_100%] animate-shimmer-slow pointer-events-none" />
        <span className="relative z-10 flex items-center gap-2">
          {isLoading ? (
            <span className="inline-block w-5 h-5 border-[2.5px] border-forest-950/30 border-t-forest-950 rounded-full animate-spin" />
          ) : (
            <>
              Request a Demo
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </>
          )}
        </span>
      </button>

      <p className="text-center text-xs text-forest-700/50">
        No commitments. Our team will reach out within 1–2 business days.
      </p>
    </form>
  );
}
