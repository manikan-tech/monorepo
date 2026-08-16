"use client";

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Props = {
  data: {
    date: string;
    revenue: number;
    orders: number;
  }[];
};

export default function AreaChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center bg-white rounded-2xl border border-manikan-border text-forest-700/60 shadow-soft">
        No daily revenue data available yet.
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-manikan-border shadow-soft w-full h-[400px]">
      <div className="flex flex-col mb-6">
        <h3 className="text-lg font-display font-semibold text-forest-950">Store Revenue Over Time</h3>
        <p className="text-sm text-forest-700/60">Daily GMV (Revenue) & Orders</p>
      </div>
      
      <ResponsiveContainer width="100%" height="80%">
        <RechartsAreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#C8966A" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#C8966A" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1e5560" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#1e5560" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#4A5568', fontSize: 12 }} 
            tickLine={false}
            axisLine={{ stroke: '#E2E8F0' }}
            dy={10}
          />
          <YAxis 
            yAxisId="left"
            tick={{ fill: '#4A5568', fontSize: 12 }} 
            tickLine={false}
            axisLine={false}
            dx={-10}
            tickFormatter={(value) => `${value} EGP`}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#4A5568', fontSize: 12 }} 
            tickLine={false}
            axisLine={false}
            dx={10}
          />
          <Tooltip
            contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
            labelStyle={{ fontWeight: 'bold', color: '#1A202C' }}
            formatter={(value: any, name: any) => {
              if (name === 'revenue') return [`${Number(value).toFixed(2)} EGP`, 'Revenue'];
              return [value, 'Orders'];
            }}
          />
          <Area 
            yAxisId="left"
            type="monotone" 
            dataKey="revenue" 
            stroke="#C8966A" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorRevenue)" 
            isAnimationActive={true} 
            animationDuration={1000}
          />
          <Area 
            yAxisId="right"
            type="monotone" 
            dataKey="orders" 
            stroke="#1e5560" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorOrders)" 
            isAnimationActive={true} 
            animationDuration={1000}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
