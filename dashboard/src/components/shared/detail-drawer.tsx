"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetailDrawerProps {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export function DetailDrawer({ title, subtitle, isOpen, onClose, children, maxWidth = "max-w-lg" }: DetailDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      {/* Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full bg-surface-0 border-l border-white/[0.06] z-50 flex flex-col animate-slide-in-right overflow-hidden",
        maxWidth,
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-100">{title}</h2>
            {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-colors shrink-0 ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {children}
        </div>
      </div>
    </>
  );
}

// Shared sub-components for detail panels
export function InfoBox({ label, value, highlight, bad }: { label: string; value: string | number; highlight?: boolean; bad?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={cn(
        "text-sm font-bold mt-1",
        bad ? "text-red-400" : highlight ? "text-green-400" : "text-gray-200",
      )}>
        {value}
      </div>
    </div>
  );
}

export function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-300">{label}</span>
      {count !== undefined && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-500">{count}</span>}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <span className={cn(
      "badge text-[10px]",
      status === "good" && "bg-green-500/15 text-green-400 border-green-500/30",
      status === "warn" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
      status === "bad" && "bg-red-500/15 text-red-400 border-red-500/30",
      status === "neutral" && "bg-white/[0.06] text-gray-400 border-white/[0.08]",
    )}>
      {status === "good" ? "Good" : status === "warn" ? "Needs Work" : status === "bad" ? "Poor" : "Info"}
    </span>
  );
}

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      <div className="text-xs text-gray-300 leading-relaxed">{children}</div>
    </div>
  );
}

export function FixRecommendation({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-500/[0.06] border border-brand-500/15">
      <span className="text-brand-400 text-xs font-medium shrink-0">Fix:</span>
      <span className="text-xs text-gray-300">{text}</span>
    </div>
  );
}

export function ImpactBadge({ effort, impact }: { effort: "low" | "medium" | "high"; impact: string }) {
  return (
    <div className="flex items-center gap-3 text-[10px]">
      <span className="text-gray-500">Impact: <span className="text-gray-300">{impact}</span></span>
      <span className={cn(
        "px-2 py-0.5 rounded-full font-medium",
        effort === "low" ? "bg-green-500/15 text-green-400" :
        effort === "medium" ? "bg-amber-500/15 text-amber-400" :
        "bg-red-500/15 text-red-400",
      )}>
        {effort} effort
      </span>
    </div>
  );
}
