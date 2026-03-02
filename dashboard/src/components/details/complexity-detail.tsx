"use client";

import { Brain, FileCode, AlertTriangle } from "lucide-react";
import { InfoBox, SectionLabel, DetailSection, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn, getSeverityBg } from "@/lib/utils";
import type { CodeQualityMetadata, Finding } from "@/types/api";

interface ComplexityDetailProps {
  complexity: CodeQualityMetadata["complexity"];
  findings: Finding[];
  focusType?: "avg" | "max";
}

export function ComplexityDetail({ complexity, findings, focusType }: ComplexityDetailProps) {
  const complexityFindings = findings.filter((f) => f.category === "Complexity" || f.category.toLowerCase().includes("complex"));

  return (
    <div className="space-y-5">
      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoBox label="Avg Cyclomatic" value={complexity.avgCyclomaticComplexity.toFixed(1)} bad={complexity.avgCyclomaticComplexity > 10} highlight={complexity.avgCyclomaticComplexity <= 5} />
        <InfoBox label="Max Cyclomatic" value={complexity.maxCyclomaticComplexity} bad={complexity.maxCyclomaticComplexity > 25} />
        <InfoBox label="Avg Cognitive" value={complexity.avgCognitiveComplexity.toFixed(1)} bad={complexity.avgCognitiveComplexity > 15} highlight={complexity.avgCognitiveComplexity <= 8} />
        <InfoBox label="Max Cognitive" value={complexity.maxCognitiveComplexity || "—"} />
        <InfoBox label="Duplicate Blocks" value={complexity.duplicateBlocks} bad={complexity.duplicateBlocks > 10} highlight={complexity.duplicateBlocks === 0} />
        <InfoBox label="Tech Debt" value={complexity.technicalDebt || "0d"} />
      </div>

      <DetailSection title="What This Means">
        {focusType === "avg"
          ? "Average cyclomatic complexity measures how branching (if/switch/loops) your typical function has. A value under 10 is good; above 10 means functions are getting hard to test and maintain."
          : focusType === "max"
          ? "Maximum cyclomatic complexity highlights your most complex function. Values above 20-25 indicate functions that are extremely difficult to test exhaustively and should be refactored."
          : "Code complexity metrics help identify functions and modules that are difficult to understand, test, and maintain. High complexity increases bug probability and slows development."}
      </DetailSection>

      {/* Complexity scale */}
      <div className="space-y-2">
        <SectionLabel label="Complexity Scale" />
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { range: "1-5", label: "Simple", color: "bg-green-500/15 text-green-400 border-green-500/20" },
            { range: "6-10", label: "Moderate", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
            { range: "11-20", label: "Complex", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
            { range: "21+", label: "Very High", color: "bg-red-500/15 text-red-400 border-red-500/20" },
          ].map((s) => (
            <div key={s.range} className={cn("p-2 rounded-lg border text-[10px]", s.color)}>
              <div className="font-bold">{s.range}</div>
              <div className="opacity-80">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* High-complexity findings */}
      {complexityFindings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="High Complexity Functions" count={complexityFindings.length} />
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {complexityFindings.map((f) => (
              <div key={f.id} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-200 font-medium">{f.title}</span>
                  <span className={cn("badge text-[9px]", getSeverityBg(f.severity))}>{f.severity}</span>
                </div>
                <div className="text-[11px] text-gray-400">{f.description}</div>
                {f.location?.file && (
                  <div className="text-[10px] text-gray-500 font-mono mt-1">{f.location.file}{f.location.line ? `:${f.location.line}` : ""}</div>
                )}
                {f.remediation && (
                  <div className="text-[11px] text-green-400/70 mt-1.5">
                    <span className="text-gray-500">Fix: </span>{f.remediation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplication */}
      {complexity.duplicateBlocks > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
          <div className="flex items-center gap-2 mb-1">
            <FileCode className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300">{complexity.duplicateBlocks} Duplicate Code Blocks</span>
          </div>
          <div className="text-[11px] text-gray-400">
            Duplicate code increases maintenance burden. Extract common logic into shared functions or utilities.
          </div>
        </div>
      )}

      <ImpactBadge effort="high" impact="Reducing complexity makes code more testable and maintainable" />
    </div>
  );
}
