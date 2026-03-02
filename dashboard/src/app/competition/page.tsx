"use client";

import { useState, useCallback, useEffect } from "react";
import {
  GitCompareArrows, Loader2, Trophy, Shield, Gauge, Code2,
  TrendingUp, AlertTriangle, CheckCircle2, Crown, Target, ArrowRight,
  Download, Copy, FileText, Presentation,
  Eye, BarChart3, Sparkles, Database, Search, RefreshCw, Clock, Plus, X,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { useComparisonStore, type CompareViewMode } from "@/lib/store";
import { compareUrls, getScannedUrls, triggerBatchScan, triggerScan, deleteScannedUrl, type ScannedUrlEntry } from "@/lib/api";
import { ScanInput } from "@/components/shared/scan-input";
import { ComparisonRadarChart, type RadarDataPoint, type RadarSite } from "@/components/charts/radar-chart";
import { ComparisonBarChart, type ComparisonBarDataPoint, type ComparisonBarSite } from "@/components/charts/comparison-bar";
import type { ComparisonResult, ComparisonSiteData, AIComparisonAnalysis } from "@/types/api";

// Core OTT preset URLs — these cannot be removed
const PRESET_URLS = new Set([
  "https://www.vzy.one/",
  "https://www.watcho.com",
  "https://www.tataplaybinge.com/",
  "https://www.airtelxstream.in/",
  "https://www.ottplay.com/",
  "https://www.zee5.com/",
  "https://www.hotstar.com/in/home",
]);

// ── Color Palette for Sites ──
const SITE_COLORS = ["#3b82f6", "#f59e0b", "#a855f7", "#06b6d4", "#f43f5e", "#10b981"];

function getSiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

// Safe accessors for nested ComparisonSiteData fields (sites may have zeroed/missing data)
function safeLH(site: ComparisonSiteData) {
  return site?.lighthouseScores || { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
}
function safeDRM(site: ComparisonSiteData) {
  return site?.drmStatus || { widevineDetected: false, fairplayDetected: false, licenseUrlExposed: false };
}
function safeCWV(site: ComparisonSiteData) {
  return site?.coreWebVitals || {};
}

const EMPTY_AI: AIComparisonAnalysis = {
  competitiveGapScore: 0,
  verdict: "Analysis unavailable",
  leader: "",
  primaryStrengths: [],
  primaryWeaknesses: [],
  competitorInsights: [],
  improvementRoadmap: [
    { timeframe: "30-day", actions: ["Run a complete scan with valid URLs"] },
    { timeframe: "60-day", actions: [] },
    { timeframe: "90-day", actions: [] },
  ],
  strategicSuggestions: [],
  successMatrix: [],
  riskRating: "medium",
  businessImpactScore: 0,
};

function safeAI(result: ComparisonResult): AIComparisonAnalysis {
  const ai = result.aiAnalysis;
  if (!ai || !ai.verdict) return EMPTY_AI;
  return {
    ...EMPTY_AI,
    ...ai,
    primaryStrengths: ai.primaryStrengths || [],
    primaryWeaknesses: ai.primaryWeaknesses || [],
    competitorInsights: ai.competitorInsights || [],
    improvementRoadmap: ai.improvementRoadmap || EMPTY_AI.improvementRoadmap,
    strategicSuggestions: ai.strategicSuggestions || [],
    successMatrix: ai.successMatrix || [],
  };
}

function getSiteKey(_url: string, index: number): string {
  return `site_${index}`;
}

// ============================================================================
// Main Competition Page — Analysis-First UI
// ============================================================================
type AnalysisMode = "existing" | "fresh";

export default function CompetitionPage() {
  const {
    result, viewMode, loading, error,
    setResult, setViewMode, setLoading, setError,
    reset,
  } = useComparisonStore();

  // ── Analysis mode state ──
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("existing");
  const [scannedUrls, setScannedUrls] = useState<ScannedUrlEntry[]>([]);
  const [urlsLoading, setUrlsLoading] = useState(true);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState({ current: 0, total: 0 });
  const [addUrlInput, setAddUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);

  // ── Auto-fetch scanned URLs on mount ──
  const fetchScannedUrls = useCallback(() => {
    setUrlsLoading(true);
    getScannedUrls()
      .then((data) => {
        // Sort: vzy.one first, watcho.com second, then rest by score descending
        const urls = data.urls || [];
        const priorityOrder = ["vzy.one", "watcho.com"];
        urls.sort((a, b) => {
          const aHost = getSiteLabel(a.url);
          const bHost = getSiteLabel(b.url);
          const aIdx = priorityOrder.findIndex((p) => aHost.includes(p));
          const bIdx = priorityOrder.findIndex((p) => bHost.includes(p));
          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
          if (aIdx !== -1) return -1;
          if (bIdx !== -1) return 1;
          return Number(b.score) - Number(a.score);
        });
        setScannedUrls(urls);
        if (!data.urls || data.urls.length === 0) {
          setAnalysisMode("fresh");
        }
      })
      .catch(() => {
        setAnalysisMode("fresh");
      })
      .finally(() => setUrlsLoading(false));
  }, []);

  useEffect(() => {
    fetchScannedUrls();
  }, [fetchScannedUrls]);

  // ── Toggle URL selection ──
  const toggleUrlSelection = useCallback((url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  // ── Select / Deselect all ──
  const selectAll = useCallback(() => {
    setSelectedUrls(new Set(scannedUrls.map((e) => e.url)));
  }, [scannedUrls]);

  const deselectAll = useCallback(() => {
    setSelectedUrls(new Set());
  }, []);

  // ── Compare selected existing URLs ──
  const handleCompareSelected = useCallback(async () => {
    const selected = Array.from(selectedUrls);
    if (selected.length < 2) {
      setError("Select at least 2 URLs to compare.");
      return;
    }
    const [primary, ...competitors] = selected;
    setComparing(true);
    setLoading(true);
    setError(null);
    try {
      const res = await compareUrls(primary, competitors);
      setResult(res);
      // Refresh scanned URLs in background for future use
      getScannedUrls().then((data) => setScannedUrls(data.urls || [])).catch(() => {});
    } catch (err: any) {
      setError(err.message || "Comparison failed");
    } finally {
      setComparing(false);
      setLoading(false);
    }
  }, [selectedUrls, setLoading, setError, setResult]);

  // ── Run Comparison from ScanInput (batch = multiple URLs) ──
  const handleBatchCompare = useCallback(async (config: { urls: string[] }) => {
    if (config.urls.length < 2) return;
    setComparing(true);
    setLoading(true);
    setError(null);
    try {
      const [primary, ...competitors] = config.urls;
      const res = await compareUrls(primary, competitors);
      setResult(res);
      // Refresh scanned URLs in background
      getScannedUrls().then((data) => setScannedUrls(data.urls || [])).catch(() => {});
    } catch (err: any) {
      setError(err.message || "Comparison failed");
    } finally {
      setComparing(false);
      setLoading(false);
    }
  }, [setLoading, setError, setResult]);

  // ── Single URL submitted — need at least 2 ──
  const handleSingleCompare = useCallback(async () => {
    setError("Please use Multiple URLs mode and add at least 2 URLs to compare.");
  }, [setError]);

  // ── New comparison — reset and go back to selection ──
  const handleNewComparison = useCallback(() => {
    reset();
    setComparing(false);
    setSelectedUrls(new Set());
    fetchScannedUrls();
  }, [reset, fetchScannedUrls]);

  // ── Re-scan all URLs — triggers fresh batch scan then refreshes list ──
  const handleRescanAll = useCallback(async () => {
    if (scannedUrls.length === 0) return;
    setRescanning(true);
    setRescanProgress({ current: 0, total: scannedUrls.length });
    setError(null);
    try {
      const urls = scannedUrls.map((e) => e.url);
      // Record timestamp BEFORE triggering scan — only scans after this count as "new"
      const rescanStartTime = new Date();
      await triggerBatchScan({ urls, agents: ["security", "performance", "code-quality"], platform: "both" });
      // Poll for completion — check every 15s for up to 10 min
      const maxAttempts = 40;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 15_000));
        try {
          const fresh = await getScannedUrls();
          const freshUrls = fresh.urls || [];
          // Count URLs with timestamps AFTER we started the re-scan
          const updatedCount = freshUrls.filter(
            (f) => new Date(f.scannedAt) > rescanStartTime
          ).length;
          setRescanProgress({ current: Math.min(updatedCount, urls.length), total: urls.length });
          // All URLs updated
          if (updatedCount >= urls.length) {
            break;
          }
        } catch { /* ignore polling errors */ }
      }
      // Final refresh with sorting
      fetchScannedUrls();
    } catch (err: any) {
      setError(err.message || "Re-scan failed");
    } finally {
      setRescanning(false);
      setRescanProgress({ current: 0, total: 0 });
    }
  }, [scannedUrls, setError, fetchScannedUrls]);

  // ── Add a new URL manually — scan it, then add to the list ──
  const handleAddUrl = useCallback(async () => {
    let url = addUrlInput.trim();
    if (!url) return;
    // Normalize URL
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    // Check if already exists
    if (scannedUrls.some((e) => e.url === url)) {
      setAddUrlInput("");
      setShowAddUrl(false);
      return;
    }
    setAddingUrl(true);
    try {
      await triggerScan({ url, agents: ["security", "performance", "code-quality"], platform: "both" });
      // Poll until the new URL appears in scanned URLs (max 6 min)
      const maxAttempts = 24;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 15_000));
        try {
          const fresh = await getScannedUrls();
          const freshUrls = fresh.urls || [];
          if (freshUrls.some((f) => f.url === url)) {
            fetchScannedUrls();
            break;
          }
        } catch { /* ignore */ }
      }
      setAddUrlInput("");
      setShowAddUrl(false);
    } catch (err: any) {
      setError(err.message || "Failed to add URL");
    } finally {
      setAddingUrl(false);
    }
  }, [addUrlInput, scannedUrls, setError, fetchScannedUrls]);

  // ── Remove a manually added URL ──
  const handleRemoveUrl = useCallback(async (url: string) => {
    try {
      await deleteScannedUrl(url);
      setSelectedUrls((prev) => { const next = new Set(prev); next.delete(url); return next; });
      setScannedUrls((prev) => prev.filter((e) => e.url !== url));
    } catch (err: any) {
      setError(err.message || "Failed to remove URL");
    }
  }, [setError]);

  // ── Compute last scan timestamp from scannedUrls ──
  const lastScanTime = scannedUrls.length > 0
    ? scannedUrls.reduce((latest, e) =>
        new Date(e.scannedAt) > new Date(latest.scannedAt) ? e : latest, scannedUrls[0]).scannedAt
    : null;

  const formatDateTime = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: true, timeZoneName: "short",
    });
  };

  // ── Build site arrays for charts ──
  const allSites: ComparisonSiteData[] = result
    ? [result.primary, ...(result.competitors || [])]
    : [];

  const chartSites: ComparisonBarSite[] = allSites.map((s, i) => ({
    key: getSiteKey(s.url, i),
    label: getSiteLabel(s.url),
    color: SITE_COLORS[i % SITE_COLORS.length],
  }));

  const radarSites: RadarSite[] = chartSites;

  const selectedArray = Array.from(selectedUrls);

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-brand-500/20 to-cyan-500/20 border border-brand-500/20">
            <GitCompareArrows className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100">Competition Analysis</h1>
            <p className="text-xs text-gray-500">Compare your site against competitor OTT platforms</p>
          </div>
        </div>
        {result && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewComparison}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              New Comparison
            </button>
            <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
          </div>
        )}
      </div>

      {/* ── Analysis Mode Selection (shown before results) ── */}
      {!result && !comparing && (
        <>
          {/* Mode Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card A: Analyze Existing */}
            <div
              onClick={() => setAnalysisMode("existing")}
              className={cn(
                "card p-5 text-left transition-all duration-200 cursor-pointer",
                analysisMode === "existing"
                  ? "border-brand-500/30 bg-brand-500/5 ring-1 ring-brand-500/20"
                  : "hover:border-white/[0.12] hover:bg-white/[0.02]",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2.5 rounded-lg",
                    analysisMode === "existing" ? "bg-brand-500/20" : "bg-white/[0.06]",
                  )}>
                    <Database className={cn("w-5 h-5", analysisMode === "existing" ? "text-brand-400" : "text-gray-400")} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-200">Analyze Existing Results</div>
                    <div className="text-[10px] text-gray-500">Use previously scanned data — no re-scan needed</div>
                  </div>
                </div>

                {/* Re-Scan Now Button */}
                {analysisMode === "existing" && scannedUrls.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRescanAll(); }}
                    disabled={rescanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50 transition-colors shrink-0"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", rescanning && "animate-spin")} />
                    {rescanning ? "Re-Scanning..." : "Re-Scan All"}
                  </button>
                )}
              </div>

              {/* Info row: URL count + Last scan timestamp */}
              {!urlsLoading && scannedUrls.length > 0 && (
                <div className="flex items-center gap-4 mt-2.5 ml-[52px]">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                    {scannedUrls.length} scanned URL{scannedUrls.length !== 1 ? "s" : ""} available
                  </div>
                  {lastScanTime && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <Clock className="w-3 h-3 text-gray-500" />
                      Last Scanned: {formatDateTime(lastScanTime)}
                    </div>
                  )}
                </div>
              )}

              {/* Re-scan progress */}
              {rescanning && (
                <div className="mt-3 ml-[52px] space-y-1.5">
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                      style={{ width: rescanProgress.total > 0 ? `${(rescanProgress.current / rescanProgress.total) * 100}%` : "0%" }}
                    />
                  </div>
                  <div className="text-[10px] text-amber-400/70">
                    Re-scanning {rescanProgress.current}/{rescanProgress.total} URLs...
                  </div>
                </div>
              )}
            </div>

            {/* Card B: Fresh Scan */}
            <button
              onClick={() => setAnalysisMode("fresh")}
              className={cn(
                "card p-5 text-left transition-all duration-200",
                analysisMode === "fresh"
                  ? "border-brand-500/30 bg-brand-500/5 ring-1 ring-brand-500/20"
                  : "hover:border-white/[0.12] hover:bg-white/[0.02]",
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "p-2.5 rounded-lg",
                  analysisMode === "fresh" ? "bg-brand-500/20" : "bg-white/[0.06]",
                )}>
                  <Search className={cn("w-5 h-5", analysisMode === "fresh" ? "text-brand-400" : "text-gray-400")} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-200">Run Fresh Scan</div>
                  <div className="text-[10px] text-gray-500">Scan new URLs and compare results</div>
                </div>
              </div>
            </button>
          </div>

          {/* ── Option A: Existing Results Selector ── */}
          {analysisMode === "existing" && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-200">Select URLs to Compare</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    First selected = your primary site, rest = competitors
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500">
                    {selectedUrls.size} selected
                  </span>
                  {scannedUrls.length > 0 && (
                    <button
                      onClick={selectedUrls.size === scannedUrls.length ? deselectAll : selectAll}
                      className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      {selectedUrls.size === scannedUrls.length ? "Deselect All" : "Select All"}
                    </button>
                  )}
                </div>
              </div>

              {urlsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                  <span className="text-xs text-gray-500 ml-2">Loading scanned URLs...</span>
                </div>
              ) : scannedUrls.length === 0 ? (
                <div className="text-center py-10">
                  <Database className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-medium">No Previously Scanned URLs</p>
                  <p className="text-[10px] text-gray-500 mt-1">Run scans from the Overview page first, or use Fresh Scan mode.</p>
                  <button
                    onClick={() => setAnalysisMode("fresh")}
                    className="mt-3 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    Switch to Fresh Scan
                  </button>
                </div>
              ) : (
                <>
                  {/* URL Selection List */}
                  <div className="space-y-1.5 max-h-[450px] overflow-y-auto pr-1">
                    {scannedUrls.map((entry) => {
                      const isSelected = selectedUrls.has(entry.url);
                      const selectionOrder = isSelected ? selectedArray.indexOf(entry.url) : -1;
                      const isPrimary = selectionOrder === 0;
                      const score = Number(entry.score) || 0;

                      return (
                        <button
                          key={entry.url}
                          onClick={() => toggleUrlSelection(entry.url)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left",
                            isSelected
                              ? isPrimary
                                ? "border-brand-500/30 bg-brand-500/10"
                                : "border-white/[0.15] bg-white/[0.04]"
                              : "border-white/[0.06] bg-surface-1 hover:border-white/[0.12] hover:bg-white/[0.03]",
                          )}
                        >
                          {/* Checkbox */}
                          <div className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                            isSelected ? "border-brand-500 bg-brand-500" : "border-gray-600",
                          )}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>

                          {/* Order number */}
                          {isSelected && (
                            <span className="text-[10px] text-gray-500 w-4 text-right flex-shrink-0">
                              {selectionOrder + 1}.
                            </span>
                          )}

                          {/* URL info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-200 truncate">
                                {getSiteLabel(entry.url)}
                              </span>
                              {isPrimary && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-400 font-medium border border-brand-500/20">
                                  PRIMARY
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-500 truncate mt-0.5">{entry.url}</div>
                          </div>

                          {/* Score badge */}
                          <div className={cn(
                            "text-sm font-bold flex-shrink-0 tabular-nums",
                            score >= 90 ? "text-green-400" : score >= 70 ? "text-amber-400" : "text-red-400",
                          )}>
                            {score.toFixed(1)}
                          </div>

                          {/* Time */}
                          <div className="text-[10px] text-gray-600 flex-shrink-0 w-20 text-right">
                            {timeAgo(entry.scannedAt)}
                          </div>

                          {/* Remove button — only for manually added (non-preset) URLs */}
                          {!PRESET_URLS.has(entry.url) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveUrl(entry.url); }}
                              className="p-1 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 ml-1"
                              title="Remove URL"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Add URL Section */}
                  {!showAddUrl ? (
                    <button
                      onClick={() => setShowAddUrl(true)}
                      className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors py-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add URL manually
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={addUrlInput}
                        onChange={(e) => setAddUrlInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddUrl(); if (e.key === "Escape") { setShowAddUrl(false); setAddUrlInput(""); } }}
                        placeholder="https://example.com"
                        className="input flex-1 text-sm py-1.5"
                        autoFocus
                        disabled={addingUrl}
                      />
                      <button
                        onClick={handleAddUrl}
                        disabled={!addUrlInput.trim() || addingUrl}
                        className="btn-primary text-xs py-1.5 px-3 shrink-0"
                      >
                        {addingUrl ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning...</>
                        ) : (
                          <><Plus className="w-3.5 h-3.5" /> Add & Scan</>
                        )}
                      </button>
                      <button
                        onClick={() => { setShowAddUrl(false); setAddUrlInput(""); }}
                        className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                        disabled={addingUrl}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Compare Button */}
                  <button
                    onClick={handleCompareSelected}
                    disabled={selectedUrls.size < 2 || addingUrl}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-brand-600 to-cyan-600 text-white text-sm font-semibold hover:from-brand-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    <GitCompareArrows className="w-4 h-4" />
                    Compare {selectedUrls.size} Selected Sites
                  </button>

                  {selectedUrls.size === 1 && (
                    <p className="text-[10px] text-amber-400/70 text-center">
                      Select at least one more URL to compare against
                    </p>
                  )}
                  {selectedUrls.size === 0 && (
                    <p className="text-[10px] text-gray-500 text-center">
                      Click URLs above to select them for comparison
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Option B: Fresh Scan ── */}
          {analysisMode === "fresh" && (
            <ScanInput
              onSubmit={handleSingleCompare}
              onBatchSubmit={handleBatchCompare}
              loading={loading}
              defaultMode="multi"
              submitLabel="Run Scan & Compare"
              batchSubmitLabel="Run Batch Scan & Compare"
            />
          )}
        </>
      )}

      {/* ── Loading State — Rich Progress UI ── */}
      {comparing && (
        <div className="card p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-[3px] border-brand-500/20 border-t-brand-400 animate-spin" />
              <GitCompareArrows className="w-5 h-5 text-brand-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-100">Comparing Sites...</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {analysisMode === "existing"
                  ? `Analyzing ${selectedUrls.size} selected sites using existing scan data`
                  : "Running fresh scans and comparing results"}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 animate-progress-bar" />
            </div>
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>Fetching scan data</span>
              <span>AI analysis</span>
              <span>Building report</span>
            </div>
          </div>

          {/* Selected URLs being compared */}
          {selectedUrls.size > 0 && analysisMode === "existing" && (
            <div className="flex flex-wrap gap-2 pt-1">
              {Array.from(selectedUrls).map((url, i) => (
                <div
                  key={url}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border",
                    i === 0
                      ? "bg-brand-500/10 border-brand-500/30 text-brand-400"
                      : "bg-white/[0.04] border-white/[0.08] text-gray-400",
                  )}
                >
                  {i === 0 && <Crown className="w-3 h-3" />}
                  <span>{getSiteLabel(url)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Error State ── */}
      {error && (
        <div className="card p-4 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {result && !comparing && allSites.length > 0 && (
        <>
          <ComparisonHeader result={result} />

          {viewMode === "summary" && <SummaryView result={result} chartSites={chartSites} radarSites={radarSites} allSites={allSites} />}
          {viewMode === "technical" && <TechnicalView result={result} chartSites={chartSites} allSites={allSites} />}
          {viewMode === "management" && <ManagementView result={result} allSites={allSites} />}

          <ExportSection result={result} />
        </>
      )}
    </div>
  );
}

// ============================================================================
// View Mode Toggle
// ============================================================================
function ViewModeToggle({ viewMode, setViewMode }: { viewMode: CompareViewMode; setViewMode: (m: CompareViewMode) => void }) {
  const modes: { key: CompareViewMode; label: string; icon: React.ElementType }[] = [
    { key: "summary", label: "Summary", icon: BarChart3 },
    { key: "technical", label: "Technical", icon: Code2 },
    { key: "management", label: "Management", icon: Presentation },
  ];

  return (
    <div className="flex items-center bg-surface-1 rounded-lg border border-white/[0.06] p-0.5">
      {modes.map((m) => {
        const Icon = m.icon;
        return (
          <button
            key={m.key}
            onClick={() => setViewMode(m.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              viewMode === m.key
                ? "bg-brand-600/20 text-brand-400"
                : "text-gray-500 hover:text-gray-300",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Comparison Header — Score Overview + AI Verdict
// ============================================================================
function ComparisonHeader({ result }: { result: ComparisonResult }) {
  const allSites = [result.primary, ...(result.competitors || [])].filter(Boolean);
  if (allSites.length === 0) return null;

  const leader = allSites.reduce((a, b) => ((a?.overallScore ?? 0) >= (b?.overallScore ?? 0) ? a : b));

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-gray-200">Score Overview</h3>
        <span className={cn(
          "ml-auto text-[10px] px-2.5 py-0.5 rounded-full font-medium",
          (result.aiAnalysis?.riskRating || "medium") === "low" ? "bg-green-500/15 text-green-400" :
          (result.aiAnalysis?.riskRating || "medium") === "medium" ? "bg-amber-500/15 text-amber-400" :
          (result.aiAnalysis?.riskRating || "medium") === "high" ? "bg-red-500/15 text-red-400" :
          "bg-red-500/25 text-red-300",
        )}>
          Risk: {(result.aiAnalysis?.riskRating || "N/A").toUpperCase()}
        </span>
      </div>

      {/* Site Score Cards */}
      <div className={cn("grid gap-3", allSites.length <= 3 ? "grid-cols-3" : allSites.length <= 4 ? "grid-cols-4" : "grid-cols-3 md:grid-cols-5")}>
        {allSites.map((site, i) => {
          if (!site) return null;
          const isLeader = site.url === leader?.url;
          const isPrimary = i === 0;
          const score = site.overallScore ?? 0;
          return (
            <div
              key={site.url}
              className={cn(
                "relative p-4 rounded-xl border text-center",
                isPrimary ? "border-brand-500/30 bg-brand-500/5" : "border-white/[0.06] bg-surface-1",
              )}
            >
              {isLeader && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5" /> Leader
                  </span>
                </div>
              )}
              {isPrimary && (
                <div className="text-[9px] text-brand-400 font-medium mb-1">YOUR SITE</div>
              )}
              <div className={cn(
                "text-2xl font-bold mb-1",
                score >= 90 ? "text-green-400" : score >= 70 ? "text-amber-400" : "text-red-400",
              )}>
                {score.toFixed(1)}
              </div>
              <div className="text-[10px] text-gray-500 truncate">{getSiteLabel(site.url)}</div>

              {/* Mini category bars */}
              <div className="mt-2 space-y-1">
                {[
                  { label: "Sec", score: site.securityScore ?? 0 },
                  { label: "Perf", score: site.performanceScore ?? 0 },
                  { label: "CQ", score: site.codeQualityScore ?? 0 },
                ].map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5">
                    <span className="text-[8px] text-gray-600 w-6">{c.label}</span>
                    <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                      <div
                        className={cn("h-full rounded-full", c.score >= 90 ? "bg-green-500" : c.score >= 70 ? "bg-amber-500" : "bg-red-500")}
                        style={{ width: `${Math.min(100, c.score)}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-gray-500 w-6 text-right">{c.score.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Verdict */}
      <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-brand-600/10 to-cyan-600/10 border border-brand-500/15">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-xs font-semibold text-gray-200">AI Verdict</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">{result.aiAnalysis?.verdict || "Analysis in progress..."}</p>
      </div>
    </div>
  );
}

// ============================================================================
// SUMMARY VIEW
// ============================================================================
function SummaryView({ result, chartSites, radarSites, allSites }: {
  result: ComparisonResult;
  chartSites: ComparisonBarSite[];
  radarSites: RadarSite[];
  allSites: ComparisonSiteData[];
}) {
  // Build radar data
  const radarData: RadarDataPoint[] = [
    "Overall", "Security", "Performance", "Code Quality", "Header Score", "Lighthouse Perf",
  ].map((metric) => {
    const point: RadarDataPoint = { metric };
    allSites.forEach((site, i) => {
      const key = getSiteKey(site.url, i);
      if (metric === "Overall") point[key] = site.overallScore ?? 0;
      else if (metric === "Security") point[key] = site.securityScore ?? 0;
      else if (metric === "Performance") point[key] = site.performanceScore ?? 0;
      else if (metric === "Code Quality") point[key] = site.codeQualityScore ?? 0;
      else if (metric === "Header Score") point[key] = site.headerScore ?? 0;
      else if (metric === "Lighthouse Perf") point[key] = safeLH(site).performance;
    });
    return point;
  });

  // Build bar data
  const barData: ComparisonBarDataPoint[] = [
    "Overall", "Security", "Performance", "Code Quality",
  ].map((cat) => {
    const point: ComparisonBarDataPoint = { category: cat };
    allSites.forEach((site, i) => {
      const key = getSiteKey(site.url, i);
      if (cat === "Overall") point[key] = site.overallScore ?? 0;
      else if (cat === "Security") point[key] = site.securityScore ?? 0;
      else if (cat === "Performance") point[key] = site.performanceScore ?? 0;
      else if (cat === "Code Quality") point[key] = site.codeQualityScore ?? 0;
    });
    return point;
  });

  const ai = safeAI(result);

  return (
    <div className="space-y-6">
      {/* Radar Chart */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-gray-200">Multi-Dimensional Comparison</h3>
        </div>
        <ComparisonRadarChart data={radarData} sites={radarSites} height={340} />
      </div>

      {/* Grouped Bar Chart */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-gray-200">Score Comparison</h3>
        </div>
        <ComparisonBarChart data={barData} sites={chartSites} />
      </div>

      {/* AI Strengths / Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-gray-200">Your Strengths</h3>
          </div>
          <ul className="space-y-1.5">
            {ai.primaryStrengths.length > 0 ? ai.primaryStrengths.map((s, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                {s}
              </li>
            )) : (
              <li className="text-xs text-gray-500">No strengths identified yet</li>
            )}
          </ul>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-gray-200">Areas to Improve</h3>
          </div>
          <ul className="space-y-1.5">
            {ai.primaryWeaknesses.length > 0 ? ai.primaryWeaknesses.map((w, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                {w}
              </li>
            )) : (
              <li className="text-xs text-gray-500">No weaknesses identified yet</li>
            )}
          </ul>
        </div>
      </div>

      {/* Strategic Roadmap */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-gray-200">Improvement Roadmap</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ai.improvementRoadmap.map((phase) => (
            <div key={phase.timeframe} className="p-4 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className={cn(
                "text-xs font-bold mb-2 px-2 py-0.5 rounded-full inline-block",
                phase.timeframe === "30-day" ? "bg-green-500/15 text-green-400" :
                phase.timeframe === "60-day" ? "bg-amber-500/15 text-amber-400" :
                "bg-red-500/15 text-red-400",
              )}>
                {phase.timeframe}
              </div>
              <ul className="space-y-1.5">
                {(phase.actions || []).map((a, i) => (
                  <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                    <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0 mt-0.5" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TECHNICAL VIEW
// ============================================================================
function TechnicalView({ result, chartSites, allSites }: {
  result: ComparisonResult;
  chartSites: ComparisonBarSite[];
  allSites: ComparisonSiteData[];
}) {
  // Lighthouse bar data
  const lhData: ComparisonBarDataPoint[] = [
    "Performance", "Accessibility", "Best Practices", "SEO",
  ].map((cat) => {
    const point: ComparisonBarDataPoint = { category: cat };
    allSites.forEach((site, i) => {
      const key = getSiteKey(site.url, i);
      const lh = safeLH(site);
      if (cat === "Performance") point[key] = lh.performance;
      else if (cat === "Accessibility") point[key] = lh.accessibility;
      else if (cat === "Best Practices") point[key] = lh.bestPractices;
      else if (cat === "SEO") point[key] = lh.seo;
    });
    return point;
  });

  return (
    <div className="space-y-6">
      {/* Security Comparison Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-gray-200">Security Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                {allSites.map((s, i) => (
                  <th key={s.url}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SITE_COLORS[i % SITE_COLORS.length] }} />
                      {getSiteLabel(s.url)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Security Score" sites={allSites} getValue={(s) => (s.securityScore ?? 0).toFixed(1)} isScore />
              <MetricRow label="SSL Grade" sites={allSites} getValue={(s) => s.sslGrade || "N/A"} />
              <MetricRow label="Header Score" sites={allSites} getValue={(s) => `${s.headerScore ?? 0}/100`} isScore scoreKey="headerScore" />
              <MetricRow label="Missing Headers" sites={allSites} getValue={(s) => String((s.missingHeaders || []).length)} isLowerBetter />
              <MetricRow label="CORS Issues" sites={allSites} getValue={(s) => String((s.corsIssues || []).length)} isLowerBetter />
              <MetricRow label="Token Leaks" sites={allSites} getValue={(s) => String(s.tokenLeakCount ?? 0)} isLowerBetter />
              <MetricRow label="Dependency Vulns" sites={allSites} getValue={(s) => String(s.dependencyVulnCount ?? 0)} isLowerBetter />
              <MetricRow label="Widevine DRM" sites={allSites} getValue={(s) => safeDRM(s).widevineDetected ? "Yes" : "No"} />
              <MetricRow label="FairPlay DRM" sites={allSites} getValue={(s) => safeDRM(s).fairplayDetected ? "Yes" : "No"} />
              <MetricRow label="License URL Exposed" sites={allSites} getValue={(s) => safeDRM(s).licenseUrlExposed ? "EXPOSED" : "Safe"} isLowerBetter />
              <MetricRow label="Critical Findings" sites={allSites} getValue={(s) => String(s.criticalFindingsCount ?? 0)} isLowerBetter />
              <MetricRow label="High Findings" sites={allSites} getValue={(s) => String(s.highFindingsCount ?? 0)} isLowerBetter />
            </tbody>
          </table>
        </div>
      </div>

      {/* Lighthouse Comparison Bar */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-200">Lighthouse Scores</h3>
        </div>
        <ComparisonBarChart data={lhData} sites={chartSites} targetValue={90} />
      </div>

      {/* Performance Comparison Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
          <Gauge className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-200">Performance Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                {allSites.map((s, i) => (
                  <th key={s.url}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SITE_COLORS[i % SITE_COLORS.length] }} />
                      {getSiteLabel(s.url)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Performance Score" sites={allSites} getValue={(s) => (s.performanceScore ?? 0).toFixed(1)} isScore />
              <MetricRow label="LH Performance" sites={allSites} getValue={(s) => String(safeLH(s).performance)} isScore />
              <MetricRow label="LH Accessibility" sites={allSites} getValue={(s) => String(safeLH(s).accessibility)} isScore />
              <MetricRow label="LH Best Practices" sites={allSites} getValue={(s) => String(safeLH(s).bestPractices)} isScore />
              <MetricRow label="LH SEO" sites={allSites} getValue={(s) => String(safeLH(s).seo)} isScore />
              {/* CWV metrics — safely iterate */}
              {allSites.length > 0 && Object.keys(safeCWV(allSites[0])).slice(0, 6).map((key) => (
                <tr key={key}>
                  <td className="text-xs text-gray-400 font-medium">{key.toUpperCase()}</td>
                  {allSites.map((site) => {
                    const cwv = safeCWV(site)[key];
                    return (
                      <td key={site.url} className="text-xs">
                        <span className={cn(
                          cwv?.rating === "good" ? "text-green-400" :
                          cwv?.rating === "needs-improvement" ? "text-amber-400" : "text-red-400",
                        )}>
                          {cwv?.value ?? "N/A"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Code Quality Comparison */}
      <div className="card">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
          <Code2 className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-gray-200">Code Quality Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                {allSites.map((s, i) => (
                  <th key={s.url}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SITE_COLORS[i % SITE_COLORS.length] }} />
                      {getSiteLabel(s.url)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Code Quality Score" sites={allSites} getValue={(s) => (s.codeQualityScore ?? 0).toFixed(1)} isScore />
              <MetricRow label="Total Findings" sites={allSites} getValue={(s) => String(s.totalFindingsCount ?? 0)} isLowerBetter />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MANAGEMENT VIEW
// ============================================================================
function ManagementView({ result, allSites }: { result: ComparisonResult; allSites: ComparisonSiteData[] }) {
  const ai = safeAI(result);

  return (
    <div className="space-y-6">
      {/* Competitive Gap + Business Impact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gap Score Gauge */}
        <div className="card p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Target className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Competitive Gap Score</h3>
          </div>
          <div className={cn(
            "text-5xl font-bold mb-2",
            ai.competitiveGapScore <= 20 ? "text-green-400" :
            ai.competitiveGapScore <= 50 ? "text-amber-400" : "text-red-400",
          )}>
            {ai.competitiveGapScore}
          </div>
          <div className="text-xs text-gray-500 mb-3">
            {ai.competitiveGapScore <= 20 ? "Minimal gap — You are competitive" :
             ai.competitiveGapScore <= 50 ? "Moderate gap — Improvements needed" :
             "Significant gap — Urgent action required"}
          </div>
          <div className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full",
            ai.riskRating === "low" ? "bg-green-500/15 text-green-400" :
            ai.riskRating === "medium" ? "bg-amber-500/15 text-amber-400" :
            ai.riskRating === "high" ? "bg-red-500/15 text-red-400" :
            "bg-red-500/25 text-red-300",
          )}>
            <AlertTriangle className="w-3 h-3" />
            Risk: {ai.riskRating.toUpperCase()}
          </div>
        </div>

        {/* Business Impact */}
        <div className="card p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Business Impact Score</h3>
          </div>
          <div className={cn(
            "text-5xl font-bold mb-2",
            ai.businessImpactScore >= 80 ? "text-green-400" :
            ai.businessImpactScore >= 50 ? "text-amber-400" : "text-red-400",
          )}>
            {ai.businessImpactScore}
          </div>
          <div className="text-xs text-gray-500 mb-3">/100 — Potential improvement value</div>
          <div className="text-xs text-gray-400">
            Leader: <span className="text-brand-400 font-medium">{ai.leader ? getSiteLabel(ai.leader) : "N/A"}</span>
          </div>
        </div>
      </div>

      {/* Strategic Suggestions */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-gray-200">Strategic Suggestions</h3>
        </div>
        <div className="space-y-2">
          {ai.strategicSuggestions.length > 0 ? ai.strategicSuggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {i + 1}
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{s}</p>
            </div>
          )) : (
            <p className="text-xs text-gray-500 text-center py-4">No strategic suggestions available</p>
          )}
        </div>
      </div>

      {/* Competitor Insights */}
      {ai.competitorInsights.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Competitor Insights</h3>
          </div>
          <div className="space-y-4">
            {ai.competitorInsights.map((ci) => (
              <div key={ci.url} className="p-4 rounded-lg bg-surface-1 border border-white/[0.04]">
                <div className="text-xs font-semibold text-gray-300 mb-2">{getSiteLabel(ci.url)}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-green-400 font-medium mb-1">Strengths</div>
                    <ul className="space-y-1">
                      {(ci.strengths || []).map((s, j) => (
                        <li key={j} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                          <CheckCircle2 className="w-2.5 h-2.5 text-green-500 flex-shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-400 font-medium mb-1">Weaknesses</div>
                    <ul className="space-y-1">
                      {(ci.weaknesses || []).map((w, j) => (
                        <li key={j} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Matrix */}
      {ai.successMatrix.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Success Matrix</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Your Score</th>
                  {(result.competitors || []).map((c) => (
                    <th key={c.url}>{getSiteLabel(c.url)}</th>
                  ))}
                  <th>Leader</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {ai.successMatrix.map((row) => (
                  <tr key={row.metric}>
                    <td className="text-xs text-gray-400 font-medium">{row.metric}</td>
                    <td className="text-xs font-semibold">
                      <span className={cn(
                        row.leader === result.primary?.url ? "text-green-400" : "text-gray-300",
                      )}>
                        {(row.primary ?? 0).toFixed(1)}
                      </span>
                    </td>
                    {(row.competitors || []).map((c) => (
                      <td key={c.url} className="text-xs">
                        <span className={cn(
                          row.leader === c.url ? "text-green-400 font-semibold" : "text-gray-400",
                        )}>
                          {(c.value ?? 0).toFixed(1)}
                        </span>
                      </td>
                    ))}
                    <td className="text-xs text-brand-400 font-medium">{row.leader ? getSiteLabel(row.leader) : "N/A"}</td>
                    <td className={cn(
                      "text-xs font-semibold",
                      (row.gap ?? 0) <= 0 ? "text-green-400" : (row.gap ?? 0) <= 10 ? "text-amber-400" : "text-red-400",
                    )}>
                      {(row.gap ?? 0) > 0 ? `-${(row.gap ?? 0).toFixed(1)}` : `+${Math.abs(row.gap ?? 0).toFixed(1)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Export Section
// ============================================================================
function ExportSection({ result }: { result: ComparisonResult }) {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (type: string) => {
    setExporting(type);
    try {
      if (type === "dev-pdf") {
        const { generateComparisonDeveloperPDF } = await import("@/lib/pdf-generator");
        generateComparisonDeveloperPDF(result);
      } else if (type === "exec-pdf") {
        const { generateComparisonExecutivePDF } = await import("@/lib/pdf-generator");
        generateComparisonExecutivePDF(result);
      } else if (type === "pptx") {
        const { generateComparisonPPTX } = await import("@/lib/pptx-generator");
        generateComparisonPPTX(result);
      } else if (type === "copy") {
        const summary = buildTextSummary(result);
        await navigator.clipboard.writeText(summary);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Download className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-gray-200">Export Reports</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { type: "dev-pdf", label: "Developer PDF", icon: FileText, color: "text-blue-400" },
          { type: "exec-pdf", label: "Executive PDF", icon: FileText, color: "text-purple-400" },
          { type: "pptx", label: "PowerPoint", icon: Presentation, color: "text-amber-400" },
          { type: "copy", label: "Copy Summary", icon: Copy, color: "text-green-400" },
        ].map((btn) => {
          const Icon = btn.icon;
          return (
            <button
              key={btn.type}
              onClick={() => handleExport(btn.type)}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-surface-1 border border-white/[0.06] text-xs font-medium text-gray-300 hover:bg-white/[0.04] hover:border-white/[0.1] transition-colors disabled:opacity-40"
            >
              {exporting === btn.type ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className={cn("w-4 h-4", btn.color)} />
              )}
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================
function MetricRow({
  label, sites, getValue, isScore = false, isLowerBetter = false, scoreKey,
}: {
  label: string;
  sites: ComparisonSiteData[];
  getValue: (s: ComparisonSiteData) => string;
  isScore?: boolean;
  isLowerBetter?: boolean;
  scoreKey?: keyof ComparisonSiteData;
}) {
  const values = sites.map((s) => {
    try { return getValue(s); } catch { return "N/A"; }
  });
  const numValues = values.map((v) => parseFloat(v));

  // Determine leader
  let leaderIndex = -1;
  if (numValues.some((n) => !isNaN(n))) {
    if (isLowerBetter) {
      const min = Math.min(...numValues.filter((n) => !isNaN(n)));
      leaderIndex = numValues.indexOf(min);
    } else {
      const max = Math.max(...numValues.filter((n) => !isNaN(n)));
      leaderIndex = numValues.indexOf(max);
    }
  }

  return (
    <tr>
      <td className="text-xs text-gray-400 font-medium">{label}</td>
      {sites.map((site, i) => {
        const val = values[i];
        const num = numValues[i];
        const isLeader = i === leaderIndex && !isNaN(num);

        let colorClass = "text-gray-300";
        if (isScore && !isNaN(num)) {
          colorClass = num >= 90 ? "text-green-400" : num >= 70 ? "text-amber-400" : "text-red-400";
        }
        if (isLowerBetter && !isNaN(num)) {
          colorClass = num === 0 ? "text-green-400" : num <= 2 ? "text-amber-400" : "text-red-400";
        }

        return (
          <td key={site.url} className={cn("text-xs", colorClass)}>
            <span className="flex items-center gap-1">
              {isLeader && <Crown className="w-2.5 h-2.5 text-amber-400" />}
              <span className={isLeader ? "font-semibold" : ""}>{val}</span>
            </span>
          </td>
        );
      })}
    </tr>
  );
}

// ── Build a plain-text summary for clipboard ──
function buildTextSummary(result: ComparisonResult): string {
  const ai = safeAI(result);
  const allSites = [result.primary, ...(result.competitors || [])].filter(Boolean);
  const lines: string[] = [
    "=== VZY Competition Analysis ===",
    `Generated: ${new Date(result.generatedAt).toLocaleString()}`,
    "",
    "--- Score Overview ---",
    ...allSites.map((s) =>
      `${getSiteLabel(s.url)}: Overall ${(s.overallScore ?? 0).toFixed(1)} | Security ${(s.securityScore ?? 0).toFixed(1)} | Performance ${(s.performanceScore ?? 0).toFixed(1)} | Code Quality ${(s.codeQualityScore ?? 0).toFixed(1)}`,
    ),
    "",
    `AI Verdict: ${ai.verdict}`,
    `Competitive Gap Score: ${ai.competitiveGapScore}/100`,
    `Risk Rating: ${ai.riskRating}`,
    `Business Impact Score: ${ai.businessImpactScore}/100`,
    `Leader: ${ai.leader ? getSiteLabel(ai.leader) : "N/A"}`,
    "",
    "--- Your Strengths ---",
    ...ai.primaryStrengths.map((s) => `  + ${s}`),
    "",
    "--- Areas to Improve ---",
    ...ai.primaryWeaknesses.map((w) => `  - ${w}`),
    "",
    "--- Strategic Suggestions ---",
    ...ai.strategicSuggestions.map((s, i) => `  ${i + 1}. ${s}`),
  ];
  return lines.join("\n");
}
