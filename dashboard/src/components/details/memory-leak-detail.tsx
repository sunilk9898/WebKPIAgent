"use client";

import { Timer, AlertTriangle } from "lucide-react";
import { SectionLabel, DetailSection, FixRecommendation, ImpactBadge } from "@/components/shared/detail-drawer";
import { cn, getSeverityBg } from "@/lib/utils";
import type { CodeQualityMetadata } from "@/types/api";

interface MemoryLeakDetailProps {
  memoryLeaks: CodeQualityMetadata["memoryLeaks"];
}

const TYPE_INFO: Record<string, { label: string; description: string; fix: string }> = {
  "event-listener": {
    label: "Event Listener Leak",
    description: "Event listeners attached but never removed. This prevents garbage collection of associated DOM elements and closures.",
    fix: "Always call removeEventListener in cleanup (useEffect return, componentWillUnmount, or AbortController).",
  },
  timer: {
    label: "Timer Leak",
    description: "setInterval or setTimeout created without being cleared. Timers hold references to their callback closures.",
    fix: "Store timer IDs and call clearInterval/clearTimeout in cleanup functions.",
  },
  closure: {
    label: "Closure Leak",
    description: "A closure is retaining references to large objects beyond their useful lifetime, preventing garbage collection.",
    fix: "Null out references when no longer needed, or restructure to avoid capturing large objects in closures.",
  },
  "dom-reference": {
    label: "DOM Reference Leak",
    description: "References to removed DOM elements kept in JavaScript, preventing memory from being freed.",
    fix: "Set DOM references to null after removing elements. Use WeakRef for optional DOM references.",
  },
  subscription: {
    label: "Subscription Leak",
    description: "Observable/event subscriptions created but never unsubscribed, causing accumulation over time.",
    fix: "Always unsubscribe in cleanup. Use takeUntil pattern or subscription management utilities.",
  },
};

export function MemoryLeakDetail({ memoryLeaks }: MemoryLeakDetailProps) {
  // Group by type
  const byType = memoryLeaks.reduce((acc, m) => {
    if (!acc[m.type]) acc[m.type] = [];
    acc[m.type].push(m);
    return acc;
  }, {} as Record<string, typeof memoryLeaks>);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-gray-100">{memoryLeaks.length}</div>
          <div className="text-xs text-gray-500">Potential memory leaks detected</div>
        </div>
        <span className={cn(
          "badge text-[10px] px-3 py-1",
          memoryLeaks.length === 0 ? "bg-green-500/15 text-green-400 border-green-500/30"
          : "bg-red-500/15 text-red-400 border-red-500/30",
        )}>
          {memoryLeaks.length === 0 ? "No Leaks" : "Leaks Found"}
        </span>
      </div>

      <DetailSection title="What This Means">
        Memory leaks cause your application to consume increasing amounts of memory over time.
        For OTT platforms running video players, this is especially dangerous — leaked memory can cause
        player crashes, tab freezes, and degraded performance during long viewing sessions.
      </DetailSection>

      {/* By type breakdown */}
      {Object.entries(byType).map(([type, items]) => {
        const info = TYPE_INFO[type] || { label: type, description: "Memory leak detected.", fix: "Review and fix the leak." };
        return (
          <div key={type} className="space-y-2">
            <SectionLabel label={info.label} count={items.length} />
            <div className="text-[11px] text-gray-400 mb-2">{info.description}</div>

            {items.map((leak, i) => (
              <div key={i} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Timer className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-gray-200">{leak.description}</span>
                  </div>
                  <span className={cn("badge text-[9px]", getSeverityBg(leak.severity))}>{leak.severity}</span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">{leak.file}:{leak.line}</div>
              </div>
            ))}

            <FixRecommendation text={info.fix} />
          </div>
        );
      })}

      {memoryLeaks.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/[0.06] border border-green-500/10">
          <span className="text-xs text-green-300">No memory leaks detected. Great job!</span>
        </div>
      )}

      <ImpactBadge effort="high" impact="Memory leaks cause crashes and degraded experience over time" />
    </div>
  );
}
