"use client";

import { useState } from "react";
import {
  Gauge, Zap, Clock, MonitorPlay, ServerCrash, HardDrive,
  Wifi, Image, FileCode, ArrowRight, BarChart3,
} from "lucide-react";
import { KPIGauge } from "@/components/charts/kpi-gauge";
import { CWVBars } from "@/components/charts/cwv-bars";
import { MetricCard } from "@/components/cards/metric-card";
import { FindingRow } from "@/components/cards/finding-row";
import { JsonViewer } from "@/components/shared/json-viewer";
import { DetailDrawer } from "@/components/shared/detail-drawer";
import { CWVDetail } from "@/components/details/cwv-detail";
import { PlayerDetail } from "@/components/details/player-detail";
import { CDNDetail } from "@/components/details/cdn-detail";
import { ResourceDetail } from "@/components/details/resource-detail";
import { useScanReport } from "@/hooks/use-scan-report";
import { cn, formatMs, formatBytes } from "@/lib/utils";
import type { PerformanceMetadata } from "@/types/api";

type DetailKey = string | null;

export default function PerformancePage() {
  const { report, performanceResult } = useScanReport();
  const [activeTab, setActiveTab] = useState<"overview" | "cwv" | "player" | "cdn" | "raw">("overview");
  const [activeDetail, setActiveDetail] = useState<DetailKey>(null);

  if (!report || !performanceResult) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center text-gray-500 space-y-2">
          <Gauge className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">No performance data available. Run a scan first.</p>
        </div>
      </div>
    );
  }

  const meta = performanceResult.metadata as unknown as PerformanceMetadata;
  const findings = performanceResult.findings;

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "cwv" as const, label: "Core Web Vitals" },
    { id: "player" as const, label: "Player Metrics" },
    { id: "cdn" as const, label: "CDN & Resources" },
    { id: "raw" as const, label: "Raw JSON" },
  ];

  const getDrawerInfo = () => {
    if (!activeDetail) return { title: "", subtitle: "" };
    if (activeDetail.startsWith("cwv:")) {
      const key = activeDetail.replace("cwv:", "");
      const names: Record<string, string> = { lcp: "Largest Contentful Paint", fcp: "First Contentful Paint", cls: "Cumulative Layout Shift", ttfb: "Time to First Byte", fid: "First Input Delay", inp: "Interaction to Next Paint" };
      return { title: names[key] || key.toUpperCase(), subtitle: "Core Web Vital Metric" };
    }
    if (activeDetail.startsWith("player:")) {
      const key = activeDetail.replace("player:", "");
      const names: Record<string, string> = { startupDelay: "Startup Delay", timeToFirstFrame: "Time to First Frame", bufferRatio: "Buffer Ratio", rebufferEvents: "Rebuffer Events", abrSwitchCount: "ABR Switches", drmLicenseTime: "DRM License Time", playbackFailures: "Playback Failures" };
      return { title: names[key] || key, subtitle: "OTT Player Metric" };
    }
    if (activeDetail === "cdn") return { title: "CDN Performance", subtitle: "Content Delivery Network Analysis" };
    if (activeDetail === "resources") return { title: "Resource Analysis", subtitle: "Page Weight & Asset Optimization" };
    return { title: "", subtitle: "" };
  };

  const drawerInfo = getDrawerInfo();

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Performance Analysis</h1>
          <p className="text-sm text-gray-500">Lighthouse, Core Web Vitals, player metrics, CDN efficiency</p>
        </div>
        <KPIGauge score={performanceResult.score.rawScore} label="Performance" size="sm" showStatus={false} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "text-brand-400 border-brand-500"
                : "text-gray-400 border-transparent hover:text-gray-200",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Lighthouse Gauges — always shown; uses estimated values when Lighthouse scan fails */}
          {meta?.lighthouse && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-200">Lighthouse Scores</h3>
                {meta.lighthouse.estimated && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">
                    ESTIMATED FROM CWV
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6 items-center">
                <div className="col-span-2 md:col-span-1 flex justify-center">
                  <KPIGauge score={meta.lighthouse.performanceScore} label="Performance" size="lg" />
                </div>
                <KPIGauge score={meta.lighthouse.accessibilityScore} label="Accessibility" size="md" showStatus={false} />
                <KPIGauge score={meta.lighthouse.bestPracticesScore} label="Best Practices" size="md" showStatus={false} />
                <KPIGauge score={meta.lighthouse.seoScore} label="SEO" size="md" showStatus={false} />
                <KPIGauge score={meta.lighthouse.pwaScore || 0} label="PWA" size="md" showStatus={false} />
              </div>
            </div>
          )}

          {/* Quick CWV Metrics — ALL CLICKABLE */}
          {meta?.coreWebVitals && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(meta.coreWebVitals).map(([key, v]) => (
                <MetricCard
                  key={key}
                  label={key.toUpperCase()}
                  value={key === "cls" ? v.value.toFixed(3) : formatMs(v.value)}
                  subtitle={`Target: <${key === "lcp" ? "2.5s" : key === "fcp" ? "1.8s" : key === "cls" ? "0.1" : key === "ttfb" ? "800ms" : key === "inp" ? "200ms" : "100ms"}`}
                  icon={Clock}
                  status={v.rating === "good" ? "good" : v.rating === "needs-improvement" ? "warn" : "bad"}
                  onClick={() => setActiveDetail(`cwv:${key}`)}
                />
              ))}
            </div>
          )}

          {/* Findings */}
          <div className="card">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-gray-200">Performance Findings ({findings.length})</h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {findings.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">All performance metrics within targets</div>
              ) : (
                findings.map((f) => <FindingRow key={f.id} finding={f} />)
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CORE WEB VITALS TAB ── */}
      {activeTab === "cwv" && meta?.coreWebVitals && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Core Web Vitals vs Targets</h3>
            <p className="text-xs text-gray-500 mb-4">Green line = 100% of target. Bars exceeding line indicate values above threshold.</p>
            <CWVBars vitals={meta.coreWebVitals} height={300} />
          </div>

          {/* Detail cards — ALL CLICKABLE */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(meta.coreWebVitals).map(([key, v]) => {
              const targets: Record<string, number> = { lcp: 2500, fcp: 1800, cls: 0.1, ttfb: 800, fid: 100, inp: 200 };
              const target = targets[key] || 0;
              const pct = target > 0 ? ((v.value / target) * 100).toFixed(0) : "—";

              return (
                <button
                  key={key}
                  onClick={() => setActiveDetail(`cwv:${key}`)}
                  className="card p-4 space-y-2 text-left w-full cursor-pointer hover:bg-white/[0.04] hover:border-brand-500/30 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-200">{key.toUpperCase()}</span>
                    <span className={cn(
                      "badge text-[10px]",
                      v.rating === "good" ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : v.rating === "needs-improvement" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30",
                    )}>
                      {v.rating}
                    </span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-gray-100">
                    {key === "cls" ? v.value.toFixed(3) : formatMs(v.value)}
                  </div>
                  <div className="w-full bg-surface-1 rounded-full h-2">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all",
                        v.rating === "good" ? "bg-green-500"
                        : v.rating === "needs-improvement" ? "bg-amber-500"
                        : "bg-red-500",
                      )}
                      style={{ width: `${Math.min(Number(pct), 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">{pct}% of target ({key === "cls" ? target : formatMs(target)})</div>
                  <div className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">Click for details</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PLAYER METRICS TAB — ALL CLICKABLE ── */}
      {activeTab === "player" && (
        <div className="space-y-6">
          {meta?.playerMetrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Startup Delay" value={formatMs(meta.playerMetrics.startupDelay)} subtitle="Target: <3s" icon={Zap} status={meta.playerMetrics.startupDelay < 3000 ? "good" : "bad"} onClick={() => setActiveDetail("player:startupDelay")} />
              <MetricCard label="Time to First Frame" value={formatMs(meta.playerMetrics.timeToFirstFrame)} subtitle="Target: <4s" icon={MonitorPlay} status={meta.playerMetrics.timeToFirstFrame < 4000 ? "good" : "bad"} onClick={() => setActiveDetail("player:timeToFirstFrame")} />
              <MetricCard label="Buffer Ratio" value={`${(meta.playerMetrics.bufferRatio * 100).toFixed(1)}%`} subtitle="Target: <2%" icon={HardDrive} status={meta.playerMetrics.bufferRatio < 0.02 ? "good" : "bad"} onClick={() => setActiveDetail("player:bufferRatio")} />
              <MetricCard label="Rebuffer Events" value={meta.playerMetrics.rebufferEvents} icon={ServerCrash} status={meta.playerMetrics.rebufferEvents === 0 ? "good" : "bad"} onClick={() => setActiveDetail("player:rebufferEvents")} />
              <MetricCard label="ABR Switches" value={meta.playerMetrics.abrSwitchCount} subtitle={`Avg latency: ${formatMs(meta.playerMetrics.abrSwitchLatency)}`} icon={BarChart3} status="neutral" onClick={() => setActiveDetail("player:abrSwitchCount")} />
              <MetricCard label="DRM License Time" value={formatMs(meta.playerMetrics.drmLicenseTime)} subtitle="Target: <2s" icon={Clock} status={meta.playerMetrics.drmLicenseTime < 2000 ? "good" : "bad"} onClick={() => setActiveDetail("player:drmLicenseTime")} />
              <MetricCard label="Playback Failures" value={meta.playerMetrics.playbackFailures} icon={ServerCrash} status={meta.playerMetrics.playbackFailures === 0 ? "good" : "bad"} onClick={() => setActiveDetail("player:playbackFailures")} />
            </div>
          ) : (
            <div className="card p-8 text-center text-gray-500 text-sm">No player detected on page</div>
          )}
        </div>
      )}

      {/* ── CDN & RESOURCES TAB — ALL CLICKABLE ── */}
      {activeTab === "cdn" && (
        <div className="space-y-6">
          {meta?.cdnMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="CDN Hit Ratio" value={`${(meta.cdnMetrics.hitRatio * 100).toFixed(1)}%`} subtitle="Target: >95%" icon={Wifi} status={meta.cdnMetrics.hitRatio >= 0.95 ? "good" : "warn"} onClick={() => setActiveDetail("cdn")} />
              <MetricCard label="Avg Latency" value={formatMs(meta.cdnMetrics.avgLatency)} icon={Clock} status="neutral" onClick={() => setActiveDetail("cdn")} />
              <MetricCard label="P95 Latency" value={formatMs(meta.cdnMetrics.p95Latency)} icon={Clock} status="neutral" onClick={() => setActiveDetail("cdn")} />
              <MetricCard label="Compression" value={meta.cdnMetrics.compressionEnabled ? "Enabled" : "Disabled"} icon={HardDrive} status={meta.cdnMetrics.compressionEnabled ? "good" : "bad"} onClick={() => setActiveDetail("cdn")} />
            </div>
          )}

          {meta?.resourceMetrics && (
            <button
              onClick={() => setActiveDetail("resources")}
              className="card p-5 w-full text-left cursor-pointer hover:bg-white/[0.04] hover:border-brand-500/30 transition-all group"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-200">Resource Breakdown</h3>
                <div className="text-[10px] text-gray-600 group-hover:text-brand-400 transition-colors">Click for details</div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <ResourceBar label="Total" size={meta.resourceMetrics.totalSize} max={meta.resourceMetrics.totalSize} color="bg-gray-400" />
                <ResourceBar label="JS" size={meta.resourceMetrics.jsSize} max={meta.resourceMetrics.totalSize} color="bg-amber-500" />
                <ResourceBar label="CSS" size={meta.resourceMetrics.cssSize} max={meta.resourceMetrics.totalSize} color="bg-blue-500" />
                <ResourceBar label="Images" size={meta.resourceMetrics.imageSize} max={meta.resourceMetrics.totalSize} color="bg-green-500" />
                <ResourceBar label="Fonts" size={meta.resourceMetrics.fontSize} max={meta.resourceMetrics.totalSize} color="bg-purple-500" />
                <ResourceBar label="3rd Party" size={meta.resourceMetrics.thirdPartySize} max={meta.resourceMetrics.totalSize} color="bg-red-500" />
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Requests</div>
                  <div className="text-xl font-bold text-gray-200">{meta.resourceMetrics.requestCount}</div>
                </div>
              </div>

              {meta.resourceMetrics.renderBlockingResources.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
                  <div className="text-xs font-semibold text-amber-400 mb-2">
                    Render-Blocking Resources ({meta.resourceMetrics.renderBlockingResources.length})
                  </div>
                  {meta.resourceMetrics.renderBlockingResources.slice(0, 5).map((r, i) => (
                    <div key={i} className="text-xs text-gray-400 font-mono truncate">{r}</div>
                  ))}
                </div>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── RAW JSON ── */}
      {activeTab === "raw" && <JsonViewer data={performanceResult} defaultExpanded maxHeight={600} />}

      {/* ── DETAIL DRAWER ── */}
      <DetailDrawer
        title={drawerInfo.title}
        subtitle={drawerInfo.subtitle}
        isOpen={!!activeDetail}
        onClose={() => setActiveDetail(null)}
      >
        {activeDetail?.startsWith("cwv:") && meta?.coreWebVitals && (() => {
          const key = activeDetail.replace("cwv:", "");
          const v = meta.coreWebVitals[key];
          return v ? <CWVDetail metricKey={key} value={v.value} rating={v.rating} findings={findings} /> : null;
        })()}

        {activeDetail?.startsWith("player:") && meta?.playerMetrics && (
          <PlayerDetail metricKey={activeDetail.replace("player:", "")} playerMetrics={meta.playerMetrics} findings={findings} />
        )}

        {activeDetail === "cdn" && meta?.cdnMetrics && (
          <CDNDetail cdnMetrics={meta.cdnMetrics} findings={findings} />
        )}

        {activeDetail === "resources" && meta?.resourceMetrics && (
          <ResourceDetail resourceMetrics={meta.resourceMetrics} findings={findings} />
        )}
      </DetailDrawer>
    </div>
  );
}

function ResourceBar({ label, size, max, color }: { label: string; size: number; max: number; color: string }) {
  const pct = max > 0 ? (size / max) * 100 : 0;
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-bold text-gray-200 mb-1">{formatBytes(size)}</div>
      <div className="w-full bg-surface-1 rounded-full h-1.5">
        <div className={cn("h-1.5 rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
