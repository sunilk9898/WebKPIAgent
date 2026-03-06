"use client";

import { useState, useEffect, useRef } from "react";
import { useReportStore, useAuthStore, useScanStore, useQueueStore } from "@/lib/store";
import { getScoreStatus, timeAgo, cn } from "@/lib/utils";
import { abortScan, getLatestReport, getScannedUrls, triggerScan, type ScannedUrlEntry } from "@/lib/api";
import {
  User, LogOut, Loader2, StopCircle, ChevronDown, RefreshCw,
} from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { SystemHealthPanel } from "./system-health-panel";

export function Header() {
  const { report, setReport } = useReportStore();
  const { user, logout } = useAuthStore();
  const { activeScan, setActiveScan } = useScanStore();
  const { activeCount, queueLength } = useQueueStore();

  const [showUrlDropdown, setShowUrlDropdown] = useState(false);
  const [scannedUrls, setScannedUrls] = useState<ScannedUrlEntry[]>([]);
  const [urlsLoaded, setUrlsLoaded] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [refreshingUrl, setRefreshingUrl] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { activeScans, queuedScans } = useQueueStore();

  const status = report ? getScoreStatus(report.kpiScore.overallScore) : null;
  const currentUrl = report?.target?.url || report?.target?.repoPath || "";

  // Fetch scanned URLs when dropdown opens
  useEffect(() => {
    if (showUrlDropdown && !urlsLoaded) {
      getScannedUrls()
        .then((data) => { setScannedUrls(data.urls || []); setUrlsLoaded(true); })
        .catch(() => {});
    }
  }, [showUrlDropdown, urlsLoaded]);

  // Refresh URL list when report changes
  useEffect(() => { setUrlsLoaded(false); }, [report]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUrlDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const switchToUrl = async (url: string) => {
    if (url === currentUrl) { setShowUrlDropdown(false); return; }
    setSwitching(true);
    try {
      const r = await getLatestReport(url);
      setReport(r);
      useReportStore.getState().setTarget(url);
    } catch (e) {
      console.warn("Failed to load report for", url);
    } finally {
      setSwitching(false);
      setShowUrlDropdown(false);
    }
  };

  // Check if a URL is currently being scanned (active or queued)
  const getScanForUrl = (url: string): { scanId: string; status: "active" | "queued" } | null => {
    const active = activeScans.find(s => s.url === url);
    if (active) return { scanId: active.scanId, status: "active" };
    const queued = queuedScans.find(s => s.url === url);
    if (queued) return { scanId: queued.scanId, status: "queued" };
    return null;
  };

  // Refresh (re-scan) a specific URL
  const refreshUrl = async (url: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger switch
    setRefreshingUrl(url);
    try {
      const res = await triggerScan({ url });
      const defaultAgentState = { progress: 0, status: "running" as const };
      setActiveScan({
        scanId: res.scanId,
        status: "running",
        startedAt: new Date().toISOString(),
        agents: {
          security: defaultAgentState,
          performance: defaultAgentState,
          "code-quality": defaultAgentState,
          "report-generator": defaultAgentState,
        },
      });
    } catch (err) {
      console.warn("Failed to trigger refresh scan for", url, err);
    } finally {
      setRefreshingUrl(null);
    }
  };

  // Cancel scan for a specific URL
  const cancelUrlScan = async (scanId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger switch
    setCancellingId(scanId);
    try {
      await abortScan(scanId);
      // Clear local activeScan if it matches
      if (activeScan?.scanId === scanId) {
        setActiveScan(null);
      }
    } catch (err) {
      console.warn("Failed to cancel scan", scanId, err);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <header className="h-16 border-b border-white/[0.06] bg-surface-1/80 backdrop-blur-lg flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left: scan target + status */}
      <div className="flex items-center gap-4">
        {report && (
          <>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowUrlDropdown(!showUrlDropdown)}
                className="flex items-center gap-2 hover:bg-white/[0.04] rounded-lg px-2 py-1 -ml-2 transition-colors"
              >
                <div
                  className={cn(
                    "status-dot",
                    status === "healthy" && "status-dot-healthy",
                    status === "warning" && "status-dot-warning",
                    status === "critical" && "status-dot-critical",
                  )}
                />
                <span className="text-sm font-medium text-gray-200">
                  {currentUrl}
                </span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-gray-500 transition-transform", showUrlDropdown && "rotate-180")} />
              </button>

              {/* URL Dropdown */}
              {showUrlDropdown && (
                <div className="absolute left-0 top-full mt-1 w-96 rounded-lg bg-surface-2 border border-white/[0.08] shadow-xl z-50 py-1 max-h-[360px] overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-medium border-b border-white/[0.06]">
                    Switch Scanned URL
                  </div>
                  {switching && (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                      <span className="text-xs text-gray-400">Loading report...</span>
                    </div>
                  )}
                  {!switching && !urlsLoaded && (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                      <span className="text-xs text-gray-400">Loading URLs...</span>
                    </div>
                  )}
                  {!switching && scannedUrls.length === 0 && urlsLoaded && (
                    <div className="px-3 py-4 text-xs text-gray-500 text-center">No scanned URLs found</div>
                  )}
                  {!switching && urlsLoaded && scannedUrls.map((entry) => {
                    const isActive = entry.url === currentUrl;
                    const score = Number(entry.score) || 0;
                    const urlScan = getScanForUrl(entry.url);
                    const isRefreshing = refreshingUrl === entry.url;
                    const isCancelling = cancellingId === urlScan?.scanId;
                    let hostname = entry.url;
                    try { hostname = new URL(entry.url).hostname.replace("www.", ""); } catch {}
                    return (
                      <div
                        key={entry.url}
                        className={cn(
                          "w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2",
                          isActive && "bg-brand-600/10",
                        )}
                      >
                        {/* Clickable URL info area */}
                        <button
                          onClick={() => switchToUrl(entry.url)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="text-xs font-medium text-gray-200 flex items-center gap-2">
                            {hostname}
                            {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">Active</span>}
                          </div>
                          <div className="text-[10px] text-gray-600 truncate">{entry.url}</div>
                        </button>

                        {/* Score + action button */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn(
                            "text-sm font-bold tabular-nums",
                            score >= 90 ? "text-green-400" : score >= 70 ? "text-amber-400" : "text-red-400",
                          )}>
                            {score.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-gray-600 w-14 text-right">{timeAgo(entry.scannedAt)}</span>

                          {/* Always-visible action button */}
                          {urlScan ? (
                            /* Cancel running/queued scan */
                            <button
                              onClick={(e) => cancelUrlScan(urlScan.scanId, e)}
                              disabled={isCancelling}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 transition-colors text-red-400 disabled:opacity-40"
                              title="Cancel scan"
                            >
                              {isCancelling ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <StopCircle className="w-3 h-3" />
                              )}
                              <span className="text-[10px] font-medium">Stop</span>
                            </button>
                          ) : (
                            /* Re-scan */
                            <button
                              onClick={(e) => refreshUrl(entry.url, e)}
                              disabled={isRefreshing}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 transition-colors text-brand-400 disabled:opacity-40"
                              title="Re-scan this URL"
                            >
                              {isRefreshing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              <span className="text-[10px] font-medium">Rescan</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500">
              Last scan: {timeAgo(report.generatedAt)}
            </span>
          </>
        )}

        {/* Active scan indicator — system-wide awareness */}
        {(activeScan || activeCount > 0) && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/15 border border-brand-500/30">
            <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin" />
            <span className="text-xs font-medium text-brand-400">
              {activeCount} scan{activeCount !== 1 ? "s" : ""} active
            </span>
            {queueLength > 0 && (
              <span className="text-xs text-gray-500">+{queueLength} queued</span>
            )}
            {activeScan && (
              <button
                onClick={async () => {
                  try { await abortScan(activeScan.scanId); } catch {}
                  setActiveScan(null);
                }}
                className="ml-1 p-0.5 rounded hover:bg-red-500/20 transition-colors"
                title="Abort your scan"
              >
                <StopCircle className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3">
        {/* System health indicator */}
        <SystemHealthPanel />

        {/* Notifications */}
        <NotificationBell />

        {/* User menu */}
        {user && (
          <div className="flex items-center gap-2 pl-3 border-l border-white/[0.06]">
            <div className="w-7 h-7 rounded-full bg-brand-600/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-brand-400" />
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-medium text-gray-200">{user.name}</div>
              <div className="text-[10px] text-gray-500 uppercase">{user.role}</div>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
              className="btn-ghost p-1.5 ml-1"
              aria-label="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
