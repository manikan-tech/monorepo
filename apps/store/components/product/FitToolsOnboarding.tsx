"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";

const FIT_TOOLS_SEEN_KEY = "manikan_fit_tools_intro_seen_v1";

type FitToolsOnboardingProps = {
  productName: string;
  manualTrigger?: number;
};

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8a2 2 0 0 1 2-2h3l1.5-2h5L16 6h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 7 9 5 9-5v10l-9 5-9-5V7Z" />
      <path d="M12 12v10" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function DialogShell({
  children,
  labelId,
  onClose,
  panelClassName = "max-w-4xl",
}: {
  children: React.ReactNode;
  labelId: string;
  onClose: () => void;
  panelClassName?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 80);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 md:p-8" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-forest-950/75 backdrop-blur-md animate-fade-in"
        onClick={onClose}
        aria-label="Close guide"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`relative z-10 w-full ${panelClassName} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[2rem] border border-white/15 bg-[#f7faf9] shadow-[0_36px_100px_rgba(2,18,23,0.48)] animate-fade-in-up`}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-forest-900/10 bg-white/85 text-forest-800 shadow-soft backdrop-blur transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-gold-500"
          aria-label="Close guide"
        >
          <CloseIcon />
        </button>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function ThreeDBodyVisual({ compact = false }: { compact?: boolean }) {
  const gradientId = useId().replace(/:/g, "");
  return (
    <div className={`relative mx-auto ${compact ? "h-44 w-40" : "h-64 w-56"}`} aria-hidden="true">
      <div className="absolute inset-x-2 bottom-1 h-8 rounded-[50%] border border-gold-400/25 bg-gold-400/5" />
      <div className="absolute inset-4 rounded-full bg-gold-400/15 blur-3xl animate-pulse-glow" />
      <svg viewBox="0 0 180 270" className="relative h-full w-full drop-shadow-[0_18px_25px_rgba(6,36,43,0.24)]">
        <defs>
          <linearGradient id={gradientId} x1="35" y1="20" x2="150" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d9b38c" />
            <stop offset="0.46" stopColor="#4f7b83" />
            <stop offset="1" stopColor="#12343b" />
          </linearGradient>
        </defs>
        <ellipse cx="90" cy="252" rx="62" ry="10" fill="#12343b" opacity=".14" />
        <circle cx="90" cy="31" r="19" fill={`url(#${gradientId})`} />
        <path d="M62 58c8-7 18-11 28-11s20 4 28 11l16 75c2 12-5 22-16 25l-8 2 8 80c1 11-6 18-16 18-7 0-12-5-13-13l-4-57-4 57c-1 8-6 13-13 13-10 0-17-7-16-18l8-80-8-2c-11-3-18-13-16-25l16-75Z" fill={`url(#${gradientId})`} />
        <path d="m62 62-24 38c-5 8-4 16 2 20 7 4 13 1 18-7l18-30M118 62l24 38c5 8 4 16-2 20-7 4-13 1-18-7l-18-30" fill="none" stroke={`url(#${gradientId})`} strokeWidth="15" strokeLinecap="round" />
        <path d="M65 111c16 7 34 7 50 0M59 150c19 8 43 8 62 0" fill="none" stroke="#f5dfc8" strokeOpacity=".6" strokeWidth="2" strokeDasharray="5 5" />
        <path d="M50 82h80M45 150h90" fill="none" stroke="#d5a66f" strokeWidth="1.5" strokeDasharray="3 6" opacity=".75" />
      </svg>
      <span className="absolute left-0 top-[31%] rounded-full border border-white/60 bg-white/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-forest-700 shadow-soft backdrop-blur">Chest</span>
      <span className="absolute right-0 top-[49%] rounded-full border border-white/60 bg-white/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-forest-700 shadow-soft backdrop-blur">Waist</span>
      <span className="absolute left-1 top-[62%] rounded-full border border-white/60 bg-white/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-forest-700 shadow-soft backdrop-blur">Hips</span>
    </div>
  );
}

