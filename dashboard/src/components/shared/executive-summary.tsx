"use client";

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, ChevronUp, FileText, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Markdown-lite renderer for executive summary text ──
function renderSummaryMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // headings
    .replace(/^### (.+)$/gm, '<h4 class="text-xs font-semibold text-gray-200 mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-200 mt-4 mb-1.5">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-sm font-bold text-gray-100 mt-4 mb-2">$1</h2>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-200 font-semibold">$1</strong>')
    // inline code
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/[0.06] text-brand-300 text-[10px] font-mono">$1</code>')
    // bullets
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-1.5 ml-1"><span class="text-brand-400 mt-[5px] text-[6px] shrink-0">●</span><span>$1</span></li>')
    // numbered lists
    .replace(/^(\d+)\. (.+)$/gm, '<li class="flex items-start gap-1.5 ml-1"><span class="text-brand-400 text-[11px] font-bold min-w-[14px] shrink-0">$1.</span><span>$2</span></li>')
    // double newlines → paragraph breaks
    .replace(/\n\n/g, '</p><p class="mt-2">')
    // remaining single newlines inside sentences
    .replace(/\n/g, " ");
}

// ── Full-screen modal viewer ──
function SummaryModal({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-xl bg-surface-1 border border-white/[0.08] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-gray-100">Executive Summary</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div
            className="text-[13px] text-gray-400 leading-relaxed [&_strong]:text-gray-200 [&_h2]:text-gray-100 [&_h3]:text-gray-200 [&_h4]:text-gray-200 [&_li]:my-0.5"
            dangerouslySetInnerHTML={{ __html: renderSummaryMarkdown(text) }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
interface ExecutiveSummaryProps {
  text: string;
  /** Max visible lines before truncation (default: 4) */
  maxLines?: number;
  /** Variant: "card" wraps in its own card, "inline" renders bare content */
  variant?: "card" | "inline";
  className?: string;
}

export function ExecutiveSummary({
  text,
  maxLines = 4,
  variant = "card",
  className,
}: ExecutiveSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Detect whether text overflows the clamped height
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setIsTruncated(el.scrollHeight > el.clientHeight + 2);
  }, [text, maxLines, expanded]);

  const rendered = renderSummaryMarkdown(text);

  const content = (
    <>
      {variant === "card" && (
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-200">Executive Summary</h2>
          {text.length > 200 && (
            <button
              onClick={() => setShowModal(true)}
              className="p-1 rounded hover:bg-white/[0.06] text-gray-500 hover:text-gray-300 transition-colors"
              title="Open in viewer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {variant === "inline" && text.length > 300 && (
        <div className="flex justify-end mb-1">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Maximize2 className="w-3 h-3" /> Expand
          </button>
        </div>
      )}

      <div
        ref={contentRef}
        className="text-xs text-gray-400 leading-relaxed [&_strong]:text-gray-200 [&_h2]:text-gray-100 [&_h3]:text-gray-200 [&_h4]:text-gray-200 [&_li]:my-0.5 overflow-hidden transition-all duration-300"
        style={!expanded ? { maxHeight: `${maxLines * 1.625}rem` } : { maxHeight: "2000px" }}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />

      {/* Show More / Show Less toggle */}
      {(isTruncated || expanded) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-2 text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> Read more
            </>
          )}
        </button>
      )}

      {showModal && <SummaryModal text={text} onClose={() => setShowModal(false)} />}
    </>
  );

  if (variant === "inline") {
    return <div className={className}>{content}</div>;
  }

  return <div className={cn("card p-5", className)}>{content}</div>;
}
