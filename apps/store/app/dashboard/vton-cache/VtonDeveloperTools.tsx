"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Tab = "cache" | "allowlist";

type CacheEntry = {
  id: string;
  cacheKey: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

type OriginEntry = {
  id: string;
  origin: string;
  createdAt: string;
};

class SubscriptionRequiredError extends Error {}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 403) throw new SubscriptionRequiredError();

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Request failed.",
    );
  }

  return body as T;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function maskedKey(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}••••••••${value.slice(-4)}`;
}

export default function VtonDeveloperTools() {
  const [activeTab, setActiveTab] = useState<Tab>("cache");
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [origins, setOrigins] = useState<OriginEntry[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [originInput, setOriginInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof SubscriptionRequiredError) {
      setIsLocked(true);
      return;
    }

    setMessage({
      type: "error",
      text: error instanceof Error ? error.message : "Something went wrong.",
    });
  }, []);

  const loadDeveloperTools = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const [cache, allowlist, key] = await Promise.all([
        readJson<{ cacheEntries: CacheEntry[] }>("/api/vton/cache"),
        readJson<{ origins: OriginEntry[] }>("/api/vton/allowlist"),
        readJson<{ apiKey: string }>("/api/retailer/widget-key/VTON_2D"),
      ]);

      setCacheEntries(cache.cacheEntries);
      setOrigins(allowlist.origins);
      setApiKey(key.apiKey);
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void loadDeveloperTools();
  }, [loadDeveloperTools]);

  async function copyApiKey() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setMessage({ type: "success", text: "API key copied to clipboard." });
    } catch {
      setMessage({ type: "error", text: "Unable to copy the API key." });
    }
  }

  async function addOrigin() {
    if (!originInput.trim() || origins.length >= 5) return;

    setIsMutating(true);
    setMessage(null);
    try {
      const data = await readJson<{ origin: OriginEntry }>(
        "/api/vton/allowlist",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: originInput }),
        },
      );
      setOrigins((current) => [...current, data.origin]);
      setOriginInput("");
      setMessage({ type: "success", text: "Domain added to the allowlist." });
    } catch (error) {
      handleError(error);
    } finally {
      setIsMutating(false);
    }
  }

  async function removeOrigin(origin: OriginEntry) {
    setIsMutating(true);
    setMessage(null);
    try {
      await readJson<{ deleted: number }>("/api/vton/allowlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: origin.id }),
      });
      setOrigins((current) => current.filter((item) => item.id !== origin.id));
      setMessage({
        type: "success",
        text: "Domain removed from the allowlist.",
      });
    } catch (error) {
      handleError(error);
    } finally {
      setIsMutating(false);
    }
  }

  async function clearCache() {
    if (!window.confirm("Clear all VTON cache metadata for this retailer?")) {
      return;
    }

    setIsMutating(true);
    setMessage(null);
    try {
      const data = await readJson<{ invalidated: number }>("/api/vton/cache", {
        method: "DELETE",
      });
      setCacheEntries([]);
      setMessage({
        type: "success",
        text: `${data.invalidated} cache entr${data.invalidated === 1 ? "y" : "ies"} invalidated.`,
      });
    } catch (error) {
      handleError(error);
    } finally {
      setIsMutating(false);
    }
  }

  const originLimitReached = origins.length >= 5;

  return (
    <div className="relative space-y-8">
      <div
        className={isLocked ? "pointer-events-none select-none blur-sm" : ""}
        aria-hidden={isLocked}
      >
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-600">
              VTON Developer Tools
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-forest-950">
              Cache and origin controls
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-forest-700/75">
              Manage VTON cache metadata and the domains authorized for your
              integration.
            </p>
          </div>

          <div className="rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gold-700">
              Cached entries
            </p>
            <p className="text-xl font-semibold text-gold-800">
              {cacheEntries.length}
            </p>
          </div>
        </header>

        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
            role="status"
          >
            {message.text}
          </div>
        )}

        <section className="rounded-3xl border border-forest-100 bg-white p-6 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-forest-950">
                VTON_2D integration key
              </h2>
              <p className="mt-1 text-sm text-forest-700/70">
                Use this retailer-scoped key in your approved VTON integration.
              </p>
            </div>
            <button
              type="button"
              onClick={copyApiKey}
              disabled={!apiKey}
              className="inline-flex items-center justify-center rounded-xl border border-forest-200 bg-white px-4 py-2 text-sm font-medium text-forest-900 transition hover:border-gold-300 hover:text-gold-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy key
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-forest-100 bg-forest-50 px-4 py-3 font-mono text-sm text-forest-900">
            {isLoading ? "Loading key..." : maskedKey(apiKey)}
          </div>
        </section>

        <div className="flex gap-2 border-b border-forest-200" role="tablist">
          {(
            [
              ["cache", "VTON Cache"],
              ["allowlist", "Origin Allowlist"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                activeTab === tab
                  ? "border-gold-500 text-forest-950"
                  : "border-transparent text-forest-700/60 hover:text-forest-950"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "cache" ? (
          <section className="rounded-3xl border border-forest-100 bg-white shadow-soft">
            <div className="flex flex-col gap-4 border-b border-forest-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-forest-950">
                  Cached VTON tasks
                </h2>
                <p className="mt-1 text-sm text-forest-700/70">
                  Review metadata created for your retailer and invalidate it
                  when needed.
                </p>
              </div>
              <button
                type="button"
                onClick={clearCache}
                disabled={isLoading || isMutating || cacheEntries.length === 0}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMutating ? "Updating..." : "Clear cache"}
              </button>
            </div>

            <div className="divide-y divide-forest-100">
              {isLoading ? (
                <div className="p-6 text-sm text-forest-700/70">
                  Loading cache metadata...
                </div>
              ) : cacheEntries.length === 0 ? (
                <div className="p-10 text-center">
                  <h3 className="font-display text-lg font-semibold text-forest-950">
                    No cached VTON tasks
                  </h3>
                  <p className="mt-2 text-sm text-forest-700/70">
                    Cache metadata appears here after VTON work is created for
                    your retailer.
                  </p>
                </div>
              ) : (
                cacheEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="grid gap-3 px-6 py-5 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div>
                      <p className="font-mono text-sm font-semibold text-forest-950">
                        {entry.cacheKey}
                      </p>
                      <p className="mt-1 text-xs text-forest-700/70">
                        Last updated {formatDate(entry.updatedAt)}
                      </p>
                    </div>
                    <p className="max-w-md truncate rounded-lg bg-forest-50 px-3 py-2 font-mono text-xs text-forest-800">
                      {entry.metadata
                        ? JSON.stringify(entry.metadata)
                        : "No metadata"}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-forest-100 bg-white p-6 shadow-soft">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-forest-950">
                  Allowed origins
                </h2>
                <p className="mt-1 text-sm text-forest-700/70">
                  Add complete origins such as https://my-store.com. You can
                  store up to five origins.
                </p>
              </div>
              <span className="rounded-full bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-700">
                {origins.length}/5 origins
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input
                value={originInput}
                onChange={(event) => setOriginInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addOrigin();
                  }
                }}
                disabled={isLoading || isMutating || originLimitReached}
                placeholder="https://my-store.com"
                aria-label="Allowed origin"
                className="min-w-0 flex-1 rounded-xl border border-forest-200 px-4 py-2.5 text-sm text-forest-950 outline-none transition placeholder:text-forest-700/40 focus:border-gold-400 focus:ring-2 focus:ring-gold-100 disabled:cursor-not-allowed disabled:bg-forest-50"
              />
              <button
                type="button"
                onClick={() => void addOrigin()}
                disabled={
                  isLoading ||
                  isMutating ||
                  originLimitReached ||
                  !originInput.trim()
                }
                className="rounded-xl bg-forest-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMutating ? "Saving..." : "Add domain"}
              </button>
            </div>

            {originLimitReached && (
              <p className="mt-3 text-sm font-medium text-amber-700">
                You have reached the five-origin limit. Remove an origin before
                adding another.
              </p>
            )}

            <div className="mt-6 space-y-3">
              {isLoading ? (
                <p className="text-sm text-forest-700/70">
                  Loading allowed origins...
                </p>
              ) : origins.length === 0 ? (
                <p className="rounded-xl border border-dashed border-forest-200 bg-forest-50/50 p-5 text-sm text-forest-700/70">
                  No origins are allowed yet. Add your storefront domain to
                  begin.
                </p>
              ) : (
                origins.map((origin) => (
                  <div
                    key={origin.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-forest-100 bg-forest-50/50 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium text-forest-950">
                        {origin.origin}
                      </p>
                      <p className="mt-1 text-xs text-forest-700/60">
                        Added {formatDate(origin.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeOrigin(origin)}
                      disabled={isMutating}
                      aria-label={`Remove ${origin.origin}`}
                      className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M6 7h12m-9 0V5h6v2m-8 0 .7 12h8.6L17 7M10 11v4m4-4v4"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>

      {isLocked && (
        <section className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-forest-950/45 p-6">
          <div className="max-w-lg rounded-3xl border border-gold-200 bg-white p-8 text-center shadow-lift">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-50 text-gold-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 3h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1V7a5 5 0 00-10 0v3H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-forest-950">
              Subscription Required
            </h2>
            <p className="mt-3 text-sm leading-6 text-forest-700/80">
              Upgrade your plan to unlock VTON Developer Tools and Origin
              Allowlists.
            </p>
            <Link
              href="/business"
              className="mt-6 inline-flex rounded-xl bg-forest-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest-800"
            >
              Upgrade your plan
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
