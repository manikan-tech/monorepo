"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProductCard from "../components/ProductCard";

export default function Home() {
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dynamically fetch 4 products from the backend for the New Arrivals section
    fetch("/api/products?limit=4")
      .then((res) => res.json())
      .then((data) => {
        setFeaturedProducts(data.products || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Hero Section ── */}
      <section className="relative w-full min-h-[85vh] flex items-center overflow-hidden bg-forest-950">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[70%] bg-gold-500/30 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[80%] bg-forest-500/30 rounded-full blur-[150px] animate-float" style={{ animationDelay: "2s" }} />
        </div>

        <div className="relative z-10 max-w-[1200px] mx-auto px-6 w-full flex flex-col md:flex-row items-center gap-12">
          
          {/* Left Text Block */}
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
          
          {/* Right Visual Animation Block */}
          <div className="flex-1 w-full relative animate-fade-in-up" style={{ animationDelay: "400ms" }}>
             <div className="relative w-full aspect-[4/5] max-w-md mx-auto pointer-events-none">
               <div className="absolute inset-0 bg-gradient-to-tr from-forest-800 to-forest-900 rounded-[2.5rem] border border-white/10 shadow-[0_20px_50px_rgba(10,34,41,0.5)] overflow-hidden">
                 <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_50%,_var(--tw-gradient-stops))] from-gold-500/20 via-transparent to-transparent animate-pulse-glow" />
                 <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-forest-950 to-transparent z-10" />
                 
                 {/* Virtual Try-On Scanning Animation */}
                 <div className="absolute top-1/4 inset-x-8 h-[2px] bg-gold-400 shadow-[0_0_15px_rgba(200,150,102,0.8)] z-20 animate-scan" />
                 
                 <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4">
                   <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="rgba(200,150,102,0.3)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                     <path d="M20.38 3.46 16 2a8.5 8.5 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
                   </svg>
                   <span className="text-gold-500/50 text-xs font-bold uppercase tracking-widest animate-pulse">Initializing Body Scan...</span>
                 </div>
               </div>
               
               {/* Floating Stats */}
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
              <span className="text-forest-950 text-sm md:text-base font-bold uppercase tracking-widest">Sustainable Choices</span>
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
              <span className="font-display text-5xl font-semibold text-forest-950">Zero</span>
              <span className="text-sm font-bold uppercase tracking-widest text-forest-900">Engineering</span>
              <p className="text-xs text-forest-700/70 leading-relaxed mt-1">Integration effort. Embed the Manikan widget with a single HTML script tag.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured Products (Dynamically Fetched from Backend) ── */}
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

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="aspect-[3/4] bg-forest-50 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product, i) => (
              <div key={product.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-forest-700/60 bg-forest-50 rounded-2xl">
            Check back soon for new arrivals.
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
        {/* Decorative background circle */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-white rounded-full blur-[100px] opacity-40 -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="max-w-[1200px] mx-auto px-6 w-full text-center relative z-10">
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-forest-950 mb-16">How Manikan Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center gap-5 group animate-fade-in-up" style={{ animationDelay: "100ms" }}>
              <div className="w-20 h-20 rounded-3xl bg-white border border-forest-100 shadow-soft flex items-center justify-center text-gold-500 group-hover:scale-110 group-hover:shadow-lift transition-all duration-500">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4v16M8 8h8M8 16h8" />
                </svg>
              </div>
              <h3 className="font-display text-2xl font-semibold text-forest-950">1. AI Body Scan</h3>
              <p className="text-forest-700/80 text-sm leading-relaxed max-w-xs">Upload a single photo and our AI instantly extracts your precise 3D body measurements with near-perfect accuracy.</p>
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
              Powered by LangGraph & GPT-4o
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-forest-950 leading-tight">
              An AI Agent That <br/><span className="text-gold-600">Thinks Like a Stylist</span>
            </h2>
            <p className="text-forest-700/80 text-lg leading-relaxed max-w-lg">
              We don't just guess your size. Our autonomous LangGraph agent queries thousands of products via <strong>pgvector RAG</strong>, cross-checks numerical size charts, and reasons over fit quality.
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
                <img src="https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=2940&auto=format&fit=crop" alt="Fashion AI" className="relative z-10 w-full aspect-[4/5] object-cover rounded-[2.5rem] shadow-card" />
                
                {/* Floating UI Card */}
                <div className="absolute -left-12 bottom-12 z-20 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lift border border-white/40 animate-float">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-forest-900 flex items-center justify-center text-white">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                    </div>
                    <div>
                      <p className="text-xs text-forest-700 font-semibold uppercase tracking-wider">Recommended</p>
                      <p className="text-xl font-display font-bold text-forest-950">Size Medium</p>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* ── B2B Developer Integration Section ── */}
      <section className="py-24 bg-forest-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_80%_20%,_var(--tw-gradient-stops))] from-gold-500/40 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 w-full flex flex-col md:flex-row items-center gap-16 relative z-10">
          
          <div className="flex-1 flex flex-col items-start gap-6 animate-fade-in-up">
            <span className="text-gold-500 font-bold uppercase tracking-widest text-sm">For Retailers</span>
            <h2 className="font-display text-4xl md:text-5xl font-semibold leading-tight">
              One Line of Code.<br />Zero Engineering.
            </h2>
            <p className="text-forest-100/80 text-lg leading-relaxed max-w-lg">
              Manikan is a standalone React bundle that embeds seamlessly into Shopify, WooCommerce, or any custom storefront. Drop in our script tag and instantly offer AI Virtual Try-On to your customers.
            </p>
            <div className="flex gap-4 mt-4">
              <Link href="/dashboard" className="px-8 py-3 bg-white text-forest-950 rounded-xl font-semibold hover:bg-forest-50 transition-colors">
                Access Dashboard
              </Link>
              <Link href="/business#how-it-works" className="px-8 py-3 border border-white/20 text-white rounded-xl font-medium hover:bg-white/10 transition-colors">
                How It Works
              </Link>
            </div>
          </div>

          <div className="flex-1 w-full animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <div className="w-full rounded-2xl bg-[#0d1117] border border-white/10 overflow-hidden shadow-2xl hover:shadow-[0_0_40px_rgba(200,150,102,0.1)] hover:-translate-y-1 transition-all duration-300 group">
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
                    <span className="text-[#ff7b72]">&lt;!-- Manikan AI Widget --&gt;</span><br/>
                    <span className="text-[#7ee787]">&lt;script</span> <span className="text-[#79c0ff]">src=</span><span className="text-[#a5d6ff]">"https://cdn.manikan.io/widget.js"</span><br/>
                    <span className="text-[#79c0ff]">        data-retailer-id=</span><span className="text-[#a5d6ff]">"ret_8f92jK"</span><br/>
                    <span className="text-[#79c0ff]">        data-product-id=</span><span className="text-[#a5d6ff]">"prod_44mA2"</span><span className="text-[#7ee787]">&gt;</span><br/>
                    <span className="text-[#7ee787]">&lt;/script&gt;</span><br/>
                  </code>
                </pre>
              </div>
            </div>
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
