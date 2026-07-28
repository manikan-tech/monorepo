"use client";

import { useState } from "react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate API call
    setTimeout(() => {
      setSubmitted(true);
    }, 800);
  };

  return (
    <div className="min-h-[80vh] py-20 px-6 bg-cream-50">
      <div className="max-w-[800px] mx-auto">
        <div className="text-center mb-12 animate-fade-in-up">
          <h1 className="font-display text-4xl font-semibold text-forest-950 mb-4">Contact Us</h1>
          <p className="text-forest-700/80">Have questions about an order or our virtual try-on? We're here to help.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-soft p-8 md:p-10 border border-forest-100 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          {submitted ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <h2 className="font-display text-2xl font-semibold text-forest-950 mb-2">Message Sent</h2>
              <p className="text-forest-700/80 mb-6">Thank you for reaching out. Our support team will get back to you within 24 hours.</p>
              <button 
                onClick={() => setSubmitted(false)}
                className="text-gold-600 font-medium hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label htmlFor="name" className="text-sm font-medium text-forest-900">Full Name</label>
                  <input required type="text" id="name" className="px-4 py-3 rounded-xl border border-forest-200 focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500 bg-forest-50/50" placeholder="Jane Doe" />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="email" className="text-sm font-medium text-forest-900">Email Address</label>
                  <input required type="email" id="email" className="px-4 py-3 rounded-xl border border-forest-200 focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500 bg-forest-50/50" placeholder="jane@example.com" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="subject" className="text-sm font-medium text-forest-900">Subject</label>
                <select id="subject" className="px-4 py-3 rounded-xl border border-forest-200 focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500 bg-forest-50/50">
                  <option>Order Status / Tracking</option>
                  <option>Returns & Refunds</option>
                  <option>Virtual Try-On Issue</option>
                  <option>Retailer Integration</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="message" className="text-sm font-medium text-forest-900">Message</label>
                <textarea required id="message" rows={6} className="px-4 py-3 rounded-xl border border-forest-200 focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500 bg-forest-50/50 resize-none" placeholder="How can we help you?"></textarea>
              </div>

              <button type="submit" className="w-full py-4 bg-forest-900 text-white rounded-xl font-medium hover:bg-forest-800 transition-colors shadow-soft hover:shadow-lift hover:-translate-y-0.5 mt-2">
                Send Message
              </button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-center animate-fade-in-up" style={{ animationDelay: "200ms" }}>
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-gold-50 text-gold-600 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h3 className="font-medium text-forest-900">Email</h3>
            <p className="text-sm text-forest-700/80">support@manikan.io</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-gold-50 text-gold-600 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </div>
            <h3 className="font-medium text-forest-900">Phone</h3>
            <p className="text-sm text-forest-700/80">+20 (123) 456-7890</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-gold-50 text-gold-600 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <h3 className="font-medium text-forest-900">Office</h3>
            <p className="text-sm text-forest-700/80">Cairo, Egypt</p>
          </div>
        </div>
      </div>
    </div>
  );
}
