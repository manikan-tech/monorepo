"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Props = {
  data: {
    productName: string;
    conversion: number;
    rating: number;
  }[];
};

export default function RatingVsConversionChart({ data }: Props) {
  if (!data || data.length === 0) {
    return null; // Optional chart, hide if no data
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-manikan-border shadow-soft w-full h-[400px]">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-display font-semibold text-forest-950">Rating vs Conversion %</h3>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis 
            type="number" 
            dataKey="rating" 
            name="Rating" 
            domain={[0, 5]} 
            tick={{ fill: '#4A5568' }}
            label={{ value: 'Average Rating (0-5)', position: 'insideBottom', offset: -10, fill: '#4A5568' }}
          />
          <YAxis 
            type="number" 
            dataKey="conversion" 
            name="Conversion" 
            unit="%" 
            tick={{ fill: '#4A5568' }}
            label={{ value: 'Conversion (%)', angle: -90, position: 'insideLeft', offset: 0, fill: '#4A5568' }}
          />
          <Tooltip 
            cursor={{ strokeDasharray: '3 3' }} 
            contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Scatter 
            name="Products" 
            data={data} 
            fill="#C8966A" 
            isAnimationActive={true} 
            animationDuration={800} 
            animationEasing="ease-out" 
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
