"use client";

import { Bug, AlertTriangle, CheckCircle2, Code2 } from "lucide-react";
import { InfoBox, SectionLabel, DetailSection, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn, getSeverityBg } from "@/lib/utils";
import type { CodeQualityMetadata, Finding } from "@/types/api";

interface LintDetailProps {
  lintResults: CodeQualityMetadata["lintResults"];
  findings: Finding[];
  focusType?: "errors" | "warnings" | "fixable";
}

export function LintDetail({ lintResults, findings, focusType }: LintDetailProps) {
  const lintFindings = findings.filter((f) => f.category.toLowerCase().includes("lint") || f.category.toLowerCase().includes("static analysis"));

  const errorRules = lintResults.rules.filter((r) => r.severity === "error");
  const warningRules = lintResults.rules.filter((r) => r.severity === "warning");

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <InfoBox label="Errors" value={lintResults.errors} bad={lintResults.errors > 0} />
        <InfoBox label="Warnings" value={lintResults.warnings} bad={lintResults.warnings > 20} />
        <InfoBox label="Auto-fixable" value={lintResults.fixable} highlight={lintResults.fixable > 0} />
      </div>

      <DetailSection title="What This Means">
        {focusType === "errors"
          ? "Lint errors are code issues that violate strict coding standards and often indicate bugs, security issues, or patterns that will cause problems in production. These should be fixed with highest priority."
          : focusType === "warnings"
          ? "Lint warnings indicate code style issues, potential problems, or deprecated patterns that should be addressed to maintain code quality and prevent future bugs."
          : focusType === "fixable"
          ? `${lintResults.fixable} issues can be automatically fixed by running your linter with the --fix flag. This is the fastest way to improve code quality.`
          : "Lint analysis checks your code against configured rules for errors, style violations, and potential bugs. Fewer issues mean cleaner, more maintainable code."}
      </DetailSection>

      {focusType === "fixable" && lintResults.fixable > 0 && (
        <div className="p-3 rounded-lg bg-green-500/[0.06] border border-green-500/15">
          <div className="text-xs font-semibold text-green-400 mb-1">Quick Win</div>
          <div className="text-[11px] text-gray-400">
            Run <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-brand-400 font-mono">npx eslint --fix .</code> to automatically fix {lintResults.fixable} issues.
          </div>
        </div>
      )}

      {/* Rules breakdown */}
      {lintResults.rules.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Rules Triggered" count={lintResults.rules.length} />
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {lintResults.rules
              .sort((a, b) => b.count - a.count)
              .map((rule, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-1 border border-white/[0.04]">
                  <div className="flex items-center gap-2 min-w-0">
                    {rule.severity === "error" ? (
                      <Bug className="w-3 h-3 text-red-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                    <span className="text-[11px] font-mono text-gray-300 truncate">{rule.rule}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs font-bold text-gray-200">{rule.count}</span>
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded",
                      rule.severity === "error" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400",
                    )}>
                      {rule.severity}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Related findings */}
      {lintFindings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Lint Findings" count={lintFindings.length} />
          {lintFindings.slice(0, 5).map((f) => (
            <div key={f.id} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className="text-xs text-gray-200 font-medium">{f.title}</div>
              <div className="text-[11px] text-gray-400 mt-1">{f.description}</div>
              {f.location?.file && (
                <div className="text-[10px] text-gray-500 font-mono mt-1">{f.location.file}{f.location.line ? `:${f.location.line}` : ""}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <ImpactBadge effort={lintResults.fixable > 0 ? "low" : "medium"} impact={`Fixing lint issues improves Code Quality score`} />
    </div>
  );
}
