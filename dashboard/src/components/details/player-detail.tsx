"use client";

import { Zap, MonitorPlay, HardDrive, ServerCrash, BarChart3, Clock, AlertTriangle } from "lucide-react";
import { InfoBox, SectionLabel, DetailSection, FixRecommendation, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn } from "@/lib/utils";
import { formatMs } from "@/lib/utils";
import type { PerformanceMetadata, Finding } from "@/types/api";

interface PlayerDetailProps {
  metricKey: string;
  playerMetrics: PerformanceMetadata["playerMetrics"];
  findings: Finding[];
}

const PLAYER_INFO: Record<string, { label: string; description: string; target: string; tips: string[] }> = {
  startupDelay: {
    label: "Startup Delay",
    description: "Time from user pressing play to when the video player begins loading content. High startup delay causes user abandonment — studies show 53% of users leave if video takes >3 seconds to start.",
    target: "<3,000ms",
    tips: [
      "Preload player SDK on page load",
      "Use manifest prefetching for likely-to-play content",
      "Optimize DRM license acquisition (parallel with manifest fetch)",
      "Reduce player initialization overhead",
    ],
  },
  timeToFirstFrame: {
    label: "Time to First Frame",
    description: "Total time from play action to the first video frame rendering on screen. Includes player init, manifest fetch, DRM license, segment download, and decode.",
    target: "<4,000ms",
    tips: [
      "Use low-latency ABR start with small initial segments",
      "Pre-fetch first segment during manifest parse",
      "Use hardware video decode where available",
      "Optimize initial quality selection (start low, switch up)",
    ],
  },
  bufferRatio: {
    label: "Buffer Ratio",
    description: "Percentage of playback time spent in buffering state. A buffer ratio >2% significantly degrades user experience and increases churn.",
    target: "<2%",
    tips: [
      "Increase buffer target (30-60s forward buffer)",
      "Optimize ABR algorithm for network conditions",
      "Use multiple CDN failover for segment delivery",
      "Implement predictive buffering based on user behavior",
    ],
  },
  rebufferEvents: {
    label: "Rebuffer Events",
    description: "Number of times playback stalled waiting for data after initial play. Each rebuffer event is a significant UX degradation.",
    target: "0",
    tips: [
      "Increase buffer size to handle network fluctuations",
      "Implement aggressive ABR downshift on bandwidth drops",
      "Use shorter segment durations (2-4s) for faster adaptation",
      "Add CDN failover with latency-based routing",
    ],
  },
  abrSwitchCount: {
    label: "ABR Switches",
    description: "Number of Adaptive Bitrate quality switches during playback. Frequent switches indicate unstable network or aggressive ABR algorithm.",
    target: "Informational",
    tips: [
      "Tune ABR algorithm's stability factor",
      "Use bandwidth estimation smoothing",
      "Implement switch hysteresis (avoid rapid up/down switching)",
    ],
  },
  drmLicenseTime: {
    label: "DRM License Time",
    description: "Time to acquire DRM license (Widevine/FairPlay). This is a blocking step before playback can begin for protected content.",
    target: "<2,000ms",
    tips: [
      "Pre-fetch DRM license before user clicks play",
      "Use persistent licenses for returning users",
      "Optimize license server response time",
      "Implement license caching strategy",
    ],
  },
  playbackFailures: {
    label: "Playback Failures",
    description: "Number of complete playback failures where the video could not play at all. Critical metric — every failure is a lost viewing session.",
    target: "0",
    tips: [
      "Implement comprehensive error handling with retry logic",
      "Add fallback streams (different codec/resolution)",
      "Monitor and alert on failure rate spikes",
      "Test across all target devices and browsers",
    ],
  },
};

export function PlayerDetail({ metricKey, playerMetrics, findings }: PlayerDetailProps) {
  const info = PLAYER_INFO[metricKey];
  if (!info) return null;

  const rawValue = playerMetrics[metricKey as keyof typeof playerMetrics];
  const isRatio = metricKey === "bufferRatio";
  const isCount = metricKey === "rebufferEvents" || metricKey === "abrSwitchCount" || metricKey === "playbackFailures";
  const displayValue = isRatio ? `${((rawValue as number) * 100).toFixed(1)}%` : isCount ? String(rawValue) : formatMs(rawValue as number);

  const isGood = metricKey === "startupDelay" ? (rawValue as number) < 3000
    : metricKey === "timeToFirstFrame" ? (rawValue as number) < 4000
    : metricKey === "bufferRatio" ? (rawValue as number) < 0.02
    : metricKey === "rebufferEvents" ? rawValue === 0
    : metricKey === "drmLicenseTime" ? (rawValue as number) < 2000
    : metricKey === "playbackFailures" ? rawValue === 0
    : true;

  const playerFindings = findings.filter(
    (f) => f.category.toLowerCase().includes("player") || f.title.toLowerCase().includes(info.label.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-gray-100">{displayValue}</div>
          <div className="text-xs text-gray-500">Target: {info.target}</div>
        </div>
        <span className={cn(
          "badge text-[10px] px-3 py-1",
          isGood ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-red-500/15 text-red-400 border-red-500/30",
        )}>
          {isGood ? "Good" : "Needs Fix"}
        </span>
      </div>

      <DetailSection title="What This Means">
        {info.description}
      </DetailSection>

      {playerFindings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Related Issues" count={playerFindings.length} />
          {playerFindings.map((f) => (
            <div key={f.id} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-xs text-gray-200 font-medium">{f.title}</span>
              </div>
              <div className="text-[11px] text-gray-400">{f.description}</div>
              {f.remediation && <FixRecommendation text={f.remediation} />}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel label="Optimization Tips" />
        <div className="space-y-1.5">
          {info.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="text-brand-400 shrink-0">{i + 1}.</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </div>

      <ImpactBadge effort={isGood ? "low" : "high"} impact="Directly impacts OTT viewer experience and retention" />
    </div>
  );
}
