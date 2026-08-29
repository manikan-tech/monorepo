import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import DemoRequestForm from "./DemoRequestForm";

export const metadata: Metadata = {
  title: "For Business — Manikan | AI Virtual Try-On for Retailers",
  description:
    "Reduce returns by up to 40% with Manikan's AI size recommendation and virtual try-on widget. Embed with one script tag. Request a demo today.",
};

function StatCard({
  value,
  label,
  description,
  delay = 0,
  gold = false,
}: {
  value: string;
  label: string;
  description: string;
  delay?: number;
  gold?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden flex flex-col gap-3 p-8 rounded-2xl bg-white border border-forest-100 shadow-soft hover:shadow-[0_10px_40px_-10px_rgba(200,150,102,0.3)] hover:border-gold-300 hover:-translate-y-2 transition-all duration-500 animate-fade-in-up group"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-gold-500/20 transition-all duration-500 pointer-events-none animate-pulse-glow" />
      <span
        className={`relative z-10 font-display text-5xl font-semibold group-hover:scale-105 origin-left transition-transform duration-500 ${gold ? "text-gold-600" : "text-forest-950"}`}
      >
        {value}
      </span>
      <span className="relative z-10 text-sm font-bold uppercase tracking-widest text-forest-900 group-hover:text-gold-700 transition-colors duration-300">
        {label}
      </span>
      <p className="relative z-10 text-sm text-forest-700/70 leading-relaxed group-hover:text-forest-800 transition-colors duration-300">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <div
      className="relative overflow-hidden flex flex-col gap-4 p-8 rounded-2xl bg-white border border-forest-100 shadow-soft hover:shadow-[0_10px_40px_-10px_rgba(200,150,102,0.3)] hover:border-gold-300 hover:-translate-y-2 transition-all duration-500 animate-fade-in-up group"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-gold-500/20 transition-all duration-500 pointer-events-none animate-pulse-glow" />
      <div className="relative z-10 w-14 h-14 rounded-2xl bg-forest-50 border border-forest-100 flex items-center justify-center text-gold-600 group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-gold-50 group-hover:border-gold-300 transition-all duration-500 shadow-sm group-hover:shadow-md animate-float">
        {icon}
      </div>
      <h3 className="relative z-10 font-display text-xl font-semibold text-forest-950 group-hover:text-gold-700 transition-colors duration-300">{title}</h3>
      <p className="relative z-10 text-sm text-forest-700/80 leading-relaxed group-hover:text-forest-800 transition-colors duration-300">{description}</p>
    </div>
  );
}

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for small boutiques just getting started.",
    features: [
      "Up to 50 products",
      "500 AI recommendations/month",
      "Widget embeddable on 1 store",
      "Standard dashboard",
    ],
    cta: "Get Started Free",
    href: "/login",
    highlight: false,
  },
  {
    name: "Growth",
    price: "Flexible",
    period: "",
    description: "For growing retailers ready to scale.",
    features: [
      "Up to 500 products",
      "5,000 AI recommendations/month",
      "Virtual Try-On enabled",
      "Priority support",
      "Advanced analytics",
    ],
    cta: "Request a Demo",
    href: "#request-demo",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Tailored for large-scale operations and enterprise needs.",
    features: [
      "Unlimited products",
      "Unlimited recommendations",
      "White-label widget",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    href: "#request-demo",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Does it work with Shopify and WooCommerce?",
    a: "Yes. Manikan's widget is a standalone JavaScript bundle that works on any storefront — Shopify, WooCommerce, Magento, or a fully custom React or Next.js store. You just drop in a single script tag.",
  },
  {
    q: "How long does setup take?",
    a: "For most stores, under 10 minutes. You upload your product CSV, grab your script tag from the dashboard, and paste it into your product page template. No developer required.",
  },
  {
    q: "Do shoppers need to install anything?",
    a: "No app or download is needed. The experience is fully browser-based. Shoppers upload a single photo directly on your product page and get instant recommendations.",
  },
  {
    q: "What happens to shopper photos?",
    a: "Photos are processed entirely in-memory on our inference server and deleted immediately after the try-on result is generated. We never log, store, or train our models on raw user photos.",
  },
  {
    q: "How accurate is the size recommendation?",
    a: "Our AI achieves 99.8% accuracy in extracting 3D body measurements from a single 2D photo. The LangGraph recommendation agent cross-references these measurements against your specific size charts for each product.",
  },
  {
    q: "Is there a long-term contract?",
    a: "No. All plans are month-to-month. You can upgrade, downgrade, or cancel at any time from your dashboard with no penalties.",
  },
  {
    q: "How does billing work?",
    a: "Plans are billed monthly via Stripe. Each of the three services (AI Size Recommendation, 2D Virtual Try-On, 3D Body Modeling) is subscribed to independently — you pay only for what you use. Stripe handles all payment processing and invoicing.",
  },
  {
    q: "Is the widget secure to embed on my store?",
    a: "Yes. Each retailer receives a unique public API key (pk_live_…). This key is paired with a server-side Origin allowlist — requests from unlisted origins are rejected even if someone obtains your key. All data is tenant-isolated by retailer ID at every database query level.",
  },
  {
    q: "What is the Telegram bot and do my shoppers need it?",
    a: "The @ManikanBot Telegram bot is an optional channel that lets shoppers try on clothes by sending photos directly in Telegram chat. It requires them to link their Manikan account once. It's an addition to the web experience, not a replacement — shoppers can use either or both.",
  },
];

