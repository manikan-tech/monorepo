import React from "react";
import Link from "next/link";
import { getCustomerFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import { updateProfile } from "./actions";

export default async function EditProfilePage() {
  const customerAuth = await getCustomerFromCookies();

  if (!customerAuth) {
    redirect("/login");
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerAuth.sub },
  });

  if (!customer) {
    redirect("/login");
  }

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12 md:py-20 w-full animate-fade-in-up">
      <div className="mb-8">
        <Link href="/account" className="text-sm font-medium text-forest-700 hover:text-forest-950 flex items-center gap-2 mb-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back to Account
        </Link>
        <h1 className="font-display text-4xl font-semibold text-forest-950">Edit Profile</h1>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-forest-900/5 shadow-soft">
        <form action={updateProfile} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="firstName" className="block text-sm font-medium text-forest-900">
                First Name
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                defaultValue={customer.firstName}
                required
                className="w-full px-4 py-3 rounded-xl border border-forest-200 bg-forest-50/50 focus:bg-white focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900 outline-none transition-all text-forest-950"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastName" className="block text-sm font-medium text-forest-900">
                Last Name
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                defaultValue={customer.lastName}
                required
                className="w-full px-4 py-3 rounded-xl border border-forest-200 bg-forest-50/50 focus:bg-white focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900 outline-none transition-all text-forest-950"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-forest-900">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              defaultValue={customer.email}
              disabled
              className="w-full px-4 py-3 rounded-xl border border-forest-100 bg-forest-50 text-forest-900/50 cursor-not-allowed"
            />
            <p className="text-xs text-forest-700/60 mt-1">Email address cannot be changed.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="phone" className="block text-sm font-medium text-forest-900">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              defaultValue={customer.phone || ""}
              placeholder="+201000000000"
              className="w-full px-4 py-3 rounded-xl border border-forest-200 bg-forest-50/50 focus:bg-white focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900 outline-none transition-all text-forest-950"
            />
          </div>

          <div className="pt-6 border-t border-forest-900/5 flex justify-end gap-4">
            <Link 
              href="/account"
              className="px-6 py-3 rounded-xl font-medium text-sm text-forest-800 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              Cancel
            </Link>
            <button 
              type="submit"
              className="px-8 py-3 rounded-xl font-medium text-sm text-white bg-forest-900 hover:bg-forest-800 shadow-soft transition-all active:scale-[0.98]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
