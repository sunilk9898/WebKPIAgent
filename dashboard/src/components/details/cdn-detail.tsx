"use client";

import { Wifi, Clock, HardDrive, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { InfoBox, SectionLabel, DetailSection, FixRecommendation, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn } from "@/lib/utils";
import { formatMs } from "@/lib/utils";
import type { PerformanceMetadata, Finding } from "@/types/api";

interface CDNDetailProps {
  cdnMetrics: PerformanceMetadata["cdnMetrics"];
  findings: Finding[];
}

export function CDNDetail({ cdnMetrics, findings }: CDNDetailProps) {
  const cdnFindings = findings.filter(
    (f) => f.category.toLowerCase().includes("cdn") || f.title.toLowerCase().includes("cdn") || f.title.toLowerCase().includes("cache"),
  );

  return (
    <div className="space-y-5">
      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoBox label="Hit Ratio" value={`${(cdnMetrics.hitRatio * 100).toFixed(1)}%`} highlight={cdnMetrics.hitRatio >= 0.95} bad={cdnMetrics.hitRatio < 0.80} />
        <InfoBox label="Avg Latency" value={formatMs(cdnMetrics.avgLatency)} highlight={cdnMetrics.avgLatency < 50} />
        <InfoBox label="P95 Latency" value={formatMs(cdnMetrics.p95Latency)} bad={cdnMetrics.p95Latency > 200} />
        <InfoBox label="Compression" value={cdnMetrics.compressionEnabled ? "Enabled" : "Disabled"} highlight={cdnMetrics.compressionEnabled} bad={!cdnMetrics.compressionEnabled} />
        <InfoBox label="Cache Headers" value={cdnMetrics.cacheHeaders ? "Present" : "Missing"} highlight={cdnMetrics.cacheHeaders} bad={!cdnMetrics.cacheHeaders} />
        <InfoBox label="Edge Locations" value={cdnMetrics.edgeLocations?.length || 0} />
      </div>

      <DetailSection title="What This Means">
        CDN (Content Delivery Network) performance directly impacts how fast content reaches your users.
        A hit ratio above 95% means most requests are served from cache (fast). Lower ratios mean more
        origin fetches (slow). For OTT platforms, CDN efficiency is critical for video segment delivery,
        manifest files, and static assets.
      </DetailSection>

      {/* Hit ratio analysis */}
      {cdnMetrics.hitRatio < 0.95 && (
        <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300">CDN Hit Ratio Below Target (95%)</span>
          </div>
          <div className="text-[11px] text-gray-400 space-y-1">
            <p>Current hit ratio: {(cdnMetrics.hitRatio * 100).toFixed(1)}%. This means {((1 - cdnMetrics.hitRatio) * 100).toFixed(1)}% of requests are going to origin.</p>
            <p>For OTT video delivery, low cache hit ratio increases buffering and startup time.</p>
          </div>
        </div>
      )}

      {/* Compression warning */}
      {!cdnMetrics.compressionEnabled && (
        <FixRecommendation text="Enable Brotli or Gzip compression on your CDN. This typically reduces transfer sizes by 60-80% for text-based assets (JS, CSS, HTML, manifests)." />
      )}

      {/* Cache headers warning */}
      {!cdnMetrics.cacheHeaders && (
        <FixRecommendation text="Add proper Cache-Control headers to your responses. Use 'public, max-age=31536000, immutable' for versioned static assets and 'no-cache' for dynamic content." />
      )}

      {/* Edge locations */}
      {(cdnMetrics.edgeLocations?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Detected Edge Locations" count={cdnMetrics.edgeLocations!.length} />
          <div className="flex flex-wrap gap-1.5">
            {cdnMetrics.edgeLocations!.map((loc, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-white/[0.04] text-[10px] text-gray-400 font-mono">{loc}</span>
            ))}
          </div>
        </div>
      )}

      {/* Related findings */}
      {cdnFindings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="CDN Issues Found" count={cdnFindings.length} />
          {cdnFindings.map((f) => (
            <div key={f.id} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-xs text-gray-200 font-medium">{f.title}</span>
              </div>
              <div className="text-[11px] text-gray-400">{f.description}</div>
              {f.remediation && (
                <div className="text-[11px] text-green-400/70 mt-1.5">
                  <span className="text-gray-500">Fix: </span>{f.remediation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ImpactBadge effort="medium" impact="CDN optimization improves video delivery and page load speed" />
    </div>
  );
}
