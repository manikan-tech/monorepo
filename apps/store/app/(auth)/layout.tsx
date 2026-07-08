import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manikan — Authentication",
  description:
    "Sign in or create your Manikan retailer account to access AI-powered virtual try-on and size recommendation tools.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center justify-center min-h-[calc(100vh-80px)] p-6 bg-[#F3F7F7] section-pattern overflow-hidden">
      {/* ─── Ambient Background Blobs ────────────────────── */}
      <div className="absolute top-[-5%] left-[-5%] w-[400px] h-[400px] rounded-full bg-forest-300 blur-3xl opacity-50 animate-float pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[350px] h-[350px] rounded-full bg-gold-200 blur-3xl opacity-50 animate-float pointer-events-none" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[20%] right-[-5%] w-[300px] h-[300px] rounded-full bg-cream-300 blur-3xl opacity-50 animate-float pointer-events-none" style={{ animationDelay: '4s' }} />
      
      <div className="relative z-10 flex flex-col md:flex-row w-full max-w-[1040px] glass rounded-[24px] shadow-lift card-hover overflow-hidden">
        {/* ─── Left: Form Panel ──────────────────────────── */}
        <div className="w-full md:w-1/2 p-8 sm:p-12 lg:p-16 flex items-center justify-center">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        {/* ─── Right: Hero Image Panel ───────────────────── */}
        <div className="hidden md:flex relative w-1/2 overflow-hidden items-end p-12">
          <div className="absolute inset-0 bg-[url('/auth-hero.png')] bg-cover bg-center animate-slow-zoom" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f202a]/90 via-[#0f202a]/40 to-transparent z-10" />
          <div className="relative z-20 max-w-[340px]">
            <h2 className="font-display text-[1.75rem] font-medium leading-snug text-white mb-3 tracking-tight">
              Precision in every{" "}
              <span className="text-gold-500 italic">dimension</span>.
            </h2>
            <p className="font-sans text-sm font-light leading-relaxed text-[#f8f7f4]/80">
              Experience the next generation of 3D virtual try-ons and body
              modeling.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