export default function FitToolsOnboarding({ productName, manualTrigger = 0 }: FitToolsOnboardingProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  // Watch for manual trigger
  useEffect(() => {
    if (manualTrigger > 0) {
      setOpen(true);
    }
  }, [manualTrigger]);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(FIT_TOOLS_SEEN_KEY) === "true";
    } catch {
      // If storage is unavailable, avoid repeatedly interrupting the shopper.
    }
    if (seen) return;
    const timer = window.setTimeout(() => setOpen(true), 850);
    return () => window.clearTimeout(timer);
  }, []);

  const close = () => {
    try {
      window.localStorage.setItem(FIT_TOOLS_SEEN_KEY, "true");
    } catch {
      // The guide remains usable when storage is unavailable.
    }
    setOpen(false);
  };

  const launchTwoD = () => {
    close();
    window.setTimeout(() => document.getElementById("product-2d-tryon")?.click(), 180);
  };

  const launchThreeDGuide = () => {
    close();
    window.setTimeout(() => document.getElementById("product-3d-tryon")?.click(), 180);
  };

  if (!open) return null;

  return (
    <DialogShell labelId={titleId} onClose={close}>
      <div className="grid md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative overflow-hidden bg-forest-950 px-7 py-10 text-white md:px-10 md:py-12">
          <div className="absolute -left-24 -top-28 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-forest-500/35 blur-3xl" />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-gold-300">First-time fit guide</p>
            <h2 id={titleId} className="mt-3 font-display text-3xl font-semibold leading-tight md:text-4xl">
              Meet your virtual fitting room.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-cream-100/75">
              See how <strong className="font-semibold text-white">{productName}</strong> looks in a photo or inspect its fit on your own 3D body model.
            </p>
            <div className="mt-7 flex items-center gap-2 text-xs text-cream-100/65">
              <LockIcon />
              Your saved body profile stays in this browser.
            </div>
            <div className="mt-4 md:mt-8">
              <ThreeDBodyVisual compact />
            </div>
          </div>
        </div>

        <div className="px-6 pb-7 pt-16 md:px-9 md:py-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-600">Choose an experience</p>
          <div className="mt-5 grid gap-4">
            <button
              type="button"
              onClick={launchTwoD}
              className="group rounded-3xl border border-forest-900/10 bg-white p-5 text-left shadow-soft transition duration-300 hover:-translate-y-1 hover:border-gold-400/60 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-50 text-gold-700 transition group-hover:bg-gold-100"><CameraIcon /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <strong className="font-display text-xl font-semibold text-forest-950">2D Photo Try-On</strong>
                    <span className="rounded-full bg-gold-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-gold-700">Photo</span>
                  </span>
                  <span className="mt-1.5 block text-sm leading-5 text-forest-700/70">Upload a front-facing photo and receive a realistic styled image.</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-gold-700">Open 2D try-on <ArrowIcon /></span>
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={launchThreeDGuide}
              className="group relative overflow-hidden rounded-3xl border border-forest-800 bg-forest-950 p-5 text-left text-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <span className="absolute -right-12 -top-16 h-36 w-36 rounded-full bg-gold-400/20 blur-2xl transition group-hover:bg-gold-400/30" />
              <span className="relative flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-300/25 bg-gold-400/15 text-gold-300"><CubeIcon /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <strong className="font-display text-xl font-semibold">3D Body Fit</strong>
                    <span className="rounded-full border border-gold-300/25 bg-gold-400/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-gold-300">Interactive</span>
                  </span>
                  <span className="mt-1.5 block text-sm leading-5 text-cream-100/70">Build your proportions, rotate the result, compare sizes, and create an outfit.</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-gold-300">Take the 3D tour <ArrowIcon /></span>
                </span>
              </span>
            </button>
          </div>
          <button type="button" onClick={close} className="mx-auto mt-5 block text-xs font-semibold text-forest-700/60 underline-offset-4 hover:text-forest-900 hover:underline">
            I&apos;ll explore on my own
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
