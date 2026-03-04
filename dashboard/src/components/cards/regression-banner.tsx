"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import { cn, getSeverityBg } from "@/lib/utils";
import { useToastStore } from "@/lib/store";
import type { Regression } from "@/types/api";

interface RegressionBannerProps {
  regressions: Regression[];
}

export function RegressionBanner({ regressions }: RegressionBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const addToast = useToastStore((s) => s.addToast);

  if (regressions.length === 0) return null;

  const criticalCount = regressions.filter((r) => r.severity === "critical" || r.severity === "high").length;
  const shown = expanded ? regressions : regressions.slice(0, 5);
  const hasMore = regressions.length > 5;

  const toggleItem = (idx: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleCopyAll = () => {
    const text = regressions.map((r) =>
      `[${r.severity.toUpperCase()}] ${r.metric}: ${r.previousValue} → ${r.currentValue} (${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)})`
    ).join("\n");
    navigator.clipboard.writeText(`Regressions Detected (${regressions.length}):\n\n${text}`);
    addToast({ type: "success", title: "Copied regressions", duration: 2000 });
  };

  const handleDownload = () => {
    const lines = [`VZY Regressions Report - ${new Date().toLocaleDateString()}`, ""];
    lines.push(`Total: ${regressions.length} regressions (${criticalCount} critical/high)`);
    lines.push("");
    regressions.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.severity.toUpperCase()}] ${r.metric}`);
      lines.push(`   Previous: ${r.previousValue} → Current: ${r.currentValue} (Delta: ${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)})`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vzy-regressions-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: "success", title: "Downloaded regressions report", duration: 2000 });
  };

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4 animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/15">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-red-400">
              {regressions.length} Regression{regressions.length !== 1 ? "s" : ""} Detected
            </div>
            <div className="text-xs text-gray-400">
              {criticalCount > 0 && `${criticalCount} critical/high severity`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopyAll} className="btn-ghost p-1.5 text-gray-500 hover:text-gray-300" title="Copy all regressions">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDownload} className="btn-ghost p-1.5 text-gray-500 hover:text-gray-300" title="Download regressions">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {shown.map((r, i) => {
          const isItemExpanded = expandedItems.has(i);
          return (
            <div key={i}>
              <div
                onClick={() => toggleItem(i)}
                className="flex items-center gap-3 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors"
              >
                {isItemExpanded ? (
                  <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
                )}
                <span className={cn("badge text-[10px]", getSeverityBg(r.severity))}>
                  {r.severity.toUpperCase()}
                </span>
                <span className="text-gray-300 flex-1 truncate">{r.metric}</span>
                <div className="flex items-center gap-1 text-red-400 text-xs font-medium tabular-nums">
                  <ArrowDown className="w-3 h-3" />
                  {Math.abs(r.delta).toFixed(1)}
                </div>
                <span className="text-xs text-gray-500 tabular-nums">
                  {r.previousValue} → {r.currentValue}
                </span>
              </div>
              {isItemExpanded && (
                <div className="ml-8 mb-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                  <div className="text-xs text-gray-400 space-y-1">
                    <div><span className="text-gray-500">Metric:</span> {r.metric}</div>
                    <div><span className="text-gray-500">Previous:</span> {r.previousValue} <span className="text-gray-600 mx-1">→</span> <span className="text-gray-500">Current:</span> {r.currentValue}</div>
                    <div><span className="text-gray-500">Delta:</span> <span className="text-red-400 font-medium">{r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}</span></div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(`[${r.severity}] ${r.metric}: ${r.previousValue} → ${r.currentValue} (delta: ${r.delta.toFixed(1)})`);
                      addToast({ type: "success", title: "Copied regression", duration: 2000 });
                    }}
                    className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 shrink-0"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-400 hover:text-gray-300 mt-2 pl-2 flex items-center gap-1 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronDown className="w-3 h-3" /> Show less
            </>
          ) : (
            <>
              <ChevronRight className="w-3 h-3" /> +{regressions.length - 5} more regression(s)
            </>
          )}
        </button>
      )}
    </div>
  );
}
