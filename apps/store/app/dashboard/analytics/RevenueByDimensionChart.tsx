"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type DimensionData = {
  name: string;
  revenue: number;
  units: number;
};

type Props = {
  data: {
    category: DimensionData[];
    brand: DimensionData[];
    fabric: DimensionData[];
  };
};

export default function RevenueByDimensionChart({ data }: Props) {
  const [dimension, setDimension] = useState<"category" | "brand" | "fabric">("category");

  const chartData = data[dimension];

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center bg-white rounded-2xl border border-manikan-border text-forest-700/60 shadow-soft">
        No revenue data available yet.
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-manikan-border shadow-soft w-full h-[400px]">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-display font-semibold text-forest-950">Revenue & Units Sold</h3>
        <select
          value={dimension}
          onChange={(e) => setDimension(e.target.value as any)}
          className="bg-forest-50 border border-forest-900/10 rounded-xl px-3 py-1.5 text-sm text-forest-900 focus:outline-none focus:border-gold-400 cursor-pointer"
        >
          <option value="category">By Category</option>
          <option value="brand">By Brand</option>
          <option value="fabric">By Fabric</option>
        </select>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="name" tick={{ fill: '#4A5568', fontSize: 12 }} />
          <YAxis yAxisId="left" orientation="left" stroke="#1e5560" tick={{ fill: '#4A5568' }} />
          <YAxis yAxisId="right" orientation="right" stroke="#C8966A" tick={{ fill: '#4A5568' }} />
          <Tooltip
            cursor={{ fill: '#F7FAFC' }}
            contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar yAxisId="left" dataKey="revenue" name="Revenue (EGP)" fill="#1e5560" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
          <Bar yAxisId="right" dataKey="units" name="Units Sold" fill="#C8966A" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
