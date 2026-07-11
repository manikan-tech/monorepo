"use client";

import React, { useState } from "react";

export default function WidgetSettingsForm({ initialSettings }: { initialSettings: any }) {
  const [primaryColor, setPrimaryColor] = useState(initialSettings?.primaryColor || "#0b3b2c"); // forest-900
  const [secondaryColor, setSecondaryColor] = useState(initialSettings?.secondaryColor || "#f6f4ed"); // cream-50
  const [language, setLanguage] = useState(initialSettings?.language || "en");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/retailer/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            primaryColor,
            secondaryColor,
            language,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      setMessage("Settings saved successfully!");
    } catch (error: any) {
      setMessage(error.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-card border border-manikan-border p-8 max-w-2xl">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-forest-900 mb-2">Primary Color</label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-10 rounded border border-manikan-border cursor-pointer"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="flex-1 px-4 py-2 border border-manikan-border rounded-lg focus:ring-2 focus:ring-forest-400 focus:outline-none"
            />
          </div>
          <p className="text-sm text-manikan-text-secondary mt-1">Used for primary buttons and accents.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-forest-900 mb-2">Secondary Color</label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-10 w-10 rounded border border-manikan-border cursor-pointer"
            />
            <input
              type="text"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="flex-1 px-4 py-2 border border-manikan-border rounded-lg focus:ring-2 focus:ring-forest-400 focus:outline-none"
            />
          </div>
          <p className="text-sm text-manikan-text-secondary mt-1">Used for widget background and cards.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-forest-900 mb-2">Default Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-2 border border-manikan-border rounded-lg focus:ring-2 focus:ring-forest-400 focus:outline-none"
          >
            <option value="en">English (EN)</option>
            <option value="ar">Arabic (AR)</option>
            <option value="fr">French (FR)</option>
          </select>
        </div>

        {message && (
          <div className={`p-4 rounded-lg text-sm ${message.includes("success") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {message}
          </div>
        )}

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className={`px-6 py-2.5 rounded-lg font-medium text-white shadow-soft transition-colors ${
              isSaving ? "bg-manikan-teal/70 cursor-not-allowed" : "bg-manikan-teal hover:bg-manikan-teal-hover"
            }`}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </form>
  );
}
