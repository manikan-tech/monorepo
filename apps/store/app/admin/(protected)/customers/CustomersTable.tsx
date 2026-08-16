"use client";

import React, { useState } from "react";
import Link from "next/link";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  createdAt: string | Date;
  _count: {
    orders: number;
    reviews: number;
    sessions: number;
  };
  orders?: {
    id: string;
    totalEgp: number;
    createdAt: string | Date;
    status: string;
    items: {
      product: {
        retailer: {
          storeName: string;
        }
      }
    }[]
  }[];
};

export default function CustomersTable({
  initialCustomers,
}: {
  initialCustomers: Customer[];
}) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const filteredCustomers = customers.filter(c => 
    c.email.toLowerCase().includes(search.toLowerCase()) || 
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE) || 1;
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center animate-fade-up">
        <div className="relative w-full max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search customers by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 bg-white border border-manikan-border rounded-lg text-sm focus:outline-none focus:border-gold-500 transition-colors shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-manikan-border overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-forest-50/50 text-forest-800 text-sm font-medium border-b border-manikan-border">
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-center">Orders</th>
                <th className="px-6 py-4 text-center">Sessions</th>
                <th className="px-6 py-4 text-center">Reviews</th>
                <th className="px-6 py-4 text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-manikan-border">
              {paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-forest-700/50">
                    No customers found matching "{search}"
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer, idx) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-cream-50/30 transition-colors group animate-fade-up"
                    style={{ animationDelay: `${100 + idx * 50}ms`, animationFillMode: "both" }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-gold-800 font-semibold text-sm">
                          {customer.firstName[0]}{customer.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-forest-900">
                            {customer.firstName} {customer.lastName}
                          </p>
                          <p className="text-xs text-manikan-text-secondary font-mono mt-0.5">
                            ID: {customer.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-forest-800">{customer.email}</p>
                      {customer.phone && <p className="text-xs text-forest-700/60 mt-0.5">{customer.phone}</p>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-forest-50 text-forest-800 font-medium text-sm">
                        {customer._count.orders}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-800 font-medium text-sm">
                        {customer._count.sessions}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-50 text-amber-800 font-medium text-sm">
                        {customer._count.reviews}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-forest-700/60">
                      {new Date(customer.createdAt).toLocaleDateString("en", {
                        day: "numeric", month: "short", year: "numeric"
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-manikan-border bg-cream-50/30 flex items-center justify-between text-sm text-manikan-text-secondary">
            <div>
              Showing <span className="font-medium text-forest-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-forest-900">{Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)}</span> of <span className="font-medium text-forest-900">{filteredCustomers.length}</span> customers
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <span className="px-2 font-medium text-forest-900">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded border border-manikan-border hover:bg-white disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
