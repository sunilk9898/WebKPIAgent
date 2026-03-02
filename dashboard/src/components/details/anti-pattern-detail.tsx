"use client";

import { AlertOctagon } from "lucide-react";
import { SectionLabel, DetailSection, FixRecommendation, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn, getSeverityBg } from "@/lib/utils";
import type { CodeQualityMetadata } from "@/types/api";

interface AntiPatternDetailProps {
  antiPatterns: CodeQualityMetadata["antiPatterns"];
}

export function AntiPatternDetail({ antiPatterns }: AntiPatternDetailProps) {
  // Group by pattern name
  const byPattern = antiPatterns.reduce((acc, p) => {
    if (!acc[p.pattern]) acc[p.pattern] = [];
    acc[p.pattern].push(p);
    return acc;
  }, {} as Record<string, typeof antiPatterns>);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-gray-100">{antiPatterns.length}</div>
          <div className="text-xs text-gray-500">Anti-patterns detected</div>
        </div>
        <span className={cn(
          "badge text-[10px] px-3 py-1",
          antiPatterns.length === 0 ? "bg-green-500/15 text-green-400 border-green-500/30"
          : antiPatterns.length > 5 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-white/[0.06] text-gray-400 border-white/[0.08]",
        )}>
          {antiPatterns.length === 0 ? "Clean" : `${Object.keys(byPattern).length} pattern types`}
        </span>
      </div>

      <DetailSection title="What This Means">
        Anti-patterns are commonly occurring code structures that appear to be beneficial but are actually
        counterproductive. They lead to bugs, poor performance, maintainability issues, and security vulnerabilities.
        Identifying and refactoring anti-patterns is key to improving code quality and developer productivity.
      </DetailSection>

      {Object.entries(byPattern).map(([pattern, items]) => (
        <div key={pattern} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-gray-200">{pattern}</span>
            </div>
            <span className="text-[10px] text-gray-500">{items.length} occurrence{items.length > 1 ? "s" : ""}</span>
          </div>

          {items.map((ap, i) => (
            <div key={i} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300">{ap.description}</span>
                <span className={cn("badge text-[9px]", getSeverityBg(ap.severity))}>{ap.severity}</span>
              </div>
              <div className="text-[10px] text-gray-500 font-mono">{ap.file}:{ap.line}</div>
              {ap.suggestion && (
                <div className="mt-2 text-[11px] text-green-400/70">
                  <span className="text-gray-500">Suggestion: </span>{ap.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {antiPatterns.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/[0.06] border border-green-500/10">
          <span className="text-xs text-green-300">No anti-patterns detected. Code follows best practices.</span>
        </div>
      )}

      <ImpactBadge effort="medium" impact="Fixing anti-patterns improves reliability and maintainability" />
    </div>
  );
}
