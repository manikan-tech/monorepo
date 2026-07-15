"use client";

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

type Props = {
  data: {
    category: string;
    outOfStock: number;
    lowStock: number;
    healthy: number;
  }[];
};

export default function StockHealthChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center bg-white rounded-2xl border border-manikan-border text-forest-700/60 shadow-soft">
        No stock data available yet.
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-manikan-border shadow-soft w-full h-[400px]">
      <h3 className="text-lg font-display font-semibold text-forest-950 mb-6">Stock Health by Category</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="category" tick={{ fill: '#4A5568', fontSize: 12 }} />
          <YAxis tick={{ fill: '#4A5568' }} />
          <Tooltip
            cursor={{ fill: '#F7FAFC' }}
            contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar dataKey="healthy" name="Healthy Stock (≥ 10)" stackId="a" fill="#1e5560" isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
          <Bar dataKey="lowStock" name="Low Stock (1-9)" stackId="a" fill="#F0C080" isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
          <Bar dataKey="outOfStock" name="Out of Stock (0)" stackId="a" fill="#e53e3e" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
