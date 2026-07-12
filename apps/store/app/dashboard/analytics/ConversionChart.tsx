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
    productName: string;
    total: number;
    purchased: number;
    conversion: number;
  }[];
};

export default function ConversionChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center bg-white rounded-2xl border border-manikan-border text-forest-700/60 shadow-soft">
        No try-on data available yet.
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-manikan-border shadow-soft w-full h-[400px]">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-display font-semibold text-forest-950">Try-on Conversions</h3>
          <p className="text-xs text-forest-700/60 mt-1">
            * Based on logged-in sessions only.
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
          <XAxis type="number" tick={{ fill: '#4A5568' }} />
          <YAxis
            type="category"
            dataKey="productName"
            width={120}
            tick={{ fill: '#1A202C', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: '#F7FAFC' }}
            contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar dataKey="total" name="Total Try-ons" fill="#1e5560" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
          <Bar dataKey="purchased" name="Purchased" fill="#C8966A" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
