"use client";

import { Suspense } from "react";
import ActivationForm from "./ActivationForm";

function LoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 animate-fade-up">
      <span className="inline-block w-8 h-8 border-[3px] border-forest-600/20 border-t-forest-600 rounded-full animate-spin" />
      <p className="font-sans text-sm font-light text-forest-700/60">Loading…</p>
    </div>
  );
}

export default function ActivationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ActivationForm />
    </Suspense>
  );
}
