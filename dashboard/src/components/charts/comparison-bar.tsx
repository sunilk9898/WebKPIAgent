"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

export interface ComparisonBarSite {
  key: string;
  label: string;
  color: string;
}

export interface ComparisonBarDataPoint {
  category: string;
  [siteKey: string]: string | number;
}

interface ComparisonBarChartProps {
  data: ComparisonBarDataPoint[];
  sites: ComparisonBarSite[];
  height?: number;
  showTarget?: boolean;
  targetValue?: number;
  maxValue?: number;
}

export function ComparisonBarChart({
  data,
  sites,
  height = 280,
  showTarget = true,
  targetValue = 95,
  maxValue = 100,
}: ComparisonBarChartProps) {
  if (data.length === 0 || sites.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        No comparison data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="category"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, maxValue]}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1a1a24",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => [`${value.toFixed(1)}`, name]}
        />
        {showTarget && (
          <ReferenceLine
            y={targetValue}
            stroke="#22c55e"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `Target: ${targetValue}`,
              fill: "#22c55e",
              fontSize: 10,
              position: "right",
            }}
          />
        )}
        {sites.map((site) => (
          <Bar
            key={site.key}
            dataKey={site.key}
            name={site.label}
            fill={site.color}
            radius={[4, 4, 0, 0]}
            barSize={Math.max(12, Math.min(28, 100 / sites.length))}
          />
        ))}
        <Legend
          formatter={(value) => <span className="text-xs text-gray-400">{value}</span>}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
