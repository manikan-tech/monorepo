import React from "react";
import { prisma } from "../../../lib/prisma";

export default async function AdminBotPurchasesPage() {
  const purchases = await prisma.botPurchase.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      plan: true,
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Telegram Bot Purchases</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Purchase History</h2>
          <span className="text-sm text-gray-500 font-medium">Total: {purchases.length}</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Credits Added</th>
                <th className="px-6 py-3 font-medium">Amount Paid</th>
                <th className="px-6 py-3 font-medium text-right">Stripe Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No bot plans have been purchased yet.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {new Date(purchase.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{purchase.customer.firstName} {purchase.customer.lastName}</div>
                      <div className="text-xs text-gray-500">{purchase.customer.email}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {purchase.plan.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      +{purchase.plan.credits}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium">
                      EGP {(purchase.amountPaidCents / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 text-xs font-mono truncate max-w-[120px]" title={purchase.stripeSessionId}>
                      {purchase.stripeSessionId.slice(0, 15)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
