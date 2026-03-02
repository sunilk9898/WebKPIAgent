"use client";

import { Trash2 } from "lucide-react";
import { SectionLabel, DetailSection, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn } from "@/lib/utils";
import type { CodeQualityMetadata } from "@/types/api";

interface DeadCodeDetailProps {
  deadCode: CodeQualityMetadata["deadCode"];
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  "unused-export": { label: "Unused Export", color: "text-amber-400" },
  "unreachable": { label: "Unreachable Code", color: "text-red-400" },
  "unused-variable": { label: "Unused Variable", color: "text-blue-400" },
  "unused-import": { label: "Unused Import", color: "text-purple-400" },
  "dead-branch": { label: "Dead Branch", color: "text-orange-400" },
};

export function DeadCodeDetail({ deadCode }: DeadCodeDetailProps) {
  // Group by type
  const byType = deadCode.reduce((acc, d) => {
    if (!acc[d.type]) acc[d.type] = [];
    acc[d.type].push(d);
    return acc;
  }, {} as Record<string, typeof deadCode>);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-gray-100">{deadCode.length}</div>
          <div className="text-xs text-gray-500">Dead code instances found</div>
        </div>
        <span className={cn(
          "badge text-[10px] px-3 py-1",
          deadCode.length === 0 ? "bg-green-500/15 text-green-400 border-green-500/30"
          : deadCode.length > 10 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-white/[0.06] text-gray-400 border-white/[0.08]",
        )}>
          {deadCode.length === 0 ? "Clean" : deadCode.length > 10 ? "Needs Cleanup" : "Minor"}
        </span>
      </div>

      <DetailSection title="What This Means">
        Dead code is unused or unreachable code that adds to bundle size, increases maintenance burden,
        and creates confusion for developers. Removing dead code reduces complexity, improves build times,
        and prevents accidental use of stale logic.
      </DetailSection>

      {/* Type breakdown */}
      {Object.keys(byType).length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel label="By Type" />
          <div className="flex flex-wrap gap-2">
            {Object.entries(byType).map(([type, items]) => {
              const info = TYPE_LABELS[type] || { label: type, color: "text-gray-400" };
              return (
                <span key={type} className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px]">
                  <span className={info.color}>{items.length}</span>
                  <span className="text-gray-500 ml-1.5">{info.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* File list */}
      {deadCode.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Dead Code Locations" count={deadCode.length} />
          <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
            {deadCode.map((d, i) => {
              const info = TYPE_LABELS[d.type] || { label: d.type, color: "text-gray-400" };
              return (
                <div key={i} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-1">
                    <Trash2 className={cn("w-3 h-3", info.color)} />
                    <span className="text-[10px] text-gray-500 uppercase">{info.label}</span>
                    {d.confidence < 0.8 && (
                      <span className="text-[9px] text-gray-600 px-1.5 py-0.5 rounded bg-white/[0.04]">
                        {(d.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-200 font-mono mt-1 truncate">{d.file}:{d.line}</div>
                  {d.code && (
                    <div className="mt-1.5 p-2 rounded bg-black/20 text-[11px] font-mono text-gray-400 truncate">
                      {d.code}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ImpactBadge effort="low" impact="Removing dead code reduces bundle size and maintenance burden" />
    </div>
  );
}