export default function ForBusinessPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Hero ── */}
      <section className="relative w-full min-h-[80vh] flex items-center overflow-hidden bg-forest-950">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[70%] bg-gold-500/30 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[80%] bg-forest-500/30 rounded-full blur-[150px] animate-float" style={{ animationDelay: "2s" }} />
        </div>

        <div className="relative z-10 max-w-[1200px] mx-auto px-6 w-full flex flex-col items-center text-center gap-8 py-24">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-400 text-sm font-medium animate-fade-in-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            For Retailers &amp; Brands
          </div>

          <h1
            className="font-display text-5xl md:text-7xl font-semibold text-white leading-[1.1] max-w-4xl animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            40% of Returns are a{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300 bg-[length:200%_auto] animate-shimmer-slow">
              Fit Problem.
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-forest-100/80 max-w-2xl leading-relaxed animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            Manikan gives your shoppers AI-powered size recommendations and virtual
            try-on embedded in your store with a single script tag. No engineering
            changes. No new app.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <a
              href="#request-demo"
              className="relative overflow-hidden px-8 py-4 bg-gold-500 text-forest-950 rounded-2xl font-semibold hover:bg-gold-400 transition-all duration-300 hover:shadow-[0_0_30px_rgba(200,150,102,0.4)] hover:-translate-y-1 active:scale-95"
            >
              <span className="relative z-10">Request a Demo</span>
            </a>
            <a
              href="#how-it-works"
              className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-medium hover:bg-white/10 transition-all duration-300 backdrop-blur-sm hover:-translate-y-1"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-24 bg-cream-50 border-b border-forest-900/5">
        <div className="max-w-[1200px] mx-auto px-6 w-full">
          <div className="text-center mb-14 animate-fade-in-up">
            <span className="text-sm font-bold uppercase tracking-widest text-gold-600 mb-3 block">
              The Problem
            </span>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-forest-950">
              Wrong sizes cost everyone.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              value="40%"
              label="Returns from poor fit"
              description="Of all online fashion returns trace back to sizing confusion — not defective products."
              gold
              delay={0}
            />
            <StatCard
              value="$200B"
              label="Annual reverse logistics"
              description="Wasted globally on returns processing, inspection, and restocking every single year."
              delay={100}
            />
            <StatCard
              value="1 tag"
              label="To fix it"
              description="One HTML script tag. That's all it takes to add AI size recommendations and virtual try-on to any storefront."
              gold
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 bg-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cream-100 rounded-full blur-[100px] opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="max-w-[1200px] mx-auto px-6 w-full relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 flex flex-col gap-8">
              <div className="animate-fade-in-up">
                <span className="text-sm font-bold uppercase tracking-widest text-gold-600 mb-3 block">
                  Integration
                </span>
                <h2 className="font-display text-4xl md:text-5xl font-semibold text-forest-950 leading-tight mb-4">
                  One Line of Code.
                  <br />
                  <span className="text-gold-600">Zero Engineering.</span>
                </h2>
                <p className="text-forest-700/80 leading-relaxed max-w-lg">
                  Manikan is a standalone widget bundle that works on Shopify,
                  WooCommerce, or any custom storefront. Drop in the script tag and
                  your shoppers instantly get AI-powered try-on.
                </p>
              </div>

              <div className="flex flex-col gap-5">
                {[
                  { step: "1", title: "Upload your catalog", desc: "Share your CSV product catalog — we ingest it, generate embeddings, and index your size charts." },
                  { step: "2", title: "Embed the widget", desc: "Add one script tag to your product pages. Widget inherits your store's colors automatically." },
                  { step: "3", title: "Watch returns drop", desc: "Shoppers get AI size recommendations and virtual try-on. You get fewer returns and more confident buyers." },
                ].map(({ step, title, desc }, i) => (
                  <div key={step} className="flex gap-5 animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="w-10 h-10 rounded-full bg-gold-500 text-forest-950 font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">
                      {step}
                    </div>
                    <div>
                      <p className="font-semibold text-forest-950 mb-1">{title}</p>
                      <p className="text-sm text-forest-700/80 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

          {/* Extra feature cards row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <FeatureCard
              delay={400}
              title="Telegram Bot Channel"
              description="Your shoppers can try on clothes right from Telegram. They link their Manikan account once, then send photos via @ManikanBot — no browser needed. Credits are tracked per customer and only deducted on successful results."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              }
            />
            <FeatureCard
              delay={500}
              title="Security & Isolation"
              description="Each retailer gets a unique public API key (pk_live_…) paired with an Origin allowlist. Cross-origin widget calls are validated server-side — not just by CORS. All data is tenant-isolated by retailer ID at every DB query."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              }
            />
          </div>
            </div>

            <div className="flex-1 w-full animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <div className="w-full rounded-2xl bg-[#0d1117] border border-white/10 overflow-hidden shadow-2xl hover:shadow-[0_0_40px_rgba(200,150,102,0.1)] hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center px-4 py-3 bg-[#161b22] border-b border-white/5">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                    <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                  </div>
                  <span className="ml-4 text-xs font-mono text-white/40">product-page.html</span>
                </div>
                <div className="p-6 overflow-x-auto">
                  <pre className="font-mono text-sm leading-relaxed">
                    <code className="text-white/80">
                      <span className="text-[#ff7b72">{"<!-- Manikan AI Widget -->"}</span>{"\n"}
                      <span className="text-[#7ee787]">{"<script"}</span>{" "}
                      <span className="text-[#79c0ff]">src=</span>
                      <span className="text-[#a5d6ff]">{'\"https://cdn.manikan.io/widget.js\"'}</span>{"\n"}
                      {"        "}
                      <span className="text-[#79c0ff]">data-retailer-id=</span>
                      <span className="text-[#a5d6ff]">{'\"ret_8f92jK\"'}</span>{"\n"}
                      {"        "}
                      <span className="text-[#79c0ff]">data-product-id=</span>
                      <span className="text-[#a5d6ff]">{'\"prod_44mA2\"'}</span>
                      <span className="text-[#7ee787]">{">"}</span>{"\n"}
                      <span className="text-[#7ee787]">{"</script>"}</span>
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 bg-cream-50 border-y border-forest-900/5">
        <div className="max-w-[1200px] mx-auto px-6 w-full">
          <div className="text-center mb-14 animate-fade-in-up">
            <span className="text-sm font-bold uppercase tracking-widest text-gold-600 mb-3 block">
              What You Get
            </span>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-forest-950">
              Everything you need, nothing you don&apos;t.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              delay={0}
              title="AI Size Recommendation"
              description="LangGraph agent reasons over your size charts and the shopper's body measurements to recommend the right size with a natural language explanation. Separately billed — subscribe only to what you need."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
            <FeatureCard
              delay={100}
              title="2D Virtual Try-On"
              description="Shoppers upload a photo and see themselves wearing the actual garment — fabric, color, and print — before they buy. Powered by an AI inference model with result caching for instant repeat requests."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="line">
                  <path d="M20.38 3.46 16 2a8.5 8.5 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
                </svg>
              }
            />
            <FeatureCard
              delay={200}
              title="Analytics Dashboard"
              description="6 real-time charts: try-on to purchase conversion rate, funnel drop-off analysis, revenue by fabric/category, stock health heatmap, rating vs conversion scatter, and 30-day widget usage area chart."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              }
            />
            <FeatureCard
              delay={300}
              title="Size Chart Ingestion"
              description="Upload your size chart CSV once per product. We parse, validate, and index the numeric measurement ranges. The recommendation agent reads these directly when suggesting sizes to shoppers."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-24 bg-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gold-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 w-full relative z-10">
          <div className="text-center mb-14 animate-fade-in-up">
            <span className="text-sm font-bold uppercase tracking-widest text-gold-600 mb-3 block">Pricing</span>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-forest-950">
              Simple, transparent plans.
            </h2>
            <p className="mt-4 text-forest-700/70 max-w-lg mx-auto">
              No hidden fees. No long-term contracts. Upgrade or cancel anytime.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative flex flex-col gap-6 p-8 rounded-2xl border animate-fade-in-up transition-all duration-300 hover:-translate-y-2 ${
                  plan.highlight
                    ? "bg-forest-950 border-gold-500/30 shadow-[0_0_60px_rgba(200,150,102,0.15)]"
                    : "bg-white border-forest-100 shadow-soft hover:shadow-lift"
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 bg-gold-500 text-forest-950 text-xs font-bold uppercase tracking-wider rounded-full shadow-soft">
                      Most Popular
                    </span>
                  </div>
                )}
                <div>
                  <p className={`text-sm font-bold uppercase tracking-widest mb-2 ${plan.highlight ? "text-gold-400" : "text-gold-600"}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span className={`font-display text-4xl font-semibold ${plan.highlight ? "text-white" : "text-forest-950"}`}>
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className={`text-sm mb-1.5 ${plan.highlight ? "text-forest-100/50" : "text-forest-700/50"}`}>
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-2 ${plan.highlight ? "text-forest-100/70" : "text-forest-700/70"}`}>
                    {plan.description}
                  </p>
                </div>
                <ul className="flex flex-col gap-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${plan.highlight ? "bg-gold-500/20 text-gold-400" : "bg-forest-100 text-forest-600"}`}>
                        ✓
                      </div>
                      <span className={`text-sm ${plan.highlight ? "text-forest-100/80" : "text-forest-700/80"}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={`block text-center px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 hover:-translate-y-0.5 ${
                    plan.highlight
                      ? "bg-gold-500 text-forest-950 hover:bg-gold-400 shadow-soft"
                      : "bg-forest-900 text-white hover:bg-forest-800"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 bg-cream-50 border-y border-forest-900/5">
        <div className="max-w-[860px] mx-auto px-6 w-full">
          <div className="text-center mb-14 animate-fade-in-up">
            <span className="text-sm font-bold uppercase tracking-widest text-gold-600 mb-3 block">FAQ</span>
            <h2 className="font-display text-4xl font-semibold text-forest-950">Common Questions</h2>
          </div>
          <div className="flex flex-col gap-4">
            {FAQS.map(({ q, a }, i) => (
              <div
                key={q}
                className="bg-white rounded-2xl border border-forest-100 shadow-soft p-6 hover:shadow-lift hover:border-gold-200 transition-all duration-300 animate-fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className="font-semibold text-forest-950 mb-2 flex items-start gap-3">
                  <span className="mt-0.5 text-gold-500 shrink-0">Q.</span>
                  {q}
                </p>
                <p className="text-sm text-forest-700/80 leading-relaxed pl-6">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo Request ── */}
      <section id="request-demo" className="py-24 bg-forest-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[70%] bg-gold-500/20 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[60%] bg-forest-400/20 rounded-full blur-[100px] animate-float" style={{ animationDelay: "3s" }} />
        </div>

        <div className="max-w-[1200px] mx-auto px-6 w-full relative z-10">
          <div className="flex flex-col lg:flex-row gap-16 items-start">
            <div className="flex-1 flex flex-col gap-6 lg:pt-4 animate-fade-in-up">
              <span className="text-sm font-bold uppercase tracking-widest text-gold-500">
                Get Started
              </span>
              <h2 className="font-display text-4xl md:text-5xl font-semibold text-white leading-tight">
                Ready to cut returns and boost confidence?
              </h2>
              <p className="text-forest-100/80 leading-relaxed max-w-md">
                Tell us about your store and we&apos;ll reach out within 1–2 business days
                to walk you through a personalized demo.
              </p>
              <div className="flex flex-col gap-4 mt-4">
                {[
                  "No long-term contracts",
                  "Works on Shopify, WooCommerce, and custom stores",
                  "Setup takes less than 10 minutes",
                  "Privacy-first — shopper photos never stored",
                  "Billed monthly via Stripe — cancel anytime",
                  "Includes @ManikanBot Telegram channel for shoppers",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-forest-100/80 text-sm">
                    <div className="w-5 h-5 rounded-full bg-gold-500/20 flex items-center justify-center text-gold-400 shrink-0">✓</div>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full lg:w-[560px] shrink-0 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
              <div className="bg-white rounded-2xl p-8 md:p-10 shadow-2xl border border-white/5">
                <h3 className="font-display text-2xl font-semibold text-forest-950 mb-1">
                  Request a Demo
                </h3>
                <p className="text-sm text-forest-700/70 mb-8">
                  Fields marked <span className="text-gold-600 font-semibold">*</span> are required.
                </p>
                <DemoRequestForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy Footer Banner ── */}
      <section className="py-14 bg-gold-50 border-t border-gold-500/10">
        <div className="max-w-[800px] mx-auto px-6 text-center animate-fade-in-up">
          <div className="w-12 h-12 mx-auto bg-gold-500/20 text-gold-600 rounded-full flex items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h3 className="font-display text-2xl font-semibold text-forest-950 mb-3">
            Privacy-first by design
          </h3>
          <p className="text-forest-700/80 text-sm leading-relaxed">
            Shopper photos are processed entirely in-memory and deleted from our
            systems immediately after the try-on inference completes.{" "}
            <strong>We never log, store, or train on raw user photos.</strong>
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="#request-demo"
              className="px-7 py-3 bg-forest-900 text-white rounded-xl font-medium hover:bg-forest-800 transition-colors shadow-soft hover:shadow-lift hover:-translate-y-0.5"
            >
              Request a Demo
            </Link>
            <Link href="/store" className="px-7 py-3 border border-forest-200 text-forest-900 rounded-xl font-medium hover:bg-forest-50 transition-colors">
              Browse the Store
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
