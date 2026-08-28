"use client";

import React, { useState, useCallback } from "react";

interface TelegramIdCardProps {
  customerId: string;
}

export default function TelegramIdCard({ customerId }: TelegramIdCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(customerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = customerId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [customerId]);

  return (
    <div className="bg-white rounded-3xl p-6 border border-forest-900/5 shadow-soft">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-blue-600"
          >
            <path d="M21 5L12 13.5 3 5" />
            <path d="M21 5L14 17l-2-4-7 4L3 5" />
          </svg>
        </div>
        <h3 className="font-display font-medium text-forest-950">
          Telegram Bot
        </h3>
      </div>

      <p className="text-xs text-forest-700/60 mb-3">Your Manikan ID:</p>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-forest-50 rounded-xl px-4 py-2.5 font-mono text-sm text-forest-800 truncate select-all border border-forest-900/5">
          {customerId}
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 w-10 h-10 bg-forest-50 hover:bg-forest-100 rounded-xl flex items-center justify-center border border-forest-900/5 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-600"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-forest-600"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-xs text-forest-700/50 mt-3">
        You need this ID to use our Telegram bot.
      </p>

      <a
        href="https://t.me/Manikan_2026_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full mt-4 py-2.5 px-4 bg-blue-50 text-blue-700 rounded-xl font-medium text-sm text-center border border-blue-100 hover:bg-blue-100 transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="shrink-0"
        >
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        Open Bot →
      </a>
    </div>
  );
}
