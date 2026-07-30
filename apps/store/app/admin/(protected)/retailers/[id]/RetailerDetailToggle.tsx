"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RetailerDetailToggle({ 
  retailerId, 
  isActivated 
}: { 
  retailerId: string; 
  isActivated: boolean;
}) {
  const [toggling, setToggling] = useState(false);
  const router = useRouter();

  async function toggleActivation() {
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/retailers/${retailerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActivated: !isActivated }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update retailer");
      }

      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {toggling && <span className="text-xs text-forest-400 animate-pulse">Updating...</span>}
      <button
        onClick={toggleActivation}
        disabled={toggling}
        className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
          isActivated
            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
            : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isActivated ? "bg-green-500" : "bg-red-400"
          }`}
        />
        {isActivated ? "Active" : "Inactive"}
      </button>
    </div>
  );
}
