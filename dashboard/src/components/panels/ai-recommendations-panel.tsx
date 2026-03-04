"use client";

import { useState } from "react";
import {
  Sparkles, Zap, TrendingUp, Target, Shield, Gauge, Code2,
  ArrowRight, CheckCircle2, AlertTriangle, ChevronRight, ChevronDown,
  Download, Copy, Share2, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { BeforeAfterBar } from "@/components/charts/before-after-bar";
import { cn, getSeverityBg } from "@/lib/utils";
import { useToastStore } from "@/lib/store";
import type { EnhancedRecommendation, Recommendation, KPIScore, AgentType } from "@/types/api";

interface AIRecommendationsPanelProps {
  recommendations: Recommendation[];
  enhancedRecommendations?: EnhancedRecommendation[];
  kpiScore: KPIScore;
}

export function AIRecommendationsPanel({
  recommendations,
  enhancedRecommendations,
  kpiScore,
}: AIRecommendationsPanelProps) {
  const [expandedPriority, setExpandedPriority] = useState<Set<number>>(new Set());
  const [expandedMatrix, setExpandedMatrix] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  // Use enhanced if available, otherwise derive from base recommendations
  const enhanced: EnhancedRecommendation[] = enhancedRecommendations?.length
    ? enhancedRecommendations
    : recommendations.slice(0, 10).map((r, i) => deriveEnhanced(r, i, kpiScore));

  const topFixes = enhanced.slice(0, 5);
  const quickWins = enhanced.filter((r) => r.quickWin);

  // Projected scores per category — capped at 100 per category
  const secCurrent = kpiScore.grades.security.rawScore;
  const perfCurrent = kpiScore.grades.performance.rawScore;
  const cqCurrent = kpiScore.grades.codeQuality.rawScore;

  const secProjected = Math.min(100, secCurrent + enhanced.filter((r) => r.category === "security").reduce((s, r) => s + r.projectedScoreGain / WEIGHTS.security, 0));
  const perfProjected = Math.min(100, perfCurrent + enhanced.filter((r) => r.category === "performance").reduce((s, r) => s + r.projectedScoreGain / WEIGHTS.performance, 0));
  const cqProjected = Math.min(100, cqCurrent + enhanced.filter((r) => r.category === "code-quality").reduce((s, r) => s + r.projectedScoreGain / WEIGHTS["code-quality"], 0));

  // Overall projected = weighted sum of per-category projected scores (same formula as KPI)
  const projectedOverall = Math.min(100,
    secProjected * WEIGHTS.security +
    perfProjected * WEIGHTS.performance +
    cqProjected * WEIGHTS["code-quality"],
  );
  const totalProjectedGain = Math.max(0, projectedOverall - kpiScore.overallScore);

  // Normalize per-item gains so they proportionally sum to the capped total
  const rawGainSum = enhanced.reduce((s, r) => s + r.projectedScoreGain, 0);
  const gainScale = rawGainSum > 0 ? totalProjectedGain / rawGainSum : 0;
  const displayGain = (rec: EnhancedRecommendation) =>
    Math.round(rec.projectedScoreGain * gainScale * 10) / 10;

  const projectedData = [
    { category: "Security", current: secCurrent, projected: secProjected },
    { category: "Performance", current: perfCurrent, projected: perfProjected },
    { category: "Code Quality", current: cqCurrent, projected: cqProjected },
  ];

  const togglePriority = (p: number) => {
    setExpandedPriority((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  const toggleMatrix = (p: number) => {
    setExpandedMatrix((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  // Build text summary for copy/download
  const buildTextSummary = () => {
    const lines: string[] = [];
    lines.push("=== AI-Powered Recommendations ===");
    lines.push(`Overall KPI: ${kpiScore.overallScore.toFixed(1)} → ${projectedOverall.toFixed(1)} (+${totalProjectedGain.toFixed(1)} pts)`);
    lines.push("");
    lines.push("--- Top 5 Priority Fixes ---");
    topFixes.forEach((rec) => {
      lines.push(`${rec.priority}. ${rec.title} [${rec.category}]`);
      lines.push(`   ${rec.description}`);
      lines.push(`   Impact: ${rec.impactScore}/10 | Risk: ${rec.riskScore}/10 | Ease: ${rec.easeScore}/10 | Gain: +${displayGain(rec).toFixed(1)} pts | Effort: ${rec.effort}`);
      if (rec.remediation) lines.push(`   Fix: ${rec.remediation}`);
      lines.push("");
    });
    lines.push("--- Success Matrix ---");
    enhanced.forEach((rec) => {
      lines.push(`${rec.priority}. ${rec.title} [${rec.category}] | Gain: +${displayGain(rec).toFixed(1)} | Effort: ${rec.effort} | Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
    });
    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildTextSummary());
      setCopied(true);
      addToast({ type: "success", title: "Copied to clipboard", duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch { addToast({ type: "error", title: "Copy failed", duration: 2000 }); }
  };

  const handleDownload = () => {
    const blob = new Blob([buildTextSummary()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vzy-recommendations-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: "success", title: "Downloaded recommendations", duration: 2000 });
  };

  const handleDownloadCSV = () => {
    const headers = ["Priority", "Issue", "Category", "Impact", "Risk", "Ease", "Gain", "Effort", "Confidence", "Description"];
    const rows = enhanced.map((rec) => [
      rec.priority, `"${rec.title}"`, rec.category, rec.impactScore, rec.riskScore,
      rec.easeScore, `+${displayGain(rec).toFixed(1)}`, rec.effort,
      `${(rec.confidence * 100).toFixed(0)}%`, `"${rec.description || ""}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vzy-success-matrix-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: "success", title: "Downloaded CSV", duration: 2000 });
  };

  // Link to the relevant page based on category
  const categoryLink = (category: string) =>
    category === "security" ? "/security" : category === "performance" ? "/performance" : "/code-quality";

  return (
    <div className="space-y-6">
      {/* Section Header with action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-600/20">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-100">AI-Powered Recommendations</h2>
            <p className="text-xs text-gray-500">Smart prioritization based on risk, impact, and ease of implementation</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopy} className="btn-ghost p-2 text-gray-500 hover:text-gray-300" title="Copy summary">
            {copied ? <ClipboardCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={handleDownload} className="btn-ghost p-2 text-gray-500 hover:text-gray-300" title="Download as text">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={handleDownloadCSV} className="btn-ghost p-2 text-gray-500 hover:text-gray-300" title="Download CSV">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Top 5 Priority Fixes (clickable/expandable) ── */}
      <div className="card">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Top 5 Priority Fixes</h3>
          </div>
          <div className="text-xs text-gray-500">
            Overall projected gain: <span className="text-green-400 font-bold">+{totalProjectedGain.toFixed(1)} pts</span>
          </div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {topFixes.map((rec) => {
            const isExpanded = expandedPriority.has(rec.priority);
            return (
              <div key={rec.priority}>
                <div
                  onClick={() => togglePriority(rec.priority)}
                  className="px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    {/* Priority badge */}
                    <div className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                      rec.priority <= 2 ? "bg-red-500/20 text-red-400" :
                      rec.priority <= 4 ? "bg-amber-500/20 text-amber-400" :
                      "bg-blue-500/20 text-blue-400",
                    )}>
                      {rec.priority}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-200">{rec.title}</span>
                        <CategoryBadge category={rec.category} />
                      </div>
                      <div className="text-xs text-gray-400 mb-2 pl-5">{rec.description}</div>

                      {/* Scores row */}
                      <div className="flex items-center gap-4 flex-wrap pl-5">
                        <ScoreChip label="Impact" value={rec.impactScore} max={10} colorHigh="text-red-400" />
                        <ScoreChip label="Risk" value={rec.riskScore} max={10} colorHigh="text-amber-400" />
                        <ScoreChip label="Ease" value={rec.easeScore} max={10} colorHigh="text-green-400" />
                        <div className="flex items-center gap-1 text-xs">
                          <TrendingUp className="w-3 h-3 text-green-400" />
                          <span className="text-green-400 font-semibold">+{displayGain(rec).toFixed(1)}</span>
                          <span className="text-gray-500">pts</span>
                        </div>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-medium",
                          rec.effort === "low" ? "bg-green-500/15 text-green-400" :
                          rec.effort === "medium" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400",
                        )}>
                          {rec.effort} effort
                        </span>
                        {rec.quickWin && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 font-medium flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" /> Quick Win
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="px-5 pb-4 pl-[76px] space-y-3 animate-fade-up">
                    {rec.remediation && (
                      <div className="bg-surface-1 rounded-lg p-3 border border-white/[0.04]">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1">Remediation</div>
                        <div className="text-xs text-gray-300">{rec.remediation}</div>
                      </div>
                    )}
                    {rec.affectedMetric && (
                      <div className="text-xs text-gray-500">
                        <span className="font-medium">Affected metric:</span> {rec.affectedMetric}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <Link
                        href={categoryLink(rec.category)}
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        View {rec.category} findings <ArrowRight className="w-3 h-3" />
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const text = `${rec.priority}. ${rec.title}\n${rec.description}\nRemediation: ${rec.remediation || "N/A"}\nGain: +${displayGain(rec).toFixed(1)} pts`;
                          navigator.clipboard.writeText(text);
                          addToast({ type: "success", title: "Copied fix details", duration: 2000 });
                        }}
                        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quick Wins (clickable → navigate to category page) ── */}
      {quickWins.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Quick Wins</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400">{quickWins.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickWins.map((qw) => (
              <Link
                key={qw.priority}
                href={categoryLink(qw.category)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-1 border border-white/[0.04] hover:bg-white/[0.04] hover:border-brand-500/30 transition-colors cursor-pointer group"
              >
                <CategoryIcon category={qw.category} />
                <span className="text-xs text-gray-300 group-hover:text-gray-200">{qw.title}</span>
                <span className="text-[10px] text-green-400 font-semibold">+{displayGain(qw).toFixed(1)}</span>
                <ArrowRight className="w-3 h-3 text-gray-600 group-hover:text-brand-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Projected Score Chart ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Projected Score After Fixes</h3>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-amber-500/60" />
              <span className="text-gray-400">Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500" />
              <span className="text-gray-400">Projected</span>
            </div>
          </div>
        </div>
        <BeforeAfterBar data={projectedData} />
        <div className="mt-3 text-center">
          <span className="text-xs text-gray-500">Overall KPI: </span>
          <span className="text-sm font-bold text-gray-200">{kpiScore.overallScore.toFixed(1)}</span>
          <span className="text-xs text-gray-500 mx-2">→</span>
          <span className={cn("text-sm font-bold", projectedOverall >= 95 ? "text-green-400" : "text-blue-400")}>
            {projectedOverall.toFixed(1)}
          </span>
          <span className="text-xs text-green-400 ml-2">(+{totalProjectedGain.toFixed(1)})</span>
        </div>
      </div>

      {/* ── Success Matrix (clickable rows with expansion) ── */}
      <div className="card">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Success Matrix</h3>
          </div>
          <button onClick={handleDownloadCSV} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors" title="Download as CSV">
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Issue</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Impact</th>
                <th>Post-Fix Gain</th>
                <th>Effort</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {enhanced.map((rec) => {
                const isExpanded = expandedMatrix.has(rec.priority);
                return (
                  <>
                    <tr
                      key={rec.priority}
                      onClick={() => toggleMatrix(rec.priority)}
                      className="cursor-pointer hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="text-xs font-bold text-gray-400">{rec.priority}</td>
                      <td className="text-xs text-gray-200 max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
                          <span className="truncate">{rec.title}</span>
                        </div>
                      </td>
                      <td><CategoryBadge category={rec.category} /></td>
                      <td>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }, (_, i) => (
                            <div
                              key={i}
                              className={cn(
                                "w-1.5 h-4 rounded-sm",
                                i < Math.ceil(rec.riskScore / 2) ? "bg-red-500/80" : "bg-white/[0.06]",
                              )}
                            />
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }, (_, i) => (
                            <div
                              key={i}
                              className={cn(
                                "w-1.5 h-4 rounded-sm",
                                i < Math.ceil(rec.impactScore / 2) ? "bg-amber-500/80" : "bg-white/[0.06]",
                              )}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="text-xs font-semibold text-green-400">+{displayGain(rec).toFixed(1)}</td>
                      <td>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-medium",
                          rec.effort === "low" ? "bg-green-500/15 text-green-400" :
                          rec.effort === "medium" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400",
                        )}>
                          {rec.effort}
                        </span>
                      </td>
                      <td className="text-xs text-gray-400">{(rec.confidence * 100).toFixed(0)}%</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${rec.priority}-detail`} className="bg-surface-1/50">
                        <td colSpan={8} className="!py-3 !px-6">
                          <div className="space-y-2">
                            <div className="text-xs text-gray-300">{rec.description}</div>
                            {rec.remediation && (
                              <div className="bg-surface-0/50 rounded p-2 border border-white/[0.04]">
                                <span className="text-[10px] text-gray-500 font-medium">Remediation: </span>
                                <span className="text-xs text-gray-300">{rec.remediation}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3">
                              <Link href={categoryLink(rec.category)} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                                View details <ArrowRight className="w-3 h-3" />
                              </Link>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(`${rec.title}: ${rec.description}\nRemediation: ${rec.remediation || "N/A"}`);
                                  addToast({ type: "success", title: "Copied", duration: 2000 });
                                }}
                                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Helper Components ──

const WEIGHTS: Record<string, number> = { security: 0.40, performance: 0.35, "code-quality": 0.25 };

function CategoryBadge({ category }: { category: AgentType | string }) {
  const config: Record<string, { label: string; color: string }> = {
    security: { label: "Security", color: "bg-red-500/15 text-red-400 border-red-500/30" },
    performance: { label: "Performance", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    "code-quality": { label: "Code Quality", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  };
  const c = config[category] || { label: category, color: "bg-white/[0.06] text-gray-400 border-white/[0.08]" };
  return <span className={cn("badge text-[9px]", c.color)}>{c.label}</span>;
}

function CategoryIcon({ category }: { category: AgentType | string }) {
  if (category === "security") return <Shield className="w-3 h-3 text-red-400" />;
  if (category === "performance") return <Gauge className="w-3 h-3 text-blue-400" />;
  return <Code2 className="w-3 h-3 text-purple-400" />;
}

function ScoreChip({ label, value, max, colorHigh }: { label: string; value: number; max: number; colorHigh: string }) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="text-gray-500">{label}:</span>
      <span className={cn("font-bold", value >= max * 0.7 ? colorHigh : "text-gray-300")}>{value}/{max}</span>
    </div>
  );
}

// Derive enhanced recommendation from base when backend doesn't provide them
function deriveEnhanced(r: Recommendation, index: number, kpiScore: KPIScore): EnhancedRecommendation {
  const effortScore = r.effort === "low" ? 8 : r.effort === "medium" ? 5 : 3;
  const impactScore = Math.max(1, 10 - index);
  const riskScore = Math.max(1, 8 - index);
  const weight = WEIGHTS[r.category] || 0.25;
  const categoryScore = r.category === "security" ? kpiScore.grades.security.rawScore :
    r.category === "performance" ? kpiScore.grades.performance.rawScore :
    kpiScore.grades.codeQuality.rawScore;
  const gap = 100 - categoryScore;
  const recoveryFraction = (impactScore / 10) * 0.15;
  const projectedGain = Math.round(gap * recoveryFraction * weight * 100) / 100;

  return {
    ...r,
    priority: index + 1,
    impactScore,
    riskScore,
    easeScore: effortScore,
    projectedScoreGain: projectedGain,
    confidence: 0.7,
    quickWin: effortScore >= 7 && impactScore >= 5,
    affectedMetric: r.category === "security" ? "Security Score" : r.category === "performance" ? "Performance Score" : "Code Quality Score",
  };
}
