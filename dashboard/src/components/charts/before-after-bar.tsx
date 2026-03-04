"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

interface BeforeAfterBarProps {
  data: {
    category: string;
    current: number;
    projected: number;
  }[];
  height?: number;
}

export function BeforeAfterBar({ data, height = 220 }: BeforeAfterBarProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="category" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1a1a24",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => [
            `${value.toFixed(1)}`,
            name === "current" ? "Current Score" : "Projected Score",
          ]}
        />
        <ReferenceLine y={95} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} label={{ value: "Target: 95", fill: "#22c55e", fontSize: 10, position: "right" }} />
        <Bar dataKey="current" name="current" radius={[4, 4, 0, 0]} barSize={28}>
          {data.map((_entry, i) => (
            <Cell key={i} fill="#f59e0b" opacity={0.6} />
          ))}
        </Bar>
        <Bar dataKey="projected" name="projected" radius={[4, 4, 0, 0]} barSize={28}>
          {data.map((_entry, i) => (
            <Cell key={i} fill="#3b82f6" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
