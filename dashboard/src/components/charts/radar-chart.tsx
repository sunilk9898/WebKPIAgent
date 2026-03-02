"use client";

import {
  RadarChart as RechartsRadar,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export interface RadarSite {
  key: string;
  label: string;
  color: string;
}

export interface RadarDataPoint {
  metric: string;
  [siteKey: string]: string | number;
}

interface ComparisonRadarChartProps {
  data: RadarDataPoint[];
  sites: RadarSite[];
  height?: number;
}

export function ComparisonRadarChart({ data, sites, height = 320 }: ComparisonRadarChartProps) {
  if (data.length === 0 || sites.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        No comparison data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadar cx="50%" cy="50%" outerRadius="72%" data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          tickLine={false}
        />
        <PolarRadiusAxis
          angle={30}
          domain={[0, 100]}
          tick={{ fill: "#6b7280", fontSize: 9 }}
          axisLine={false}
          tickCount={5}
        />
        {sites.map((site) => (
          <Radar
            key={site.key}
            name={site.label}
            dataKey={site.key}
            stroke={site.color}
            fill={site.color}
            fillOpacity={0.15}
            strokeWidth={2}
            dot={{ r: 3, fill: site.color }}
          />
        ))}
        <Tooltip
          contentStyle={{
            backgroundColor: "#1a1a24",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => [`${value.toFixed(1)}`, name]}
        />
        <Legend
          formatter={(value) => <span className="text-xs text-gray-400">{value}</span>}
        />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
