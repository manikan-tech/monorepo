"use client";

import React, { useState } from "react";

export default function RecommendationSettingsForm({ initialSettings }: { initialSettings: any }) {
  const [strictness, setStrictness] = useState(initialSettings?.strictness || "medium");
  const [fallbackBehavior, setFallbackBehavior] = useState(initialSettings?.fallbackBehavior || "ask_measurements");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/retailer/recommendation-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { strictness, fallbackBehavior },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      setMessage("Settings saved successfully!");
    } catch (error: any) {
      console.error(error);
      setMessage("Error saving settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-card border border-manikan-border p-8">
      <h3 className="text-xl font-display font-semibold text-forest-900 mb-6">Algorithm Configuration</h3>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-forest-900 mb-2">
            Sizing Strictness
          </label>
          <select
            value={strictness}
            onChange={(e) => setStrictness(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
          >
            <option value="loose">Loose (Prioritize comfort, recommend larger sizes)</option>
            <option value="medium">Medium (Standard fit, balanced approach)</option>
            <option value="strict">Strict (True to size, recommend exact measurements)</option>
          </select>
          <p className="text-xs text-manikan-text-secondary mt-2">
            Determines how aggressively the AI rounds up or down when a shopper is between sizes.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-forest-900 mb-2">
            Fallback Behavior
          </label>
          <select
            value={fallbackBehavior}
            onChange={(e) => setFallbackBehavior(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-manikan-border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
          >
            <option value="ask_measurements">Ask for manual measurements</option>
            <option value="recommend_smaller">Recommend the smaller size</option>
            <option value="recommend_larger">Recommend the larger size</option>
            <option value="show_chart">Show size chart</option>
          </select>
          <p className="text-xs text-manikan-text-secondary mt-2">
            What the widget should do if the AI confidence score is too low.
          </p>
        </div>

        <div className="pt-4 border-t border-manikan-border">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Configuration"}
          </button>
          
          {message && (
            <p className={`mt-4 text-center text-sm ${message.includes("Error") ? "text-red-500" : "text-emerald-600"}`}>
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
