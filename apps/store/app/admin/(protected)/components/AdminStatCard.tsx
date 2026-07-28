import React from "react";

interface AdminStatCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ReactNode;
  delay?: number;
  accent?: "gold" | "forest" | "green" | "red";
}

const ACCENT_MAP = {
  gold: {
    bg: "bg-gold-50",
    border: "border-gold-200",
    iconBg: "bg-gold-400/15",
    iconColor: "text-gold-600",
    valueColor: "text-gold-700",
  },
  forest: {
    bg: "bg-forest-50",
    border: "border-forest-100",
    iconBg: "bg-forest-900/8",
    iconColor: "text-forest-700",
    valueColor: "text-forest-950",
  },
  green: {
    bg: "bg-green-50",
    border: "border-green-100",
    iconBg: "bg-green-500/10",
    iconColor: "text-green-600",
    valueColor: "text-green-700",
  },
  red: {
    bg: "bg-red-50",
    border: "border-red-100",
    iconBg: "bg-red-500/10",
    iconColor: "text-red-500",
    valueColor: "text-red-600",
  },
} as const;

export default function AdminStatCard({
  label,
  value,
  suffix = "",
  icon,
  delay = 0,
  accent = "forest",
}: AdminStatCardProps) {
  const styles = ACCENT_MAP[accent];

  return (
    <div
      className={`relative group ${styles.bg} rounded-2xl p-6 border ${styles.border} shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card animate-fade-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="absolute top-0 left-6 h-[2px] w-12 rounded-full transition-all duration-300 group-hover:w-20"
        style={{ background: "linear-gradient(90deg, #C8966A, transparent)" }}
      />
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-forest-700/60">
          {label}
        </p>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${styles.iconBg} ${styles.iconColor}`}
        >
          {icon}
        </div>
      </div>
      <p className={`text-4xl font-display font-bold ${styles.valueColor} leading-none`}>
        {value}
        {suffix}
      </p>
    </div>
  );
}
