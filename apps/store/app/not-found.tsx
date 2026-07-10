import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center bg-cream-50 px-6">
      <div className="text-center animate-fade-in-up">
        <h1 className="font-display text-9xl font-bold text-forest-950/10 mb-4">404</h1>
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-forest-950 mb-4">Page Not Found</h2>
        <p className="text-forest-700/80 mb-8 max-w-md mx-auto">
          The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>
        <Link 
          href="/store" 
          className="inline-flex items-center justify-center px-8 py-4 bg-forest-900 text-white rounded-xl font-medium hover:bg-forest-800 transition-colors shadow-soft hover:shadow-lift hover:-translate-y-0.5"
        >
          Return to Store
        </Link>
      </div>
    </div>
  );
}
