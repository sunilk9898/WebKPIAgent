"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Activity, Wifi, WifiOff, Server, Clock, Copy,
  RefreshCw, Loader2, CheckCircle2, XCircle, Users, Layers,
} from "lucide-react";
import { useQueueStore, useToastStore } from "@/lib/store";
import { getHealth } from "@/lib/api";
import { getSocket } from "@/lib/websocket";
import { cn } from "@/lib/utils";

interface HealthData {
  status: string;
  uptime: number;
  timestamp: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function SystemHealthPanel() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { activeScans, queuedScans, maxConcurrent, activeCount, queueLength } = useQueueStore();
  const addToast = useToastStore((s) => s.addToast);

  // Compute overall health status
  const overallStatus = healthError ? "critical" : !health ? "unknown" : health.status === "ok" ? "healthy" : "warning";

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(false);
    try {
      const data = await getHealth();
      setHealth(data);
    } catch {
      setHealthError(true);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Check WebSocket status
  const checkWsStatus = useCallback(() => {
    const socket = getSocket();
    setWsConnected(socket?.connected ?? false);
  }, []);

  // Load health when dropdown opens and poll every 30s while open
  useEffect(() => {
    if (open) {
      fetchHealth();
      checkWsStatus();
      const interval = setInterval(() => {
        fetchHealth();
        checkWsStatus();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [open, fetchHealth, checkWsStatus]);

  // Periodically check WS status for the badge indicator
  useEffect(() => {
    checkWsStatus();
    const interval = setInterval(checkWsStatus, 10000);
    return () => clearInterval(interval);
  }, [checkWsStatus]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCopyStatus = () => {
    const lines: string[] = [
      `VZY System Health - ${new Date().toLocaleString()}`,
      "",
      `API Status: ${health?.status || "unknown"}${healthError ? " (unreachable)" : ""}`,
      `WebSocket: ${wsConnected ? "connected" : "disconnected"}`,
      `Uptime: ${health ? formatUptime(health.uptime) : "N/A"}`,
      "",
      `Scan Queue:`,
      `  Active: ${activeCount} / ${maxConcurrent}`,
      `  Queued: ${queueLength}`,
    ];

    if (activeScans.length > 0) {
      lines.push("", "Active Scans:");
      activeScans.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.url} (by ${s.userName})`);
      });
    }

    if (queuedScans.length > 0) {
      lines.push("", "Queued Scans:");
      queuedScans.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.url} (by ${s.userName})`);
      });
    }

    navigator.clipboard.writeText(lines.join("\n"));
    addToast({ type: "success", title: "Copied system status", duration: 2000 });
  };

  return (
    <div className="relative" ref={ref}>
      {/* Activity button */}
      <button
        onClick={() => setOpen(!open)}
        className="btn-ghost p-2 relative"
        aria-label="System health"
      >
        <Activity className="w-4 h-4" />
        <span
          className={cn(
            "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
            overallStatus === "healthy" && wsConnected ? "bg-kpi-pass" : "bg-red-500",
            overallStatus === "unknown" && "bg-gray-500",
          )}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg bg-surface-2 border border-white/[0.08] shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-xs font-semibold text-gray-200">System Health</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyStatus}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                title="Copy status"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
              <button
                onClick={() => { fetchHealth(); checkWsStatus(); }}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={cn("w-3 h-3", healthLoading && "animate-spin")} />
                Refresh
              </button>
            </div>
          </div>

          {/* Status rows */}
          <div className="px-4 py-3 space-y-3">
            {/* API Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-300">API Server</span>
              </div>
              <div className="flex items-center gap-1.5">
                {healthLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />
                ) : healthError ? (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-[10px] font-medium text-red-400">Unreachable</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-[10px] font-medium text-green-400">Online</span>
                  </>
                )}
              </div>
            </div>

            {/* WebSocket */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {wsConnected ? (
                  <Wifi className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-gray-500" />
                )}
                <span className="text-xs text-gray-300">WebSocket</span>
              </div>
              <div className="flex items-center gap-1.5">
                {wsConnected ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[10px] font-medium text-green-400">Connected</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span className="text-[10px] font-medium text-red-400">Disconnected</span>
                  </>
                )}
              </div>
            </div>

            {/* Uptime */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-300">Uptime</span>
              </div>
              <span className="text-[10px] font-medium text-gray-400 tabular-nums">
                {health ? formatUptime(health.uptime) : "—"}
              </span>
            </div>

            {/* Divider */}
            <div className="border-t border-white/[0.06]" />

            {/* Scan Queue Summary */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-300">Scan Queue</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-400">
                  <span className={cn("font-medium", activeCount > 0 ? "text-brand-400" : "text-gray-500")}>
                    {activeCount}
                  </span>
                  <span className="text-gray-600"> / {maxConcurrent} active</span>
                </span>
                {queueLength > 0 && (
                  <span className="text-[10px] text-amber-400 font-medium">
                    +{queueLength} queued
                  </span>
                )}
              </div>
            </div>

            {/* Concurrency bar */}
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    activeCount === 0 ? "bg-gray-600" :
                    activeCount >= maxConcurrent ? "bg-amber-500" : "bg-brand-500",
                  )}
                  style={{ width: `${Math.min((activeCount / maxConcurrent) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Active scans list */}
          {activeScans.length > 0 && (
            <div className="border-t border-white/[0.06]">
              <div className="px-4 py-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">
                  Active Scans
                </div>
                <div className="space-y-1.5">
                  {activeScans.map((scan) => {
                    let hostname = scan.url;
                    try { hostname = new URL(scan.url).hostname.replace("www.", ""); } catch {}
                    return (
                      <div
                        key={scan.scanId}
                        className="flex items-center justify-between gap-2 py-1 px-2 -mx-2 rounded-md bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Loader2 className="w-3 h-3 text-brand-400 animate-spin shrink-0" />
                          <span className="text-[11px] text-gray-300 truncate">{hostname}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Users className="w-3 h-3 text-gray-600" />
                          <span className="text-[10px] text-gray-500 truncate max-w-[60px]">
                            {scan.userName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Queued scans list */}
          {queuedScans.length > 0 && (
            <div className="border-t border-white/[0.06]">
              <div className="px-4 py-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">
                  Queued ({queuedScans.length})
                </div>
                <div className="space-y-1.5">
                  {queuedScans.slice(0, 5).map((scan) => {
                    let hostname = scan.url;
                    try { hostname = new URL(scan.url).hostname.replace("www.", ""); } catch {}
                    return (
                      <div
                        key={scan.scanId}
                        className="flex items-center justify-between gap-2 py-1 px-2 -mx-2 rounded-md"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Clock className="w-3 h-3 text-amber-500/60 shrink-0" />
                          <span className="text-[11px] text-gray-400 truncate">{hostname}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Users className="w-3 h-3 text-gray-600" />
                          <span className="text-[10px] text-gray-500 truncate max-w-[60px]">
                            {scan.userName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {queuedScans.length > 5 && (
                    <div className="text-[10px] text-gray-500 pl-5">
                      +{queuedScans.length - 5} more in queue
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No activity message */}
          {activeScans.length === 0 && queuedScans.length === 0 && (
            <div className="border-t border-white/[0.06] px-4 py-3">
              <p className="text-[11px] text-gray-500 text-center">No scans currently running</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
