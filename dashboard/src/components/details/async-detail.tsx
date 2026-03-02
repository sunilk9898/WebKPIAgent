"use client";

import { Timer, AlertTriangle } from "lucide-react";
import { SectionLabel, DetailSection, FixRecommendation, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn, getSeverityBg } from "@/lib/utils";
import type { CodeQualityMetadata } from "@/types/api";

interface AsyncDetailProps {
  asyncIssues: CodeQualityMetadata["asyncIssues"];
}

const TYPE_INFO: Record<string, { label: string; description: string; fix: string }> = {
  "unhandled-promise": {
    label: "Unhandled Promise",
    description: "Promises without .catch() or try/catch. Unhandled rejections crash Node.js and cause silent failures in browsers.",
    fix: "Add .catch() to all promises or wrap in try/catch. Consider adding a global unhandledrejection handler as a safety net.",
  },
  "race-condition": {
    label: "Race Condition",
    description: "Multiple async operations that may execute in unpredictable order, leading to data corruption or inconsistent state.",
    fix: "Use proper synchronization: Promise.all for parallel, await for sequential, or mutex/semaphore for shared resources.",
  },
  "missing-await": {
    label: "Missing Await",
    description: "Async function called without await, causing the promise result to be lost and potential timing issues.",
    fix: "Add 'await' keyword before the async call, or explicitly handle the returned promise with .then()/.catch().",
  },
  "callback-hell": {
    label: "Callback Hell",
    description: "Deeply nested callbacks making code hard to read, maintain, and debug. Increases risk of bugs and error handling gaps.",
    fix: "Refactor to async/await syntax or use Promise chains. Break complex flows into smaller named functions.",
  },
  deadlock: {
    label: "Potential Deadlock",
    description: "Code patterns that could cause circular waiting between async operations, potentially freezing execution.",
    fix: "Review dependency chains, ensure consistent lock ordering, and add timeouts to prevent indefinite blocking.",
  },
};

export function AsyncDetail({ asyncIssues }: AsyncDetailProps) {
  const byType = asyncIssues.reduce((acc, a) => {
    if (!acc[a.type]) acc[a.type] = [];
    acc[a.type].push(a);
    return acc;
  }, {} as Record<string, typeof asyncIssues>);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-gray-100">{asyncIssues.length}</div>
          <div className="text-xs text-gray-500">Async issues detected</div>
        </div>
        <span className={cn(
          "badge text-[10px] px-3 py-1",
          asyncIssues.length === 0 ? "bg-green-500/15 text-green-400 border-green-500/30"
          : "bg-amber-500/15 text-amber-400 border-amber-500/30",
        )}>
          {asyncIssues.length === 0 ? "Clean" : "Issues Found"}
        </span>
      </div>

      <DetailSection title="What This Means">
        Async issues indicate problems with how your code handles asynchronous operations (promises, callbacks, timers).
        These can lead to race conditions, unhandled errors, memory leaks, and unpredictable behavior — especially
        critical for real-time OTT operations like video buffering, DRM license fetching, and player state management.
      </DetailSection>

      {Object.entries(byType).map(([type, items]) => {
        const info = TYPE_INFO[type] || { label: type, description: "Async issue detected.", fix: "Review and fix." };
        return (
          <div key={type} className="space-y-2">
            <SectionLabel label={info.label} count={items.length} />
            <div className="text-[11px] text-gray-400 mb-2">{info.description}</div>

            {items.map((issue, i) => (
              <div key={i} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-200">{issue.description}</span>
                  <span className={cn("badge text-[9px]", getSeverityBg(issue.severity))}>{issue.severity}</span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">{issue.file}:{issue.line}</div>
              </div>
            ))}

            <FixRecommendation text={info.fix} />
          </div>
        );
      })}

      {asyncIssues.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/[0.06] border border-green-500/10">
          <span className="text-xs text-green-300">No async issues detected.</span>
        </div>
      )}

      <ImpactBadge effort="medium" impact="Fixing async issues prevents crashes and data corruption" />
    </div>
  );
}
