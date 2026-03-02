"use client";

import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { InfoBox, SectionLabel, DetailSection, FixRecommendation, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn } from "@/lib/utils";
import { formatMs } from "@/lib/utils";
import type { Finding } from "@/types/api";

interface CWVDetailProps {
  metricKey: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  findings: Finding[];
}

const CWV_INFO: Record<string, { name: string; unit: string; target: number; description: string; tips: string[] }> = {
  lcp: {
    name: "Largest Contentful Paint",
    unit: "ms",
    target: 2500,
    description: "Measures loading performance — the time until the largest content element becomes visible. A good LCP helps users perceive the page as loading quickly.",
    tips: [
      "Optimize server response times (TTFB)",
      "Use CDN for static assets and images",
      "Preload the LCP image/resource with <link rel=\"preload\">",
      "Eliminate render-blocking JavaScript and CSS",
      "Use responsive images with srcset",
    ],
  },
  fcp: {
    name: "First Contentful Paint",
    unit: "ms",
    target: 1800,
    description: "Measures the time from navigation to when the browser renders the first piece of DOM content. Indicates how quickly users see something on screen.",
    tips: [
      "Reduce server response time",
      "Eliminate render-blocking resources",
      "Minify CSS and remove unused CSS",
      "Preconnect to required origins",
      "Use font-display: swap for web fonts",
    ],
  },
  cls: {
    name: "Cumulative Layout Shift",
    unit: "",
    target: 0.1,
    description: "Measures visual stability — how much the page content shifts unexpectedly during loading. Low CLS means the page is visually stable.",
    tips: [
      "Always set width/height on images and video elements",
      "Reserve space for ads and dynamic content",
      "Avoid inserting content above existing content",
      "Use CSS contain for dynamic content areas",
      "Preload fonts to avoid FOIT/FOUT shifts",
    ],
  },
  ttfb: {
    name: "Time to First Byte",
    unit: "ms",
    target: 800,
    description: "Measures the time between the request for a resource and the first byte of response arriving. Indicates server responsiveness.",
    tips: [
      "Use a CDN to reduce network distance",
      "Optimize server-side processing",
      "Enable HTTP/2 or HTTP/3",
      "Use edge caching and stale-while-revalidate",
      "Optimize database queries",
    ],
  },
  fid: {
    name: "First Input Delay",
    unit: "ms",
    target: 100,
    description: "Measures interactivity — the delay between user's first interaction and browser response. Replaced by INP in newer Core Web Vitals.",
    tips: [
      "Break up long JavaScript tasks",
      "Use web workers for heavy computation",
      "Reduce JavaScript execution time",
      "Minimize main thread work",
      "Use requestIdleCallback for non-critical work",
    ],
  },
  inp: {
    name: "Interaction to Next Paint",
    unit: "ms",
    target: 200,
    description: "Measures overall responsiveness by tracking the latency of all interactions throughout the page lifecycle. The worst-case latency is reported.",
    tips: [
      "Optimize event handlers to be fast",
      "Use content-visibility for off-screen content",
      "Debounce/throttle expensive event handlers",
      "Avoid layout thrashing (forced synchronous layouts)",
      "Yield to the main thread with scheduler.yield()",
    ],
  },
};

export function CWVDetail({ metricKey, value, rating, findings }: CWVDetailProps) {
  const info = CWV_INFO[metricKey] || { name: metricKey.toUpperCase(), unit: "ms", target: 0, description: "Core Web Vital metric.", tips: [] };
  const pct = info.target > 0 ? (value / info.target) * 100 : 0;
  const formattedValue = metricKey === "cls" ? value.toFixed(3) : formatMs(value);
  const formattedTarget = metricKey === "cls" ? String(info.target) : formatMs(info.target);

  const matchedFindings = findings.filter(
    (f) => f.category.toLowerCase().includes(metricKey) || f.title.toLowerCase().includes(info.name.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {/* Header metric */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-gray-100">{formattedValue}</div>
          <div className="text-xs text-gray-500">Target: {formattedTarget}</div>
        </div>
        <span className={cn(
          "badge text-[10px] px-3 py-1",
          rating === "good" ? "bg-green-500/15 text-green-400 border-green-500/30"
          : rating === "needs-improvement" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-red-500/15 text-red-400 border-red-500/30",
        )}>
          {rating}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="w-full bg-surface-1 rounded-full h-2.5">
          <div
            className={cn(
              "h-2.5 rounded-full transition-all",
              rating === "good" ? "bg-green-500" : rating === "needs-improvement" ? "bg-amber-500" : "bg-red-500",
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-500 mt-1">{pct.toFixed(0)}% of target threshold</div>
      </div>

      {/* What this means */}
      <DetailSection title="What This Means">
        {info.description}
      </DetailSection>

      {/* Issues found */}
      {matchedFindings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label="Related Issues" count={matchedFindings.length} />
          {matchedFindings.map((f) => (
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

      {/* Optimization tips */}
      {info.tips.length > 0 && (
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
      )}

      <ImpactBadge effort={rating === "poor" ? "high" : "medium"} impact={`Improving ${info.name} will boost Performance score`} />
    </div>
  );
}
