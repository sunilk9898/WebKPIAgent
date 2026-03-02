"use client";

import { useState } from "react";
import {
  FileJson, FileText, Download, Share2, Calendar,
  TrendingUp, TrendingDown, ArrowRight, Copy, Check, Link2,
  Code2, Briefcase, Loader2, Sparkles, RefreshCw, FileDown,
} from "lucide-react";
import { TrendChart } from "@/components/charts/trend-chart";
import { useScanReport } from "@/hooks/use-scan-report";
import { generateReport, type GeneratedReport } from "@/lib/api";
import { cn, timeAgo, getScoreColor, getSeverityBg } from "@/lib/utils";
import { generateManagementPDF, generateDeveloperPDF, generateFullPDF } from "@/lib/pdf-generator";
import { ExecutiveSummary } from "@/components/shared/executive-summary";

type ReportMode = "overview" | "management" | "developer";

export default function ReportingPage() {
  const { report } = useScanReport();
  const [copied, setCopied] = useState(false);
  const [activeMode, setActiveMode] = useState<ReportMode>("overview");
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [mgmtReport, setMgmtReport] = useState<GeneratedReport | null>(null);
  const [devReport, setDevReport] = useState<GeneratedReport | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);

  if (!report) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center text-gray-500 space-y-2">
          <FileText className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">No report data. Run a scan to generate reports.</p>
        </div>
      </div>
    );
  }

  const kpi = report.kpiScore;
  const comparison = report.comparisonWithPrevious;

  // Download JSON
  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vzy-scan-${report.scanId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download Management PDF
  const handleDownloadManagementPDF = async () => {
    if (!report) return;
    setPdfGenerating("management");
    try {
      let aiContent = mgmtReport?.content;
      if (!aiContent) {
        try {
          const result = await generateReport(report.scanId, "management");
          setMgmtReport(result);
          aiContent = result.content;
        } catch { /* proceed without AI content */ }
      }
      generateManagementPDF(report, aiContent);
    } finally {
      setPdfGenerating(null);
    }
  };

  // Download Developer PDF
  const handleDownloadDeveloperPDF = async () => {
    if (!report) return;
    setPdfGenerating("developer");
    try {
      let aiContent = devReport?.content;
      if (!aiContent) {
        try {
          const result = await generateReport(report.scanId, "developer");
          setDevReport(result);
          aiContent = result.content;
        } catch { /* proceed without AI content */ }
      }
      generateDeveloperPDF(report, aiContent);
    } finally {
      setPdfGenerating(null);
    }
  };

  // Download Complete Comprehensive PDF
  const handleDownloadFullPDF = async () => {
    if (!report) return;
    setPdfGenerating("full");
    try {
      // Fetch both AI reports in parallel if not already cached
      const [mgmt, dev] = await Promise.all([
        mgmtReport ? Promise.resolve(mgmtReport) : generateReport(report.scanId, "management").catch(() => null),
        devReport ? Promise.resolve(devReport) : generateReport(report.scanId, "developer").catch(() => null),
      ]);
      if (mgmt) setMgmtReport(mgmt);
      if (dev) setDevReport(dev);
      generateFullPDF(report, undefined, mgmt?.content, dev?.content);
    } finally {
      setPdfGenerating(null);
    }
  };

  // Copy share link
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/reports/${report.scanId}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate AI report
  const handleGenerate = async (mode: "management" | "developer") => {
    setGenerating(true);
    setGenError(null);
    try {
      const result = await generateReport(report.scanId, mode);
      setGeneratedReport(result);
      // Cache for PDF generation
      if (mode === "management") setMgmtReport(result);
      else setDevReport(result);
    } catch (err: any) {
      setGenError(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  // Switch mode tab
  const handleModeSwitch = (mode: ReportMode) => {
    setActiveMode(mode);
    if (mode !== "overview" && (!generatedReport || generatedReport.mode !== mode)) {
      handleGenerate(mode);
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Reporting</h1>
          <p className="text-sm text-gray-500">Download, compare, and share scan reports</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={handleDownloadJSON} className="btn-secondary text-xs">
            <FileJson className="w-4 h-4" /> JSON
          </button>
          <button
            onClick={handleDownloadFullPDF}
            disabled={pdfGenerating === "full"}
            className="btn-primary text-xs"
          >
            {pdfGenerating === "full" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {pdfGenerating === "full" ? "Generating..." : "Full Report PDF"}
          </button>
          <button onClick={handleShare} className="btn-secondary text-xs">
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </div>

      {/* ── Mode Tabs ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-1 border border-white/[0.06] w-fit">
        {([
          { key: "overview" as ReportMode, label: "Overview", icon: FileText },
          { key: "management" as ReportMode, label: "Management", icon: Briefcase },
          { key: "developer" as ReportMode, label: "Developer", icon: Code2 },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleModeSwitch(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all",
              activeMode === key
                ? "bg-brand-600/20 text-brand-300 shadow-sm"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview Mode (Original Report) ── */}
      {activeMode === "overview" && (
        <>
          {/* Report Summary Card */}
          <div className="card p-6 print:shadow-none" id="report-content">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-100">Scan Report</h2>
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  <div>Scan ID: {report.scanId}</div>
                  <div>Generated: {new Date(report.generatedAt).toLocaleString()}</div>
                  <div>Target: {report.target.url || report.target.repoPath}</div>
                  <div>Platform: {report.platform}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={cn("text-4xl font-bold tabular-nums", getScoreColor(kpi.overallScore))}>
                  {kpi.overallScore}
                </div>
                <div className="text-xs text-gray-500">/ 100 Overall KPI</div>
                <div className={cn(
                  "badge mt-2",
                  kpi.passesThreshold ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-red-500/15 text-red-400 border-red-500/30",
                )}>
                  {kpi.passesThreshold ? "PASS" : "FAIL"}
                </div>
              </div>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Security", score: kpi.grades.security.rawScore, weight: "40%" },
                { label: "Performance", score: kpi.grades.performance.rawScore, weight: "35%" },
                { label: "Code Quality", score: kpi.grades.codeQuality.rawScore, weight: "25%" },
              ].map((g) => (
                <div key={g.label} className="p-4 rounded-lg bg-surface-1 text-center">
                  <div className="text-xs text-gray-500">{g.label} ({g.weight})</div>
                  <div className={cn("text-2xl font-bold mt-1", getScoreColor(g.score))}>{g.score}</div>
                </div>
              ))}
            </div>

            {/* Executive Summary */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-200 mb-2">Executive Summary</h3>
              <ExecutiveSummary text={report.executiveSummary} maxLines={6} variant="inline" />
            </div>

            {/* Critical Findings Summary */}
            {report.criticalFindings.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-200 mb-3">
                  Critical & High Findings ({report.criticalFindings.length})
                </h3>
                <table className="data-table">
                  <thead>
                    <tr><th>Severity</th><th>Finding</th><th>Category</th><th>Agent</th></tr>
                  </thead>
                  <tbody>
                    {report.criticalFindings.slice(0, 20).map((f) => (
                      <tr key={f.id}>
                        <td><span className={cn("badge text-[10px]", getSeverityBg(f.severity))}>{f.severity.toUpperCase()}</span></td>
                        <td className="text-xs text-gray-200 max-w-[300px] truncate">{f.title}</td>
                        <td className="text-xs text-gray-400">{f.category}</td>
                        <td className="text-xs text-gray-500 capitalize">{f.agent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-200 mb-3">Recommendations</h3>
                <div className="space-y-2">
                  {report.recommendations.map((r) => (
                    <div key={r.priority} className="flex items-start gap-3 p-3 rounded-lg bg-surface-1">
                      <span className="text-xs font-bold text-brand-400 mt-0.5">#{r.priority}</span>
                      <div>
                        <div className="text-sm text-gray-200">{r.title}</div>
                        <div className="text-xs text-gray-400">{r.description}</div>
                      </div>
                      <span className={cn(
                        "badge text-[10px] ml-auto flex-shrink-0",
                        r.effort === "low" ? "bg-green-500/15 text-green-400 border-green-500/30"
                        : r.effort === "medium" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30",
                      )}>
                        {r.effort} effort
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Regression Comparison */}
          {comparison && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-200 mb-4">Regression Comparison</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-4 rounded-lg bg-surface-1 text-center">
                  <div className="text-xs text-gray-500">Score Delta</div>
                  <div className={cn(
                    "text-2xl font-bold mt-1",
                    comparison.scoreDelta > 0 ? "text-green-400" : comparison.scoreDelta < 0 ? "text-red-400" : "text-gray-400",
                  )}>
                    {comparison.scoreDelta > 0 ? "+" : ""}{comparison.scoreDelta.toFixed(1)}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-surface-1 text-center">
                  <div className="text-xs text-gray-500">New Findings</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">{comparison.newFindings.length}</div>
                </div>
                <div className="p-4 rounded-lg bg-surface-1 text-center">
                  <div className="text-xs text-gray-500">Resolved</div>
                  <div className="text-2xl font-bold text-green-400 mt-1">{comparison.resolvedFindings.length}</div>
                </div>
              </div>

              {comparison.regressions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-400 mb-2">Regressions</h4>
                  <div className="space-y-2">
                    {comparison.regressions.map((r, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded bg-red-500/[0.04]">
                        <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-sm text-gray-300 flex-1">{r.metric}</span>
                        <span className="text-xs text-gray-500 tabular-nums">{r.previousValue} <ArrowRight className="w-3 h-3 inline" /> {r.currentValue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Weekly Summary Trend */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Weekly Summary</h3>
            <TrendChart data={kpi.trend.history} height={240} showBreakdown />
          </div>
        </>
      )}

      {/* ── Management Mode ── */}
      {activeMode === "management" && (
        <AIReportView
          mode="management"
          report={generatedReport}
          generating={generating}
          error={genError}
          onRegenerate={() => handleGenerate("management")}
          kpi={kpi}
          scanReport={report}
          onDownloadPDF={handleDownloadManagementPDF}
          pdfGenerating={pdfGenerating === "management"}
        />
      )}

      {/* ── Developer Mode ── */}
      {activeMode === "developer" && (
        <AIReportView
          mode="developer"
          report={generatedReport}
          generating={generating}
          error={genError}
          onRegenerate={() => handleGenerate("developer")}
          kpi={kpi}
          scanReport={report}
          onDownloadPDF={handleDownloadDeveloperPDF}
          pdfGenerating={pdfGenerating === "developer"}
        />
      )}

      {/* PDF generation replaces browser print */}
    </div>
  );
}

// ── AI-Generated Report View ──
function AIReportView({
  mode,
  report,
  generating,
  error,
  onRegenerate,
  kpi,
  scanReport,
  onDownloadPDF,
  pdfGenerating,
}: {
  mode: "management" | "developer";
  report: GeneratedReport | null;
  generating: boolean;
  error: string | null;
  onRegenerate: () => void;
  kpi: any;
  scanReport: any;
  onDownloadPDF?: () => void;
  pdfGenerating?: boolean;
}) {
  const isManagement = mode === "management";
  const Icon = isManagement ? Briefcase : Code2;

  return (
    <div className="space-y-6">
      {/* Mode Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-lg",
              isManagement ? "bg-amber-500/15" : "bg-blue-500/15",
            )}>
              <Icon className={cn("w-5 h-5", isManagement ? "text-amber-400" : "text-blue-400")} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-100">
                {isManagement ? "Management Report" : "Developer Report"}
              </h2>
              <p className="text-xs text-gray-500">
                {isManagement
                  ? "Executive overview with risk posture, compliance, and strategic roadmap"
                  : "Technical deep-dive with code patches, configs, and optimization guides"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDownloadPDF && (
              <button
                onClick={onDownloadPDF}
                disabled={pdfGenerating}
                className="btn-primary text-xs"
              >
                {pdfGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5" />
                )}
                {pdfGenerating ? "Generating PDF..." : "Download PDF"}
              </button>
            )}
            <button
              onClick={onRegenerate}
              disabled={generating}
              className="btn-secondary text-xs"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {generating ? "Generating..." : "Regenerate"}
            </button>
          </div>
        </div>
      </div>

      {/* Score Summary (always visible) */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500">Overall KPI</div>
          <div className={cn("text-2xl font-bold mt-1", getScoreColor(kpi.overallScore))}>
            {kpi.overallScore}
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500">Security</div>
          <div className={cn("text-2xl font-bold mt-1", getScoreColor(kpi.grades.security.rawScore))}>
            {kpi.grades.security.rawScore}
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500">Performance</div>
          <div className={cn("text-2xl font-bold mt-1", getScoreColor(kpi.grades.performance.rawScore))}>
            {kpi.grades.performance.rawScore}
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500">Code Quality</div>
          <div className={cn("text-2xl font-bold mt-1", getScoreColor(kpi.grades.codeQuality.rawScore))}>
            {kpi.grades.codeQuality.rawScore}
          </div>
        </div>
      </div>

      {/* AI Generated Content */}
      {generating && (
        <div className="card p-12 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
            <Sparkles className="w-6 h-6 text-brand-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-gray-200">
              Generating {isManagement ? "Management" : "Developer"} Report
            </div>
            <div className="text-xs text-gray-500 mt-1">
              AI is analyzing scan results and crafting your report...
            </div>
          </div>
        </div>
      )}

      {error && !generating && (
        <div className="card p-6 text-center space-y-3">
          <div className="text-red-400 text-sm">{error}</div>
          <button onClick={onRegenerate} className="btn-primary text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </button>
        </div>
      )}

      {report && report.mode === mode && !generating && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-400" />
              <span className="text-xs text-gray-500">
                AI-generated {isManagement ? "management" : "developer"} report
              </span>
            </div>
            <span className="text-[10px] text-gray-600">
              {new Date(report.generatedAt).toLocaleString()}
            </span>
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            <div
              className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-100 [&_h1]:mt-6 [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-200 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-200 [&_h3]:mt-4 [&_h3]:mb-2"
              dangerouslySetInnerHTML={{ __html: renderReportContent(report.content) }}
            />
          </div>
        </div>
      )}

      {/* Contextual cards for management mode */}
      {isManagement && !generating && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Risk Status</h3>
            <div className="space-y-2">
              {[
                { label: "Security Posture", score: kpi.grades.security.rawScore },
                { label: "Performance Health", score: kpi.grades.performance.rawScore },
                { label: "Code Maintainability", score: kpi.grades.codeQuality.rawScore },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-surface-4 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          item.score >= 90 ? "bg-green-500" : item.score >= 70 ? "bg-amber-500" : "bg-red-500",
                        )}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-xs font-bold tabular-nums w-8 text-right",
                      getScoreColor(item.score),
                    )}>
                      {item.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Compliance Snapshot</h3>
            <div className="space-y-2">
              {[
                { label: "OWASP Top 10", status: kpi.grades.security.rawScore >= 85 },
                { label: "Performance Budget", status: kpi.grades.performance.rawScore >= 90 },
                { label: "Code Standards", status: kpi.grades.codeQuality.rawScore >= 80 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{item.label}</span>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-medium",
                    item.status
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400",
                  )}>
                    {item.status ? "Compliant" : "At Risk"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Contextual cards for developer mode */}
      {!isManagement && !generating && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-red-400">
              {scanReport.criticalFindings.filter((f: any) => f.severity === "critical").length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Critical Vulnerabilities</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-amber-400">
              {scanReport.criticalFindings.filter((f: any) => f.severity === "high").length}
            </div>
            <div className="text-xs text-gray-500 mt-1">High-Priority Issues</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-green-400">
              {scanReport.recommendations.filter((r: any) => r.effort === "low").length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Quick Fixes Available</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple markdown-ish rendering for AI report content
function renderReportContent(content: string): string {
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-100">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-3 text-brand-300 text-[11px] font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<div class="flex items-start gap-2 ml-2"><span class="text-brand-400 mt-1.5 text-[8px]">●</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex items-start gap-2 ml-2"><span class="text-brand-400 text-xs font-bold min-w-[16px]">$1.</span><span>$2</span></div>');
}
