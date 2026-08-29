import React from "react";
import { prisma } from "../../../lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

async function createPlan(formData: FormData) {
  "use strict";
  "use server";
  
  const name = formData.get("name") as string;
  const credits = parseInt(formData.get("credits") as string, 10);
  const priceInCents = parseInt(formData.get("priceInCents") as string, 10);
  
  if (name && !isNaN(credits) && !isNaN(priceInCents)) {
    await prisma.botPlan.create({
      data: { name, credits, priceInCents, isActive: true },
    });
    revalidatePath("/admin/bot-plans");
  }
}

async function editPlan(formData: FormData) {
  "use strict";
  "use server";
  
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const credits = parseInt(formData.get("credits") as string, 10);
  const priceInCents = parseInt(formData.get("priceInCents") as string, 10);
  
  if (id && name && !isNaN(credits) && !isNaN(priceInCents)) {
    await prisma.botPlan.update({
      where: { id },
      data: { name, credits, priceInCents },
    });
    revalidatePath("/admin/bot-plans");
    redirect("/admin/bot-plans");
  }
}

async function togglePlan(formData: FormData) {
  "use strict";
  "use server";

  const id = formData.get("id") as string;
  const isActive = formData.get("isActive") === "true";

  if (id) {
    await prisma.botPlan.update({
      where: { id },
      data: { isActive: !isActive },
    });
    revalidatePath("/admin/bot-plans");
  }
}

export default async function AdminBotPlansPage(props: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const resolvedSearchParams = await props.searchParams;
  const plans = await prisma.botPlan.findMany({
    orderBy: { priceInCents: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Telegram Bot Plans</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900">Create New Plan</h2>
        </div>
        <div className="p-6">
          <form action={createPlan} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name</label>
              <input required type="text" name="name" placeholder="e.g. Pro Plan" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-forest-500" />
            </div>
            <div className="w-full md:w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">Credits</label>
              <input required type="number" name="credits" placeholder="100" min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-forest-500" />
            </div>
            <div className="w-full md:w-40">
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (Cents)</label>
              <input required type="number" name="priceInCents" placeholder="500 for $5.00" min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-forest-500" />
            </div>
            <button type="submit" className="w-full md:w-auto px-6 py-2 bg-forest-900 text-white font-medium rounded-lg hover:bg-forest-800 transition-colors">
              Create
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900">Existing Plans</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">Plan Name</th>
                <th className="px-6 py-3 font-medium">Credits</th>
                <th className="px-6 py-3 font-medium">Price</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No bot plans created yet.
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  resolvedSearchParams.edit === plan.id ? (
                    <tr key={plan.id} className="bg-blue-50/30">
                      <td colSpan={5} className="p-0">
                        <form action={editPlan} className="flex items-center w-full p-4 gap-4">
                          <input type="hidden" name="id" value={plan.id} />
                          <div className="flex-1">
                            <input required type="text" name="name" defaultValue={plan.name} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-forest-500" />
                          </div>
                          <div className="w-24">
                            <input required type="number" name="credits" defaultValue={plan.credits} min="1" className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-forest-500" />
                          </div>
                          <div className="w-28">
                            <input required type="number" name="priceInCents" defaultValue={plan.priceInCents} min="1" className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-forest-500" />
                          </div>
                          <div className="w-20 px-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${plan.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                              {plan.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-3 px-2">
                            <Link href="/admin/bot-plans" className="text-sm font-medium text-gray-500 hover:text-gray-700">Cancel</Link>
                            <button type="submit" className="text-sm font-medium text-blue-600 hover:text-blue-800">Save</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={plan.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 font-medium text-gray-900">{plan.name}</td>
                      <td className="px-6 py-4 text-gray-600">{plan.credits}</td>
                      <td className="px-6 py-4 text-gray-600">EGP {(plan.priceInCents / 100).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${plan.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                          {plan.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                        <Link href={`/admin/bot-plans?edit=${plan.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-900">
                          Edit
                        </Link>
                        <form action={togglePlan}>
                          <input type="hidden" name="id" value={plan.id} />
                          <input type="hidden" name="isActive" value={plan.isActive ? "true" : "false"} />
                          <button type="submit" className={`text-sm font-medium ${plan.isActive ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"}`}>
                            {plan.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  )
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
