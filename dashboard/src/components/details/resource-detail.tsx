"use client";

import { FileCode, Image, AlertTriangle } from "lucide-react";
import { InfoBox, SectionLabel, DetailSection, FixRecommendation, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn, formatBytes } from "@/lib/utils";
import type { PerformanceMetadata, Finding } from "@/types/api";

interface ResourceDetailProps {
  resourceMetrics: PerformanceMetadata["resourceMetrics"];
  findings: Finding[];
}

export function ResourceDetail({ resourceMetrics, findings }: ResourceDetailProps) {
  const resourceFindings = findings.filter(
    (f) => f.category.toLowerCase().includes("resource") || f.title.toLowerCase().includes("resource") ||
           f.title.toLowerCase().includes("render-blocking") || f.title.toLowerCase().includes("uncompressed"),
  );

  const breakdown = [
    { label: "JavaScript", size: resourceMetrics.jsSize, color: "bg-amber-500", pct: resourceMetrics.totalSize > 0 ? (resourceMetrics.jsSize / resourceMetrics.totalSize * 100).toFixed(1) : "0" },
    { label: "CSS", size: resourceMetrics.cssSize, color: "bg-blue-500", pct: resourceMetrics.totalSize > 0 ? (resourceMetrics.cssSize / resourceMetrics.totalSize * 100).toFixed(1) : "0" },
    { label: "Images", size: resourceMetrics.imageSize, color: "bg-green-500", pct: resourceMetrics.totalSize > 0 ? (resourceMetrics.imageSize / resourceMetrics.totalSize * 100).toFixed(1) : "0" },
    { label: "Fonts", size: resourceMetrics.fontSize, color: "bg-purple-500", pct: resourceMetrics.totalSize > 0 ? (resourceMetrics.fontSize / resourceMetrics.totalSize * 100).toFixed(1) : "0" },
    { label: "3rd Party", size: resourceMetrics.thirdPartySize, color: "bg-red-500", pct: resourceMetrics.totalSize > 0 ? (resourceMetrics.thirdPartySize / resourceMetrics.totalSize * 100).toFixed(1) : "0" },
  ];

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <InfoBox label="Total Size" value={formatBytes(resourceMetrics.totalSize)} bad={resourceMetrics.totalSize > 5_000_000} />
        <InfoBox label="Requests" value={resourceMetrics.requestCount} bad={resourceMetrics.requestCount > 100} />
      </div>

      {/* Size breakdown */}
      <div className="space-y-3">
        <SectionLabel label="Size Breakdown" />
        {breakdown.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{item.label}</span>
              <span className="text-gray-300 font-mono">{formatBytes(item.size)} ({item.pct}%)</span>
            </div>
            <div className="w-full bg-surface-1 rounded-full h-1.5">
              <div className={cn("h-1.5 rounded-full", item.color)} style={{ width: `${Math.min(Number(item.pct), 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <DetailSection title="What This Means">
        Resource metrics show the total weight and composition of your page. Large JavaScript bundles block rendering,
        unoptimized images waste bandwidth, and too many requests increase latency. For OTT platforms, keeping the page
        lightweight ensures the video player loads and starts quickly.
      </DetailSection>

      {/* Render-blocking resources */}
      {resourceMetrics.renderBlockingResources.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Render-Blocking Resources" count={resourceMetrics.renderBlockingResources.length} />
          <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 space-y-1.5">
            {resourceMetrics.renderBlockingResources.slice(0, 8).map((r, i) => (
              <div key={i} className="text-[11px] text-gray-400 font-mono truncate">{r}</div>
            ))}
            {resourceMetrics.renderBlockingResources.length > 8 && (
              <div className="text-[10px] text-gray-500">+{resourceMetrics.renderBlockingResources.length - 8} more</div>
            )}
          </div>
          <FixRecommendation text="Defer or async non-critical JS/CSS. Use <link rel='preload'> for critical resources and inline critical CSS." />
        </div>
      )}

      {/* Uncompressed assets */}
      {resourceMetrics.uncompressedAssets.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Uncompressed Assets" count={resourceMetrics.uncompressedAssets.length} />
          <div className="p-3 rounded-lg bg-red-500/[0.04] border border-red-500/10 space-y-1.5">
            {resourceMetrics.uncompressedAssets.slice(0, 5).map((a, i) => (
              <div key={i} className="text-[11px] text-gray-400 font-mono truncate">{a}</div>
            ))}
          </div>
          <FixRecommendation text="Enable Brotli/Gzip compression on your server or CDN for all text-based resources." />
        </div>
      )}

      {/* Related findings */}
      {resourceFindings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Resource Issues" count={resourceFindings.length} />
          {resourceFindings.map((f) => (
            <div key={f.id} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className="text-xs text-gray-200 font-medium mb-1">{f.title}</div>
              <div className="text-[11px] text-gray-400">{f.description}</div>
            </div>
          ))}
        </div>
      )}

      <ImpactBadge effort="medium" impact="Reducing page weight improves load time and Performance score" />
    </div>
  );
}
