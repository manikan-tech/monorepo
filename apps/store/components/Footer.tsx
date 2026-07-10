"use client";

import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-forest-950 text-cream-50 pt-16 pb-8 border-t-[4px] border-gold-500">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand Col */}
          <div className="col-span-1 md:col-span-1 flex flex-col gap-4">
            <Link href="/" className="relative w-32 h-10 transition-transform duration-300 hover:scale-105 hover:-translate-y-0.5 inline-block">
              <Image 
                src="/logo.png" 
                alt="Manikan Logo" 
                fill 
                sizes="128px"
                className="object-contain object-left brightness-0 invert" 
              />
            </Link>
            <p className="font-sans text-sm text-cream-200 leading-relaxed max-w-[280px] mt-2">
              The next generation of 3D virtual try-ons and highly accurate body modeling for fashion e-commerce.
            </p>
          </div>

          {/* Links Col 1 */}
          <div className="flex flex-col gap-4">
            <h4 className="font-display text-lg font-semibold text-gold-400">Platform</h4>
            <Link href="/store" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Demo Store</Link>
            <Link href="/size" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Size Recommendation</Link>
            <Link href="/visualize" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Virtual Try-On</Link>
            <Link href="/wardrobe" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">My Wardrobe</Link>
          </div>

          {/* Links Col 2 */}
          <div className="flex flex-col gap-4">
            <h4 className="font-display text-lg font-semibold text-gold-400">Business</h4>
            <Link href="/business" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">B2B Integration</Link>
            <Link href="/pricing" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Pricing Plans</Link>
            <Link href="/engine" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Widget Engine</Link>
            <Link href="/contact" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Contact Sales</Link>
          </div>

          {/* Links Col 3 */}
          <div className="flex flex-col gap-4">
            <h4 className="font-display text-lg font-semibold text-gold-400">Legal</h4>
            <Link href="/legal/terms" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Terms of Service</Link>
            <Link href="/legal/privacy" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Privacy Policy</Link>
            <Link href="/legal/refund" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Return Policy</Link>
            <Link href="/legal/shipping" className="font-sans text-sm text-cream-200 hover:text-gold-400 transition-colors duration-300 hover:translate-x-1 inline-flex">Shipping Policy</Link>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-forest-800 gap-4">
          <p className="font-sans text-sm text-forest-300">
            &copy; {currentYear} Manikan Tech. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="font-sans text-sm text-forest-300 hover:text-gold-400 transition-colors duration-300 hover:-translate-y-0.5 inline-flex">LinkedIn</a>
            <a href="#" className="font-sans text-sm text-forest-300 hover:text-gold-400 transition-colors duration-300 hover:-translate-y-0.5 inline-flex">Twitter</a>
            <a href="#" className="font-sans text-sm text-forest-300 hover:text-gold-400 transition-colors duration-300 hover:-translate-y-0.5 inline-flex">Instagram</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
