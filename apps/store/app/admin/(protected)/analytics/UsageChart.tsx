"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DonutChart from "../../../../components/analytics/DonutChart";

export default function UsageChart({ chartData, donutData }: { chartData: any[], donutData: any[] }) {
  const COLORS = {
    VTON_2D: "#1e5560", 
    BODY_MODELING: "#C8966A", 
    RECOMMENDATION: "#94a3b8", 
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up" style={{ animationDelay: "500ms" }}>
      <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-card border border-manikan-border">
        <h3 className="text-lg font-display font-semibold text-forest-950 mb-6">Service API Usage (Last 30 Days)</h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVton" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.VTON_2D} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={COLORS.VTON_2D} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorBody" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.BODY_MODELING} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={COLORS.BODY_MODELING} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.RECOMMENDATION} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={COLORS.RECOMMENDATION} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#4A5568', fontSize: 12 }} 
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
                }}
              />
              <YAxis 
                tick={{ fill: '#4A5568', fontSize: 12 }} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                labelStyle={{ fontWeight: 'bold', color: '#1A202C' }}
              />
              <Area type="monotone" dataKey="VTON_2D" name="2D Try-On" stroke={COLORS.VTON_2D} fillOpacity={1} fill="url(#colorVton)" />
              <Area type="monotone" dataKey="BODY_MODELING" name="Body Modeling" stroke={COLORS.BODY_MODELING} fillOpacity={1} fill="url(#colorBody)" />
              <Area type="monotone" dataKey="RECOMMENDATION" name="Recommendations" stroke={COLORS.RECOMMENDATION} fillOpacity={1} fill="url(#colorRec)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="lg:col-span-1">
        <DonutChart data={donutData} title="Top Retailers by Usage" />
      </div>
    </div>
  );
}
