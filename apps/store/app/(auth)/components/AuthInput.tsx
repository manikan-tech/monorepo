"use client";

import { useState } from "react";

interface AuthInputProps {
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  error?: string;
  required?: boolean;
  autoComplete?: string;
}

export default function AuthInput({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  icon,
  error,
  required = true,
  autoComplete,
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-sans text-xs font-medium text-forest-900 tracking-wide">
        {label}
      </label>
      <div 
        className={`flex items-center gap-2 px-4 h-12 bg-manikan-input-bg border-[1.5px] rounded-md transition-all duration-300 ease-out focus-within:shadow-glow ${
          error 
            ? "border-manikan-error focus-within:ring-[3px] focus-within:ring-red-500/10" 
            : "border-manikan-border focus-within:border-manikan-border-focus focus-within:ring-[3px] focus-within:ring-[#1b3a4b]/15"
        }`}
      >
        <span className="flex items-center shrink-0 text-forest-700/70">{icon}</span>
        <input
          id={id}
          type={inputType}
          className="flex-1 border-none outline-none bg-transparent font-sans text-sm font-normal text-forest-900 h-full placeholder:text-forest-700/50 placeholder:font-light"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className="flex items-center justify-center bg-none border-none cursor-pointer text-forest-700/70 p-1 rounded transition-colors hover:text-gold-600"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="font-sans text-xs font-normal text-manikan-error mt-0.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
