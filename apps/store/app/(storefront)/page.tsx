import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "../lib/prisma";
import ProductCard from "../../components/ProductCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manikan — AI Virtual Try-On for Fashion",
  description:
    "Shop with confidence using AI body sizing and virtual try-on. Find your perfect fit, every time. Powered by SMPL body mesh and LangGraph AI.",
};

export default async function Home() {
  let featuredProducts: any[] = [];
  try {
    featuredProducts = await prisma.product.findMany({
      take: 4,
      where: { 
        isActive: true,
        retailer: { isActivated: true } 
      },
      orderBy: { createdAt: "desc" },
      include: { variants: true },
    });
  } catch {
    // Gracefully degrade if DB is unavailable
  }

  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative w-full min-h-[85vh] flex items-center overflow-hidden bg-forest-950">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[70%] bg-gold-500/30 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[80%] bg-forest-500/30 rounded-full blur-[150px] animate-float" style={{ animationDelay: "2s" }} />
        </div>

        <div className="relative z-10 max-w-[1200px] mx-auto px-6 w-full flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 flex flex-col items-start gap-6 pt-10 md:pt-0">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-400 text-sm font-medium animate-fade-in-up">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-500"></span>
              </span>
              Welcome to the Future of Fashion
            </div>
            
            <h1 className="font-display text-5xl md:text-7xl font-semibold text-white leading-[1.1] animate-fade-in-up" style={{ animationDelay: "100ms" }}>
              Experience True <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300 bg-[length:200%_auto] animate-shimmer-slow">
                Virtual Try-On
              </span>
            </h1>
            
            <p className="text-lg text-forest-100/80 max-w-lg leading-relaxed animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              Discover curated fashion tailored to your exact measurements. Our AI-driven virtual fitting room ensures you find your perfect fit, every single time.
            </p>
            
            <div className="flex flex-wrap gap-4 mt-4 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              <Link href="/store" className="relative overflow-hidden px-8 py-4 bg-gold-500 text-forest-950 rounded-2xl font-semibold hover:bg-gold-400 transition-all duration-300 hover:shadow-[0_0_30px_rgba(200,150,102,0.4)] hover:-translate-y-1 active:scale-95">
                <span className="relative z-10">Shop Collection</span>
              </Link>
              <Link href="#how-it-works" className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-medium hover:bg-white/10 transition-all duration-300 backdrop-blur-sm hover:-translate-y-1">
                Learn More
              </Link>
            </div>
          </div>

          {/* Hero Visual — Dual Layer 3D Preview */}
          <div className="flex-1 w-full relative animate-fade-in-up" style={{ animationDelay: "400ms" }}>
            <div className="relative w-full aspect-[4/5] max-w-md mx-auto">
              <div className="absolute inset-0 bg-gradient-to-tr from-forest-800 to-forest-900 rounded-[2.5rem] border border-white/10 shadow-[0_20px_50px_rgba(10,34,41,0.5)] overflow-hidden">
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_50%,_var(--tw-gradient-stops))] from-gold-500/20 via-transparent to-transparent animate-pulse-glow" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-forest-950 to-transparent z-10" />
                {/* Scan line */}
                <div className="absolute top-1/4 inset-x-8 h-[2px] bg-gold-400 shadow-[0_0_15px_rgba(200,150,102,0.8)] z-20 animate-scan" />
                {/* Body mesh visual */}
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
                  <div className="relative w-40 h-56 opacity-70">
                    {/* Simplified SVG body silhouette */}
                    <svg viewBox="0 0 80 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                      <ellipse cx="40" cy="14" rx="11" ry="13" stroke="rgba(200,150,102,0.5)" strokeWidth="1"/>
                      <path d="M22 34 C18 40 14 60 16 80 L24 80 L26 60 L28 80 L52 80 L54 60 L56 80 L64 80 C66 60 62 40 58 34 C52 28 28 28 22 34Z" stroke="rgba(200,150,102,0.5)" strokeWidth="1" fill="rgba(200,150,102,0.04)"/>
                      <path d="M16 80 L18 115 L30 115 L32 95 L34 115 L46 115 L48 95 L50 115 L62 115 L64 80" stroke="rgba(200,150,102,0.5)" strokeWidth="1" fill="rgba(200,150,102,0.04)"/>
                      <line x1="22" y1="34" x2="8" y2="65" stroke="rgba(200,150,102,0.4)" strokeWidth="1"/>
                      <line x1="58" y1="34" x2="72" y2="65" stroke="rgba(200,150,102,0.4)" strokeWidth="1"/>
                      {/* Measurement lines */}
                      <line x1="14" y1="50" x2="66" y2="50" stroke="rgba(200,150,102,0.25)" strokeWidth="0.5" strokeDasharray="2,3"/>
                      <line x1="18" y1="65" x2="62" y2="65" stroke="rgba(200,150,102,0.25)" strokeWidth="0.5" strokeDasharray="2,3"/>
                    </svg>
                  </div>
                  <span className="text-gold-500/60 text-[11px] font-bold uppercase tracking-widest animate-pulse">Analyzing Body Measurements</span>
                  {/* Progress dots */}
                  <div className="flex gap-1.5 mt-1">
                    {[0,1,2,3,4].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-gold-400/60 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="absolute top-10 -left-6 bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl animate-float">
                <p className="text-xs text-gold-300 font-bold uppercase tracking-wider">AI Accuracy</p>
                <p className="text-2xl font-display font-semibold text-white">99.8%</p>
              </div>
              
              <div className="absolute bottom-20 -right-6 bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl animate-float" style={{ animationDelay: "1s" }}>
                <p className="text-xs text-gold-300 font-bold uppercase tracking-wider">Perfect Fit</p>
                <p className="text-2xl font-display font-semibold text-white text-center">Guaranteed</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Infinite Marquee Section ── */}
      <div className="w-full bg-gold-500 py-5 overflow-hidden flex items-center border-y border-gold-600/50 shadow-soft z-20 relative">
        <div className="whitespace-nowrap flex animate-marquee shrink-0">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-12 px-6 shrink-0">
              <span className="text-forest-950 text-sm md:text-base font-bold uppercase tracking-widest">Premium Fashion</span>
              <span className="text-forest-900/40 text-xl">✦</span>
              <span className="text-forest-950 text-sm md:text-base font-bold uppercase tracking-widest">AI Body Sizing</span>
              <span className="text-forest-900/40 text-xl">✦</span>
              <span className="text-forest-950 text-sm md:text-base font-bold uppercase tracking-widest">Virtual Try-On</span>
              <span className="text-forest-900/40 text-xl">✦</span>
              <span className="text-forest-950 text-sm md:text-base font-bold uppercase tracking-widest">Zero Returns</span>
              <span className="text-forest-900/40 text-xl">✦</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Statistics / Problem Section ── */}
      <section className="py-20 bg-cream-50 border-b border-forest-900/5">
        <div className="max-w-[1200px] mx-auto px-6 w-full">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 divide-y md:divide-y-0 md:divide-x divide-forest-900/10 text-center md:text-left">
            <div className="flex flex-col gap-2 py-4 md:py-0 md:pr-8 animate-fade-in-up">
              <span className="font-display text-5xl font-semibold text-gold-600">40%</span>
              <span className="text-sm font-bold uppercase tracking-widest text-forest-900">Return Rate</span>
              <p className="text-xs text-forest-700/70 leading-relaxed mt-1">Of online fashion returns are caused solely by poor fit and sizing confusion.</p>
            </div>
            <div className="flex flex-col gap-2 py-4 md:py-0 md:px-8 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
              <span className="font-display text-5xl font-semibold text-forest-950">$200B</span>
              <span className="text-sm font-bold uppercase tracking-widest text-forest-900">Annual Cost</span>
              <p className="text-xs text-forest-700/70 leading-relaxed mt-1">Wasted on reverse logistics, inspection, and restocking by retailers globally.</p>
            </div>
            <div className="flex flex-col gap-2 py-4 md:py-0 md:px-8 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <span className="font-display text-5xl font-semibold text-gold-600">99.8%</span>
              <span className="text-sm font-bold uppercase tracking-widest text-forest-900">AI Accuracy</span>
              <p className="text-xs text-forest-700/70 leading-relaxed mt-1">Precision in extracting precise 3D body measurements from a single photo.</p>
            </div>
            <div className="flex flex-col gap-2 py-4 md:py-0 md:pl-8 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              <span className="font-display text-5xl font-semibold text-forest-950">1 Photo</span>
              <span className="text-sm font-bold uppercase tracking-widest text-forest-900">All You Need</span>
              <p className="text-xs text-forest-700/70 leading-relaxed mt-1">Upload a single photo and our AI extracts your full 3D body measurements instantly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured Products ── */}
      <section className="py-24 max-w-[1200px] mx-auto px-6 w-full">
        <div className="flex justify-between items-end mb-12 animate-fade-in-up">
          <div>
            <span className="text-sm font-bold uppercase tracking-widest text-gold-600 mb-2 block">Curated For You</span>
            <h2 className="font-display text-4xl font-semibold text-forest-950">New Arrivals</h2>
          </div>
          <Link href="/store" className="hidden md:flex items-center gap-2 text-forest-900 font-medium hover:text-gold-600 transition-colors group">
            View All Collection
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product, i) => (
              <div key={product.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-forest-50 rounded-2xl border border-forest-100 flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-gold-500/10 text-gold-500 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.38 3.46 16 2a8.5 8.5 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
              </svg>
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-forest-900 mb-1">New arrivals coming soon</p>
              <p className="text-sm text-forest-700/60">Our buyers are curating the best pieces for you.</p>
            </div>
            <Link href="/store" className="px-6 py-2.5 bg-forest-900 text-white rounded-xl text-sm font-semibold hover:bg-forest-800 transition-colors">
              Browse All Products
            </Link>
          </div>
        )}
        
        <div className="mt-10 md:hidden flex justify-center">
          <Link href="/store" className="px-6 py-3 border-2 border-forest-900 text-forest-900 rounded-xl font-medium hover:bg-forest-900 hover:text-white transition-colors">
            View All Collection
          </Link>
        </div>
      </section>

      {/* ── Value Proposition Section ── */}
      <section id="how-it-works" className="py-24 bg-cream-50 border-y border-forest-900/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-white rounded-full blur-[100px] opacity-40 -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="max-w-[1200px] mx-auto px-6 w-full text-center relative z-10">
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-forest-950 mb-16">How Manikan Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center gap-5 group animate-fade-in-up" style={{ animationDelay: "100ms" }}>
              <div className="w-20 h-20 rounded-3xl bg-white border border-forest-100 shadow-soft flex items-center justify-center text-gold-500 group-hover:scale-110 group-hover:shadow-lift transition-all duration-500">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7 21v-1a5 5 0 0 1 10 0v1"/>
                </svg>
              </div>
              <h3 className="font-display text-2xl font-semibold text-forest-950">1. AI Body Scan</h3>
              <p className="text-forest-700/80 text-sm leading-relaxed max-w-xs">Upload a single photo and our AI extracts your precise 3D body measurements. We then cross-reference your results against each retailer&apos;s uploaded size charts for pinpoint accuracy.</p>
            </div>
            
            <div className="flex flex-col items-center gap-5 group animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <div className="w-20 h-20 rounded-3xl bg-white border border-forest-100 shadow-soft flex items-center justify-center text-gold-500 group-hover:scale-110 group-hover:shadow-lift transition-all duration-500">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.38 3.46 16 2a8.5 8.5 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
                </svg>
              </div>
              <h3 className="font-display text-2xl font-semibold text-forest-950">2. Virtual Try-On</h3>
              <p className="text-forest-700/80 text-sm leading-relaxed max-w-xs">See exactly how clothes will drape and fit on your unique digital twin before you even add them to your cart.</p>
            </div>
            
            <div className="flex flex-col items-center gap-5 group animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              <div className="w-20 h-20 rounded-3xl bg-white border border-forest-100 shadow-soft flex items-center justify-center text-gold-500 group-hover:scale-110 group-hover:shadow-lift transition-all duration-500">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              </div>
              <h3 className="font-display text-2xl font-semibold text-forest-950">3. Shop Confidently</h3>
              <p className="text-forest-700/80 text-sm leading-relaxed max-w-xs">Say goodbye to the hassle of returns. Purchase knowing the size recommended is mathematically perfect for you.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3D Parametric Garment Engine Section ── */}
      <section className="py-24 relative overflow-hidden bg-forest-950 text-white">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_80%,_var(--tw-gradient-stops))] from-gold-500 via-transparent to-transparent pointer-events-none" />
        
        <div className="max-w-[1200px] mx-auto px-6 w-full flex flex-col md:flex-row items-center gap-16 relative z-10">
          <div className="flex-1 w-full relative animate-fade-in-up">
             {/* 3D Visualization Abstract */}
             <div className="relative aspect-square max-w-md mx-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-forest-800 to-forest-950 rounded-full border border-white/10 shadow-[0_0_60px_rgba(200,150,102,0.15)] animate-pulse-glow" />
                {/* Inner SMPL Mesh Representation */}
                <div className="absolute inset-[20%] rounded-full border border-gold-500/30 bg-gold-500/5 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  <div className="w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(200,150,102,0.1)_50%,transparent_75%)] bg-[length:200%_200%] animate-shimmer-slow" />
                  <span className="absolute text-gold-300/50 font-display text-sm uppercase tracking-[0.2em] font-semibold text-center">SMPL Body Mesh<br/><span className="text-[10px] normal-case">(Inner Layer)</span></span>
                </div>
                {/* Outer Parametric Garment Representation */}
                <div className="absolute inset-[10%] rounded-full border-2 border-dashed border-white/20 animate-[spin_60s_linear_infinite]" />
                <div className="absolute inset-[5%] rounded-[40%] border border-white/10 rotate-45 pointer-events-none" />
                <span className="absolute bottom-8 left-0 right-0 text-white/60 font-display text-sm uppercase tracking-[0.2em] font-semibold text-center pointer-events-none">
                  Parametric Garment<br/><span className="text-[10px] normal-case">(Outer Shell)</span>
                </span>
             </div>
          </div>
          
          <div className="flex-1 flex flex-col items-start gap-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-400 text-sm font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>
              Dual-Layer 3D Architecture
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-white leading-tight">
              True-to-Life <br/><span className="text-gold-400">Parametric Fit</span>
            </h2>
            <p className="text-forest-100/80 text-lg leading-relaxed max-w-lg">
              Our advanced 3D engine generates two separate layers. First, a highly accurate <strong>SMPL body mesh</strong> based on your unique measurements. Next, an intelligent <strong>parametric garment shell</strong> is draped on top.
            </p>
            <ul className="flex flex-col gap-4 mt-2">
              <li className="flex items-start gap-3">
                <div className="mt-1 w-5 h-5 rounded-full bg-gold-500/20 flex items-center justify-center text-gold-400 shrink-0">✓</div>
                <p className="text-sm text-forest-100/90">Garment offset adapts to body shape—never looks artificially skin-tight.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 w-5 h-5 rounded-full bg-gold-500/20 flex items-center justify-center text-gold-400 shrink-0">✓</div>
                <p className="text-sm text-forest-100/90">Scales automatically with SMPL beta values for accurate geometric approximation.</p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── LangGraph AI Recommendation Section ── */}
      <section className="py-24 bg-white relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-6 w-full flex flex-col-reverse md:flex-row items-center gap-16">
          
          <div className="flex-1 flex flex-col items-start gap-6 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-forest-900/20 bg-forest-50 text-forest-900 text-sm font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Powered by LangGraph &amp; GPT-4o
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-forest-950 leading-tight">
              An AI Agent That <br/><span className="text-gold-600">Thinks Like a Stylist</span>
            </h2>
            <p className="text-forest-700/80 text-lg leading-relaxed max-w-lg">
              We don&apos;t just guess your size. Our autonomous LangGraph agent queries thousands of products via <strong>pgvector RAG</strong>, cross-checks numerical size charts, and reasons over fit quality.
            </p>
            
            <div className="mt-4 p-5 bg-forest-50 border border-forest-100 rounded-2xl w-full max-w-lg shadow-soft hover:shadow-lift hover:-translate-y-1 transition-all duration-300">
              <p className="text-sm font-semibold text-forest-900 mb-2">AI Reasoning Trace:</p>
              <div className="flex flex-col gap-2 font-mono text-xs text-forest-700">
                <div className="flex gap-2 items-center"><span className="text-green-600">●</span> <span>Querying pgvector for matching silhouettes...</span></div>
                <div className="flex gap-2 items-center"><span className="text-green-600">●</span> <span>Analyzing user waist (82cm) vs Size M (80-84cm)...</span></div>
                <div className="flex gap-2 items-center"><span className="text-green-600">●</span> <span>Evaluating fabric stretch constraint (Cotton/Spandex)...</span></div>
                <div className="flex gap-2 items-center"><span className="text-gold-600">★</span> <span className="font-semibold text-forest-900">Recommendation Generated: Size M</span></div>
              </div>
            </div>
          </div>

          <div className="flex-1 w-full flex justify-center animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <div className="relative w-full max-w-sm">
              <div className="absolute inset-0 bg-gold-500/20 blur-[80px] rounded-full" />
              {/* App UI mockup instead of stock photo */}
              <div className="relative z-10 w-full aspect-[4/5] rounded-[2.5rem] shadow-card border border-forest-100 overflow-hidden bg-white flex flex-col">
                <div className="bg-forest-900 text-white px-5 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gold-500/20 flex items-center justify-center text-gold-400">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.38 3.46 16 2a8.5 8.5 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
                  </div>
                  <div>
                    <p className="text-xs text-forest-100/60 font-medium">Manikan AI</p>
                    <p className="text-sm font-semibold">Size Recommendation</p>
                  </div>
                </div>
                <div className="flex-1 p-5 flex flex-col gap-4 bg-cream-50/50">
                  <div className="bg-white rounded-2xl p-4 shadow-soft border border-forest-100">
                    <p className="text-[10px] uppercase tracking-widest text-forest-700/50 font-bold mb-2">Your Measurements</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[["Chest","92 cm"],["Waist","82 cm"],["Hip","98 cm"],["Height","175 cm"]].map(([k,v]) => (
                        <div key={k}>
                          <p className="text-[10px] text-forest-700/50">{k}</p>
                          <p className="text-sm font-semibold text-forest-900">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gold-500 rounded-2xl p-4 text-center shadow-soft">
                    <p className="text-[10px] uppercase tracking-widest text-forest-950/70 font-bold mb-1">Recommended Size</p>
                    <p className="text-4xl font-display font-bold text-forest-950">M</p>
                    <p className="text-xs text-forest-950/60 mt-1">97% confidence</p>
                  </div>
                  <div className="bg-white rounded-2xl p-4 shadow-soft border border-forest-100">
                    <p className="text-[10px] uppercase tracking-widest text-forest-700/50 font-bold mb-1">AI Note</p>
                    <p className="text-xs text-forest-700/80 leading-relaxed">Your waist (82cm) fits perfectly within the M range. The relaxed cotton blend allows comfortable movement.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials / Social Proof ── */}
      <section className="py-24 bg-cream-50 border-y border-forest-900/5">
        <div className="max-w-[1200px] mx-auto px-6 w-full">
          <div className="text-center mb-14 animate-fade-in-up">
            <span className="text-sm font-bold uppercase tracking-widest text-gold-600 mb-3 block">What People Say</span>
            <h2 className="font-display text-4xl font-semibold text-forest-950">Shoppers Love the Fit</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Nour A.", role: "Fashion Enthusiast", quote: "I used to return 3 out of every 5 orders. Since using Manikan's size assistant, I haven't returned a single item. The accuracy is unreal.", stars: 5 },
              { name: "Karim M.", role: "Online Shopper", quote: "The virtual try-on actually shows the fabric and color — not just a floating flat image. It genuinely helped me visualize how it'd look on my body.", stars: 5 },
              { name: "Sara H.", role: "Lifestyle Blogger", quote: "Finally an AI that understands my body type. It recommended a size I'd never tried before and it fit perfectly. Absolute game changer.", stars: 5 },
            ].map(({ name, role, quote, stars }, i) => (
              <div key={name} className="bg-white rounded-2xl p-7 shadow-soft border border-forest-100 hover:shadow-lift hover:-translate-y-1 transition-all duration-300 animate-fade-in-up flex flex-col gap-4" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="flex gap-1">
                  {[...Array(stars)].map((_, s) => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill="#C89666" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ))}
                </div>
                <p className="text-sm text-forest-700/80 leading-relaxed flex-1">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3 pt-3 border-t border-forest-100">
                  <div className="w-9 h-9 rounded-full bg-forest-100 flex items-center justify-center font-display text-sm font-semibold text-forest-700">
                    {name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-forest-950">{name}</p>
                    <p className="text-xs text-forest-700/50">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Telegram Bot Section ── */}
      <section className="py-24 bg-forest-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] bg-blue-500/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[35%] h-[50%] bg-gold-500/20 rounded-full blur-[100px]" />
        </div>
        <div className="max-w-[1200px] mx-auto px-6 w-full flex flex-col md:flex-row items-center gap-16 relative z-10">
          {/* Telegram chat mockup */}
          <div className="flex-1 w-full flex justify-center animate-fade-in-up">
            <div className="relative w-full max-w-xs">
              <div className="absolute inset-0 bg-blue-500/10 blur-[60px] rounded-full" />
              <div className="relative z-10 bg-[#17212b] rounded-3xl overflow-hidden shadow-2xl border border-white/5">
                {/* Telegram header */}
                <div className="flex items-center gap-3 px-4 py-3.5 bg-[#1c2733] border-b border-white/5">
                  <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.93c-.12.56-.45.7-.92.44l-2.55-1.88-1.23 1.18c-.14.13-.26.25-.53.25l.18-2.62 4.74-4.28c.21-.19-.04-.29-.31-.1L7.84 14.48 5.33 13.7c-.55-.17-.56-.55.12-.82l9.06-3.49c.46-.17.86.1.13.41z"/></svg>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">@ManikanBot</p>
                    <p className="text-white/40 text-xs">Virtual Try-On Assistant</p>
                  </div>
                </div>
                {/* Chat messages */}
                <div className="p-4 flex flex-col gap-3 min-h-[280px]">
                  <div className="flex justify-start">
                    <div className="bg-[#1c2733] border border-white/5 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%]">
                      <p className="text-white/80 text-sm">Welcome back, Nour! 👋<br/>You have <strong>4</strong> credits this month.<br/><br/>Send me your photo 📸</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-[#2b5278] rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[70%]">
                      <p className="text-white text-xs text-right opacity-60 mb-1">📷 photo.jpg</p>
                      <p className="text-white/80 text-sm">Here&apos;s my photo!</p>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-[#1c2733] border border-white/5 rounded-2xl rounded-tl-sm px-4 py-2.5">
                      <p className="text-white/80 text-sm">Pick the clothing category 👇</p>
                      <div className="flex flex-col gap-1.5 mt-2">
                        {["Blouse","Shirt","Jacket"].map(c => (
                          <div key={c} className="border border-blue-500/40 rounded-lg px-3 py-1.5 text-center text-xs text-blue-300 font-medium">{c}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-[#2b5278] rounded-2xl rounded-tr-sm px-4 py-2.5">
                      <p className="text-white/80 text-sm">Generating your look... ⏳</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-start gap-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.93c-.12.56-.45.7-.92.44l-2.55-1.88-1.23 1.18c-.14.13-.26.25-.53.25l.18-2.62 4.74-4.28c.21-.19-.04-.29-.31-.1L7.84 14.48 5.33 13.7c-.55-.17-.56-.55.12-.82l9.06-3.49c.46-.17.86.1.13.41z"/></svg>
              Also on Telegram
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-white leading-tight">
              Virtual Try-On,<br/><span className="text-blue-300">Right in Telegram</span>
            </h2>
            <p className="text-forest-100/80 text-lg leading-relaxed max-w-lg">
              Don&apos;t want to open a browser? Our Manikan Telegram Bot lets you try on clothes from any chat. Link your account once and get AI-generated try-on results without ever leaving Telegram.
            </p>
            <ul className="flex flex-col gap-4 mt-2">
              {[
                ["Account linking", "Link your Manikan ID once — recognized automatically on every visit."],
                ["Monthly credits", "Free generations every month. Buy more credits anytime."],
                ["6 garment categories", "Blouse, shirt, jacket, pants, skirt, dress — pick and try instantly."],
                ["Credit-safe", "Credits are only deducted on a successful result, never on failures."],
              ].map(([title, desc]) => (
                <li key={title} className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 shrink-0 text-xs">✓</div>
                  <p className="text-sm text-forest-100/90"><strong>{title}</strong> — {desc}</p>
                </li>
              ))}
            </ul>
            <a
              href="https://t.me/ManikanBot"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2.5 px-7 py-3.5 bg-blue-500 text-white rounded-2xl font-semibold hover:bg-blue-400 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(59,130,246,0.4)]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.93c-.12.56-.45.7-.92.44l-2.55-1.88-1.23 1.18c-.14.13-.26.25-.53.25l.18-2.62 4.74-4.28c.21-.19-.04-.29-.31-.1L7.84 14.48 5.33 13.7c-.55-.17-.56-.55.12-.82l9.06-3.49c.46-.17.86.1.13.41z"/></svg>
              Open @ManikanBot
            </a>
          </div>
        </div>
      </section>

      {/* ── B2B Teaser (shortened) ── */}
      <section className="py-20 bg-forest-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_80%_20%,_var(--tw-gradient-stops))] from-gold-500/40 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 w-full flex flex-col md:flex-row items-center justify-between gap-8 relative z-10 animate-fade-in-up">
          <div className="flex flex-col gap-3 max-w-xl">
            <span className="text-gold-500 font-bold uppercase tracking-widest text-sm">For Retailers</span>
            <h2 className="font-display text-3xl md:text-4xl font-semibold leading-tight">
              Add AI Try-On to your store in under 10 minutes.
            </h2>
            <p className="text-forest-100/70 text-base leading-relaxed">
              One HTML script tag. No engineering changes. Works on Shopify, WooCommerce, and any custom storefront.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 shrink-0">
            <Link href="/business" className="px-8 py-4 bg-gold-500 text-forest-950 rounded-2xl font-semibold hover:bg-gold-400 transition-all duration-300 hover:-translate-y-1 text-center">
              Learn More
            </Link>
            <Link href="/business#request-demo" className="px-8 py-4 border border-white/20 text-white rounded-2xl font-medium hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 text-center">
              Request a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Privacy & Security Guarantee ── */}
      <section className="py-16 bg-gold-50 border-t border-gold-500/10">
        <div className="max-w-[800px] mx-auto px-6 w-full text-center animate-fade-in-up">
          <div className="w-12 h-12 mx-auto bg-gold-500/20 text-gold-600 rounded-full flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h3 className="font-display text-2xl font-semibold text-forest-950 mb-3">Your Privacy is Uncompromised</h3>
          <p className="text-forest-700/80 text-sm leading-relaxed">
            Shopper photos are processed entirely in-memory and deleted immediately via API after the try-on inference is complete. <strong>We never log, store, or train our models on raw user photos.</strong>
          </p>
        </div>
      </section>

    </div>
  );
}
