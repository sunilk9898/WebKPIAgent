"use client";

import {
  Sparkles, Zap, TrendingUp, Target, Shield, Gauge, Code2,
  ArrowRight, CheckCircle2, AlertTriangle, ChevronRight,
} from "lucide-react";
import { BeforeAfterBar } from "@/components/charts/before-after-bar";
import { cn, getSeverityBg } from "@/lib/utils";
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

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-brand-600/20">
          <Sparkles className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-100">AI-Powered Recommendations</h2>
          <p className="text-xs text-gray-500">Smart prioritization based on risk, impact, and ease of implementation</p>
        </div>
      </div>

      {/* ── Top 5 Priority Fixes ── */}
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
          {topFixes.map((rec) => (
            <div key={rec.priority} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
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
                    <span className="text-sm font-medium text-gray-200">{rec.title}</span>
                    <CategoryBadge category={rec.category} />
                  </div>
                  <div className="text-xs text-gray-400 mb-2">{rec.description}</div>

                  {/* Scores row */}
                  <div className="flex items-center gap-4 flex-wrap">
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
          ))}
        </div>
      </div>

      {/* ── Quick Wins ── */}
      {quickWins.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Quick Wins</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400">{quickWins.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickWins.map((qw) => (
              <div key={qw.priority} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-1 border border-white/[0.04]">
                <CategoryIcon category={qw.category} />
                <span className="text-xs text-gray-300">{qw.title}</span>
                <span className="text-[10px] text-green-400 font-semibold">+{displayGain(qw).toFixed(1)}</span>
              </div>
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

      {/* ── Success Matrix ── */}
      <div className="card">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-gray-200">Success Matrix</h3>
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
              {enhanced.map((rec) => (
                <tr key={rec.priority}>
                  <td className="text-xs font-bold text-gray-400">{rec.priority}</td>
                  <td className="text-xs text-gray-200 max-w-[200px] truncate">{rec.title}</td>
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
              ))}
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
  // Gap-based projection: each fix recovers a fraction of the remaining gap to 100
  const categoryScore = r.category === "security" ? kpiScore.grades.security.rawScore :
    r.category === "performance" ? kpiScore.grades.performance.rawScore :
    kpiScore.grades.codeQuality.rawScore;
  const gap = 100 - categoryScore;
  // Higher-priority items recover more of the gap; scale by weight for overall contribution
  const recoveryFraction = (impactScore / 10) * 0.15; // top item recovers ~15% of gap
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
