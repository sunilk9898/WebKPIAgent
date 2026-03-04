"use client";

import { useState, useEffect, useRef } from "react";
import { useReportStore, useAuthStore, useScanStore, useQueueStore } from "@/lib/store";
import { getScoreStatus, timeAgo, cn } from "@/lib/utils";
import { abortScan, getLatestReport, getScannedUrls, type ScannedUrlEntry } from "@/lib/api";
import {
  User, LogOut, Loader2, StopCircle, ChevronDown,
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
  const dropdownRef = useRef<HTMLDivElement>(null);

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
                    let hostname = entry.url;
                    try { hostname = new URL(entry.url).hostname.replace("www.", ""); } catch {}
                    return (
                      <button
                        key={entry.url}
                        onClick={() => switchToUrl(entry.url)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-3",
                          isActive && "bg-brand-600/10",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-gray-200 flex items-center gap-2">
                            {hostname}
                            {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">Active</span>}
                          </div>
                          <div className="text-[10px] text-gray-600 truncate">{entry.url}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={cn(
                            "text-sm font-bold tabular-nums",
                            score >= 90 ? "text-green-400" : score >= 70 ? "text-amber-400" : "text-red-400",
                          )}>
                            {score.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-gray-600 w-16 text-right">{timeAgo(entry.scannedAt)}</span>
                        </div>
                      </button>
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
