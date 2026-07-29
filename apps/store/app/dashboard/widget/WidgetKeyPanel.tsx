"use client";

import React, { useState, useEffect } from "react";

export default function WidgetKeyPanel() {
  const [apiKey, setApiKey] = useState("");
  const [isActivated, setIsActivated] = useState(false);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevealed, setIsRevealed] = useState(false);
  
  const [newOrigin, setNewOrigin] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null); // 'rotate', 'origins', 'toggle'
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/retailer/widget-key");
      if (!res.ok) throw new Error("Failed to load widget key data");
      const data = await res.json();
      setApiKey(data.apiKey);
      setIsActivated(data.isActivated);
      setAllowedOrigins(data.allowedOrigins || []);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRotateKey = async () => {
    if (!window.confirm("Rotating your key will immediately break any live widget embed using the old key. You'll need to update your embed snippet. Continue?")) {
      return;
    }
    
    setActionLoading("rotate");
    setMessage(null);
    try {
      const res = await fetch("/api/retailer/widget-key", { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to rotate key");
      }
      const data = await res.json();
      setApiKey(data.apiKey);
      setMessage({ type: "success", text: "Key rotated successfully." });
      setIsRevealed(false);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateOrigins = async (newOriginsList: string[]) => {
    setActionLoading("origins");
    setMessage(null);
    try {
      const res = await fetch("/api/retailer/widget-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedOrigins: newOriginsList }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update origins");
      }
      const data = await res.json();
      setAllowedOrigins(data.allowedOrigins);
      setMessage({ type: "success", text: "Allowed origins updated." });
      setNewOrigin("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddOrigin = () => {
    let origin = newOrigin.trim();
    if (!origin) return;
    if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
      setMessage({ type: "error", text: "Origin must start with http:// or https://" });
      return;
    }

    try {
      const url = new URL(origin);
      origin = `${url.protocol}//${url.host}`;
    } catch {
      origin = origin.replace(/\/$/, "").toLowerCase();
    }

    if (allowedOrigins.includes(origin)) {
      setMessage({ type: "error", text: "Origin already exists" });
      return;
    }
    handleUpdateOrigins([...allowedOrigins, origin]);
  };

  const handleRemoveOrigin = (originToRemove: string) => {
    handleUpdateOrigins(allowedOrigins.filter(o => o !== originToRemove));
  };



  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
    setMessage({ type: "success", text: "API Key copied to clipboard." });
    setTimeout(() => setMessage(null), 3000);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-8 max-w-2xl animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="h-10 bg-gray-200 rounded w-full mb-4"></div>
        <div className="h-10 bg-gray-200 rounded w-full mb-4"></div>
      </div>
    );
  }

  const maskedKey = apiKey ? `${apiKey.substring(0, 8)}••••••••${apiKey.substring(apiKey.length - 4)}` : "";

  const snippet = `<script src="https://widget.manikan.tech/v1/embed.js" data-key="${isRevealed ? apiKey : maskedKey}"></script>`;

  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-8 h-full transition-all duration-300 hover:shadow-lg space-y-8 flex flex-col">
      
      <div className="flex items-center justify-between border-b border-manikan-border pb-6">
        <div>
          <h3 className="text-xl font-display font-semibold text-forest-900">Widget Activation & API Key</h3>
          <p className="text-sm text-manikan-text-secondary mt-1">
            Manage your API key and widget access.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 border border-manikan-border rounded-full">
          <div className={`w-2 h-2 rounded-full ${isActivated ? "bg-green-500" : "bg-amber-500"}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-forest-700">
            {isActivated ? "Active" : "Pending"}
          </span>
        </div>
      </div>

      {!isActivated && (
        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg text-sm border border-yellow-200">
          <strong>Note:</strong> The widget is currently deactivated. It will reject all requests until activated.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-forest-900 mb-2">Public API Key</label>
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center bg-gray-50 border border-manikan-border rounded-lg px-4 py-2 font-mono text-sm text-forest-900">
            <span className="flex-1 truncate mr-2">{isRevealed ? apiKey : maskedKey}</span>
            <button
              type="button"
              onClick={() => setIsRevealed(!isRevealed)}
              className="text-gray-500 hover:text-forest-900 p-1 rounded transition-colors"
              title={isRevealed ? "Hide Key" : "Reveal Key"}
            >
              {isRevealed ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={copyToClipboard}
              className="text-gray-500 hover:text-forest-900 p-1 rounded transition-colors"
              title="Copy to Clipboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
          </div>
          <button
            onClick={handleRotateKey}
            disabled={actionLoading === "rotate"}
            className="px-4 py-2 border border-manikan-border rounded-lg text-sm font-medium text-forest-900 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {actionLoading === "rotate" ? "Rotating..." : "Regenerate Key"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-forest-900 mb-2">Allowed Origins</label>
        <p className="text-sm text-manikan-text-secondary mb-3">
          Specify the domains where your widget is allowed to run.
        </p>
        
        <div className="space-y-3 mb-4">
          {allowedOrigins.length === 0 ? (
            <p className="text-sm text-gray-500 italic px-2">No origins configured yet. Widget will not load anywhere.</p>
          ) : (
            allowedOrigins.map(origin => (
              <div key={origin} className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg border border-manikan-border">
                <span className="text-sm font-mono text-forest-900">{origin}</span>
                <button
                  onClick={() => handleRemoveOrigin(origin)}
                  disabled={actionLoading === "origins"}
                  className="text-red-500 hover:text-red-700 p-1 rounded disabled:opacity-50 transition-colors"
                  title="Remove Origin"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={newOrigin}
            onChange={(e) => setNewOrigin(e.target.value)}
            placeholder="https://store.example.com"
            className="flex-1 px-4 py-2 border border-manikan-border rounded-lg focus:ring-2 focus:ring-forest-400 focus:outline-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddOrigin();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddOrigin}
            disabled={actionLoading === "origins" || !newOrigin.trim()}
            className="px-6 py-2 bg-manikan-teal text-white rounded-lg text-sm font-medium hover:bg-manikan-teal-hover transition-colors shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Origin
          </button>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-forest-900 mb-2">Embed Snippet</label>
        <p className="text-sm text-manikan-text-secondary mb-3">
          Place this snippet right before the closing <code>&lt;/body&gt;</code> tag of your website.
        </p>
        <div className="relative group">
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto">
            {snippet}
          </pre>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm transition-all duration-300 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
