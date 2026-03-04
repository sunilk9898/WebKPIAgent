"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import type {
  ScanReport,
  SecurityMetadata,
  PerformanceMetadata,
  CodeQualityMetadata,
} from "@/types/api";
import html2canvas from "html2canvas";

// =============================================================================
// Types
// =============================================================================

interface MindMapProps {
  report: ScanReport;
}

interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
  category: "root" | "security" | "performance" | "code-quality" | "recommendations" | "executive";
  valueColor?: "good" | "bad" | "neutral";
}

interface LayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category: TreeNode["category"];
  valueColor?: "good" | "bad" | "neutral";
  children: LayoutNode[];
  parentX?: number;
  parentY?: number;
  parentHeight?: number;
}

// =============================================================================
// Constants
// =============================================================================

const NODE_H = 36;
const NODE_PAD_X = 20;
const LEVEL_GAP_Y = 56;
const BRANCH_GAP_X = 32;
const ROOT_H = 44;
const FONT_SIZE = 12;
const ROOT_FONT_SIZE = 14;
const MIN_NODE_W = 140;
const MAX_NODE_W = 320;

const CATEGORY_COLORS: Record<TreeNode["category"], string> = {
  root: "#1E40AF",
  security: "#EF4444",
  performance: "#22C55E",
  "code-quality": "#A855F7",
  recommendations: "#F59E0B",
  executive: "#3B82F6",
};

const VALUE_BG: Record<string, string> = {
  good: "#0F4D3A",
  bad: "#4D1F0F",
  neutral: "#1E293B",
};

// =============================================================================
// Helpers
// =============================================================================

function scoreColor(score: number): "good" | "bad" | "neutral" {
  if (score >= 90) return "good";
  if (score >= 70) return "neutral";
  return "bad";
}

function measureText(text: string, fontSize: number): number {
  return Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, text.length * fontSize * 0.58 + NODE_PAD_X * 2));
}

function ratingLabel(rating: string): string {
  if (rating === "good") return "Good";
  if (rating === "needs-improvement") return "Needs Improvement";
  if (rating === "poor") return "Poor";
  return rating;
}

function truncateLabel(str: string, maxLen: number = 48): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

// =============================================================================
// Build tree from report
// =============================================================================

function buildTree(report: ScanReport): TreeNode {
  const kpi = report.kpiScore;
  const secResult = report.agentResults.find((a) => a.agentType === "security");
  const perfResult = report.agentResults.find((a) => a.agentType === "performance");
  const cqResult = report.agentResults.find((a) => a.agentType === "code-quality");

  const secMeta = (secResult?.metadata ?? {}) as SecurityMetadata;
  const perfMeta = (perfResult?.metadata ?? {}) as PerformanceMetadata;
  const cqMeta = (cqResult?.metadata ?? {}) as CodeQualityMetadata;

  // --- Executive Summary ---
  const totalFindings = report.agentResults.reduce((sum, r) => sum + r.findings.length, 0);
  const executiveSummary: TreeNode = {
    id: "executive",
    label: "Executive Summary",
    category: "executive",
    children: [
      {
        id: "exec-kpi",
        label: `Overall KPI: ${kpi.overallScore.toFixed(1)} (${kpi.passesThreshold ? "PASS" : "FAIL"})`,
        category: "executive",
        valueColor: kpi.passesThreshold ? "good" : "bad",
        children: [],
      },
      {
        id: "exec-target",
        label: "Target Score: 95.0",
        category: "executive",
        valueColor: "neutral",
        children: [],
      },
      {
        id: "exec-findings",
        label: `Total Findings: ${totalFindings}`,
        category: "executive",
        valueColor: totalFindings === 0 ? "good" : totalFindings < 10 ? "neutral" : "bad",
        children: [],
      },
      {
        id: "exec-regressions",
        label: `Regressions: ${kpi.regressions.length}`,
        category: "executive",
        valueColor: kpi.regressions.length === 0 ? "good" : "bad",
        children: [],
      },
    ],
  };

  // --- Security Analysis ---
  const secScore = secResult?.score?.rawScore ?? 0;
  const criticalFindings = report.criticalFindings.slice(0, 3);
  const unauthEndpoints = (secMeta.apiExposure ?? []).filter((e) => !e.authenticated);
  const tokenLeaks = secMeta.tokenLeaks ?? [];
  const sslGrade = secMeta.sslAnalysis?.grade ?? "N/A";
  const missingHeaders = secMeta.headerAnalysis?.missing ?? [];
  const drmDetected = secMeta.drmAnalysis?.widevineDetected || secMeta.drmAnalysis?.fairplayDetected;

  const securityAnalysis: TreeNode = {
    id: "security",
    label: `Security Analysis (${secScore.toFixed(1)})`,
    category: "security",
    children: [
      {
        id: "sec-critical",
        label: "Critical Vulnerabilities",
        category: "security",
        children: criticalFindings.length > 0
          ? criticalFindings.map((f, i) => ({
              id: `sec-crit-${i}`,
              label: truncateLabel(f.title),
              category: "security" as const,
              valueColor: "bad" as const,
              children: [],
            }))
          : [{ id: "sec-crit-none", label: "None found", category: "security" as const, valueColor: "good" as const, children: [] }],
      },
      {
        id: "sec-api",
        label: "API Security",
        category: "security",
        children: [
          {
            id: "sec-api-unauth",
            label: `${unauthEndpoints.length} Unauthenticated endpoints`,
            category: "security",
            valueColor: unauthEndpoints.length === 0 ? "good" : "bad",
            children: [],
          },
          {
            id: "sec-api-exposure",
            label: `${(secMeta.apiExposure ?? []).filter((e) => e.sensitiveData).length} Sensitive data exposures`,
            category: "security",
            valueColor: (secMeta.apiExposure ?? []).filter((e) => e.sensitiveData).length === 0 ? "good" : "bad",
            children: [],
          },
        ],
      },
      {
        id: "sec-identity",
        label: "Identity & Access",
        category: "security",
        children: [
          {
            id: "sec-id-tokens",
            label: `${tokenLeaks.length} Token leaks`,
            category: "security",
            valueColor: tokenLeaks.length === 0 ? "good" : "bad",
            children: [],
          },
          {
            id: "sec-id-storage",
            label: tokenLeaks.some((t) => t.location.includes("localStorage") || t.location.includes("sessionStorage"))
              ? "Insecure localStorage/sessionStorage"
              : "Storage: Secure",
            category: "security",
            valueColor: tokenLeaks.some((t) => t.location.includes("localStorage") || t.location.includes("sessionStorage")) ? "bad" : "good",
            children: [],
          },
          {
            id: "sec-id-cookies",
            label: secMeta.corsAnalysis?.allowCredentials ? "Insecure Cookies (credentials)" : "Cookies: OK",
            category: "security",
            valueColor: secMeta.corsAnalysis?.allowCredentials ? "bad" : "good",
            children: [],
          },
        ],
      },
      {
        id: "sec-infra",
        label: "Infrastructure",
        category: "security",
        children: [
          {
            id: "sec-infra-ssl",
            label: `SSL Grade: ${sslGrade}`,
            category: "security",
            valueColor: sslGrade === "A+" || sslGrade === "A" ? "good" : sslGrade === "B" ? "neutral" : "bad",
            children: [],
          },
          {
            id: "sec-infra-headers",
            label: `${missingHeaders.length} Missing Security Headers`,
            category: "security",
            valueColor: missingHeaders.length === 0 ? "good" : missingHeaders.length <= 2 ? "neutral" : "bad",
            children: [],
          },
          {
            id: "sec-infra-drm",
            label: `DRM: ${drmDetected ? "Detected" : "Not Detected"}`,
            category: "security",
            valueColor: drmDetected ? "good" : "neutral",
            children: [],
          },
        ],
      },
    ],
  };

  // --- Performance Analysis ---
  const perfScore = perfResult?.score?.rawScore ?? 0;
  const cwv = perfMeta.coreWebVitals ?? {};
  const lh = perfMeta.lighthouse ?? { performanceScore: 0, accessibilityScore: 0, seoScore: 0, bestPracticesScore: 0 };
  const resMet = perfMeta.resourceMetrics ?? { jsSize: 0, thirdPartySize: 0 };
  const cdn = perfMeta.cdnMetrics ?? { hitRatio: 0 };

  const performanceAnalysis: TreeNode = {
    id: "performance",
    label: `Performance Analysis (${perfScore.toFixed(1)})`,
    category: "performance",
    children: [
      {
        id: "perf-cwv",
        label: "Core Web Vitals",
        category: "performance",
        children: Object.entries(cwv).slice(0, 4).map(([key, v]) => ({
          id: `perf-cwv-${key}`,
          label: `${key.toUpperCase()}: ${key === "cls" ? v.value.toFixed(3) : Math.round(v.value)}${key === "cls" ? "" : "ms"} (${ratingLabel(v.rating)})`,
          category: "performance" as const,
          valueColor: (v.rating === "good" ? "good" : v.rating === "poor" ? "bad" : "neutral") as "good" | "bad" | "neutral",
          children: [],
        })),
      },
      {
        id: "perf-resources",
        label: "Resource Metrics",
        category: "performance",
        children: [
          {
            id: "perf-res-js",
            label: `JavaScript: ${(resMet.jsSize / 1024).toFixed(0)}KB`,
            category: "performance",
            valueColor: resMet.jsSize / 1024 < 300 ? "good" : resMet.jsSize / 1024 < 600 ? "neutral" : "bad",
            children: [],
          },
          {
            id: "perf-res-3p",
            label: `3rd Party: ${(resMet.thirdPartySize / 1024).toFixed(0)}KB`,
            category: "performance",
            valueColor: resMet.thirdPartySize / 1024 < 200 ? "good" : resMet.thirdPartySize / 1024 < 500 ? "neutral" : "bad",
            children: [],
          },
          {
            id: "perf-res-cache",
            label: `Cache Hit Ratio: ${(cdn.hitRatio * 100).toFixed(0)}%`,
            category: "performance",
            valueColor: cdn.hitRatio >= 0.9 ? "good" : cdn.hitRatio >= 0.7 ? "neutral" : "bad",
            children: [],
          },
        ],
      },
      {
        id: "perf-lighthouse",
        label: "Lighthouse Scores",
        category: "performance",
        children: [
          {
            id: "perf-lh-perf",
            label: `Performance: ${Math.round(lh.performanceScore)}`,
            category: "performance",
            valueColor: scoreColor(lh.performanceScore),
            children: [],
          },
          {
            id: "perf-lh-a11y",
            label: `Accessibility: ${Math.round(lh.accessibilityScore)}`,
            category: "performance",
            valueColor: scoreColor(lh.accessibilityScore),
            children: [],
          },
          {
            id: "perf-lh-seo",
            label: `SEO: ${Math.round(lh.seoScore)}`,
            category: "performance",
            valueColor: scoreColor(lh.seoScore),
            children: [],
          },
          {
            id: "perf-lh-bp",
            label: `Best Practices: ${Math.round(lh.bestPracticesScore)}`,
            category: "performance",
            valueColor: scoreColor(lh.bestPracticesScore),
            children: [],
          },
        ],
      },
    ],
  };

  // --- Code Quality ---
  const cqScore = cqResult?.score?.rawScore ?? 0;
  const lint = cqMeta.lintResults ?? { errors: 0, warnings: 0 };
  const complexity = cqMeta.complexity ?? { technicalDebt: "N/A" };
  const antiPatterns = cqMeta.antiPatterns ?? [];

  const codeQuality: TreeNode = {
    id: "code-quality",
    label: `Code Quality (${cqScore.toFixed(1)})`,
    category: "code-quality",
    children: [
      {
        id: "cq-lint",
        label: `Static Analysis: ${lint.errors + lint.warnings} findings`,
        category: "code-quality",
        valueColor: lint.errors === 0 ? "good" : lint.errors < 5 ? "neutral" : "bad",
        children: [],
      },
      {
        id: "cq-debt",
        label: `Technical Debt: ${complexity.technicalDebt}`,
        category: "code-quality",
        valueColor: "neutral",
        children: [],
      },
      {
        id: "cq-anti",
        label: antiPatterns.length > 0
          ? `Anti-patterns: ${antiPatterns.length} found`
          : "Anti-patterns: None",
        category: "code-quality",
        valueColor: antiPatterns.length === 0 ? "good" : antiPatterns.length < 3 ? "neutral" : "bad",
        children: [],
      },
    ],
  };

  // --- Recommendations ---
  const recs = (report.recommendations ?? []).slice(0, 5);
  const recommendations: TreeNode = {
    id: "recommendations",
    label: "Recommendations",
    category: "recommendations",
    children: recs.length > 0
      ? recs.map((r, i) => ({
          id: `rec-${i}`,
          label: truncateLabel(r.title),
          category: "recommendations" as const,
          valueColor: "neutral" as const,
          children: [],
        }))
      : [{ id: "rec-none", label: "No recommendations", category: "recommendations" as const, valueColor: "good" as const, children: [] }],
  };

  return {
    id: "root",
    label: "VZY OTT Verification Agent Report",
    category: "root",
    children: [executiveSummary, securityAnalysis, performanceAnalysis, codeQuality, recommendations],
  };
}

// =============================================================================
// Layout engine - computes x/y positions for each node
// =============================================================================

function computeSubtreeWidth(node: TreeNode, depth: number, expanded: Set<string>): number {
  if (node.children.length === 0 || !expanded.has(node.id)) {
    const fontSize = depth === 0 ? ROOT_FONT_SIZE : FONT_SIZE;
    return measureText(node.label, fontSize);
  }

  const childWidths = node.children.map((c) => computeSubtreeWidth(c, depth + 1, expanded));
  const totalChildWidth = childWidths.reduce((a, b) => a + b, 0) + BRANCH_GAP_X * (childWidths.length - 1);
  const fontSize = depth === 0 ? ROOT_FONT_SIZE : FONT_SIZE;
  const selfWidth = measureText(node.label, fontSize);

  return Math.max(selfWidth, totalChildWidth);
}

function layoutTree(
  node: TreeNode,
  x: number,
  y: number,
  depth: number,
  expanded: Set<string>,
  parentX?: number,
  parentY?: number,
  parentHeight?: number,
): LayoutNode {
  const isRoot = depth === 0;
  const fontSize = isRoot ? ROOT_FONT_SIZE : FONT_SIZE;
  const nodeH = isRoot ? ROOT_H : NODE_H;
  const nodeW = measureText(node.label, fontSize);

  const layout: LayoutNode = {
    id: node.id,
    label: node.label,
    x: x - nodeW / 2,
    y,
    width: nodeW,
    height: nodeH,
    category: node.category,
    valueColor: node.valueColor,
    children: [],
    parentX,
    parentY,
    parentHeight,
  };

  if (node.children.length === 0 || !expanded.has(node.id)) {
    return layout;
  }

  const childY = y + nodeH + LEVEL_GAP_Y;
  const childWidths = node.children.map((c) => computeSubtreeWidth(c, depth + 1, expanded));
  const totalWidth = childWidths.reduce((a, b) => a + b, 0) + BRANCH_GAP_X * (childWidths.length - 1);
  let childX = x - totalWidth / 2;

  layout.children = node.children.map((child, i) => {
    const cw = childWidths[i];
    const cx = childX + cw / 2;
    childX += cw + BRANCH_GAP_X;
    return layoutTree(child, cx, childY, depth + 1, expanded, x, y, nodeH);
  });

  return layout;
}

function collectAllNodes(layout: LayoutNode): LayoutNode[] {
  const result: LayoutNode[] = [layout];
  for (const child of layout.children) {
    result.push(...collectAllNodes(child));
  }
  return result;
}

function computeBounds(nodes: LayoutNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX, minY, maxX, maxY };
}

// =============================================================================
// Generate text representation for copy/download
// =============================================================================

function treeToText(node: TreeNode, indent: string = "", isLast: boolean = true, isRoot: boolean = true): string {
  const prefix = isRoot ? "" : isLast ? indent + "\\-- " : indent + "|-- ";
  const childIndent = isRoot ? "" : isLast ? indent + "    " : indent + "|   ";
  let result = prefix + node.label + "\n";
  node.children.forEach((child, i) => {
    result += treeToText(child, childIndent, i === node.children.length - 1, false);
  });
  return result;
}

// =============================================================================
// SVG Node Component
// =============================================================================

function MindMapNode({
  node,
  expanded,
  hasChildren,
  onToggle,
}: {
  node: LayoutNode;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: (id: string) => void;
}) {
  const isRoot = node.category === "root";
  const catColor = CATEGORY_COLORS[node.category];
  const bgColor = isRoot
    ? CATEGORY_COLORS.root
    : node.valueColor
      ? VALUE_BG[node.valueColor]
      : VALUE_BG.neutral;
  const borderColor = isRoot ? "#3B82F6" : catColor;
  const fontSize = isRoot ? ROOT_FONT_SIZE : FONT_SIZE;

  return (
    <g
      className="cursor-pointer select-none"
      onClick={() => hasChildren && onToggle(node.id)}
      role="button"
      tabIndex={0}
      aria-label={node.label}
    >
      {/* Node rectangle */}
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={8}
        ry={8}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isRoot ? 2.5 : 1.5}
        className="transition-all duration-200"
      />

      {/* Label text */}
      <text
        x={node.x + node.width / 2}
        y={node.y + node.height / 2 + (hasChildren && !isRoot ? -2 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#F1F5F9"
        fontSize={fontSize}
        fontWeight={isRoot ? 700 : 500}
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {node.label.length > 38 ? node.label.slice(0, 35) + "..." : node.label}
      </text>

      {/* Expand/collapse indicator */}
      {hasChildren && !isRoot && (
        <text
          x={node.x + node.width / 2}
          y={node.y + node.height - 7}
          textAnchor="middle"
          fill={catColor}
          fontSize={9}
          fontFamily="system-ui, -apple-system, sans-serif"
          opacity={0.7}
        >
          {expanded ? "[ - ]" : `[ + ${node.children.length || "..."} ]`}
        </text>
      )}
    </g>
  );
}

// =============================================================================
// SVG Connection Path
// =============================================================================

function ConnectionPath({ child }: { child: LayoutNode }) {
  if (child.parentX === undefined || child.parentY === undefined || child.parentHeight === undefined) {
    return null;
  }

  const startX = child.parentX;
  const startY = child.parentY + child.parentHeight;
  const endX = child.x + child.width / 2;
  const endY = child.y;
  const midY = (startY + endY) / 2;

  const catColor = CATEGORY_COLORS[child.category];

  return (
    <path
      d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
      fill="none"
      stroke={catColor}
      strokeWidth={1.5}
      strokeOpacity={0.4}
      className="transition-all duration-300"
    />
  );
}

// =============================================================================
// Main MindMap Component
// =============================================================================

export function MindMap({ report }: MindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Start with root and top-level branches expanded
    return new Set(["root", "executive", "security", "performance", "code-quality", "recommendations"]);
  });

  // Build tree data from report
  const tree = useMemo(() => buildTree(report), [report]);

  // Toggle expand/collapse
  const handleToggle = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Collapse: remove this node and all descendants
        const removeDescendants = (node: TreeNode) => {
          for (const child of node.children) {
            next.delete(child.id);
            removeDescendants(child);
          }
        };
        next.delete(id);
        const findNode = (n: TreeNode): TreeNode | null => {
          if (n.id === id) return n;
          for (const c of n.children) {
            const found = findNode(c);
            if (found) return found;
          }
          return null;
        };
        const target = findNode(tree);
        if (target) removeDescendants(target);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [tree]);

  // Compute layout
  const { allNodes, svgWidth, svgHeight, offsetX, offsetY } = useMemo(() => {
    const PAD = 60;
    const layout = layoutTree(tree, 0, PAD, 0, expandedNodes);
    const nodes = collectAllNodes(layout);
    const bounds = computeBounds(nodes);

    const w = bounds.maxX - bounds.minX + PAD * 2;
    const h = bounds.maxY - bounds.minY + PAD * 2;
    const ox = -bounds.minX + PAD;
    const oy = -bounds.minY + PAD;

    return {
      allNodes: nodes,
      svgWidth: Math.max(w, 800),
      svgHeight: Math.max(h, 400),
      offsetX: ox,
      offsetY: oy,
    };
  }, [tree, expandedNodes]);

  // Zoom controls
  const zoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.5));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.3));
  const zoomReset = () => setZoom(1);

  // Copy text
  const handleCopy = useCallback(() => {
    const text = treeToText(tree);
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: create a temporary textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }, [tree]);

  // Download text
  const handleDownloadText = useCallback(() => {
    const text = treeToText(tree);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vzy-report-mindmap-${report.scanId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tree, report.scanId]);

  // Download PNG
  const handleDownloadPng = useCallback(async () => {
    if (!svgWrapperRef.current) return;
    try {
      const canvas = await html2canvas(svgWrapperRef.current, {
        backgroundColor: "#0B0E14",
        logging: false,
      } as Parameters<typeof html2canvas>[1]);
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `vzy-report-mindmap-${report.scanId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Silently fail -- html2canvas may not work in all environments
    }
  }, [report.scanId]);

  // Expand all / collapse all
  const expandAll = useCallback(() => {
    const ids = new Set<string>();
    const walk = (node: TreeNode) => {
      ids.add(node.id);
      node.children.forEach(walk);
    };
    walk(tree);
    setExpandedNodes(ids);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set(["root"]));
  }, []);

  // Find original tree node (to know if it has children for interaction)
  const findTreeNode = useCallback(
    (id: string, node: TreeNode = tree): TreeNode | null => {
      if (node.id === id) return node;
      for (const c of node.children) {
        const found = findTreeNode(id, c);
        if (found) return found;
      }
      return null;
    },
    [tree],
  );

  return (
    <div ref={containerRef} className="relative w-full rounded-xl border border-white/[0.06] bg-[#0B0E14]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200 mr-2">Mind Map</h3>
          <button
            onClick={expandAll}
            className="px-2.5 py-1 text-[11px] font-medium text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors"
            title="Expand all nodes"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 text-[11px] font-medium text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors"
            title="Collapse all nodes"
          >
            Collapse All
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] rounded-md overflow-hidden">
            <button
              onClick={zoomOut}
              className="px-2 py-1 text-xs text-gray-400 hover:bg-white/[0.06] transition-colors"
              title="Zoom out"
            >
              -
            </button>
            <button
              onClick={zoomReset}
              className="px-2 py-1 text-[10px] text-gray-500 hover:bg-white/[0.06] transition-colors tabular-nums"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              className="px-2 py-1 text-xs text-gray-400 hover:bg-white/[0.06] transition-colors"
              title="Zoom in"
            >
              +
            </button>
          </div>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 text-[11px] font-medium text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors"
            title="Copy mind map as text"
          >
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </span>
          </button>

          {/* Download Text */}
          <button
            onClick={handleDownloadText}
            className="px-2.5 py-1 text-[11px] font-medium text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors"
            title="Download as text file"
          >
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              TXT
            </span>
          </button>

          {/* Download PNG */}
          <button
            onClick={handleDownloadPng}
            className="px-2.5 py-1 text-[11px] font-medium text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors"
            title="Download as PNG image"
          >
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              PNG
            </span>
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-b border-white/[0.06]">
        {(
          [
            { cat: "executive", label: "Executive" },
            { cat: "security", label: "Security" },
            { cat: "performance", label: "Performance" },
            { cat: "code-quality", label: "Code Quality" },
            { cat: "recommendations", label: "Recommendations" },
          ] as const
        ).map(({ cat, label }) => (
          <div key={cat} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            />
            {label}
          </div>
        ))}
        <div className="ml-auto text-[10px] text-gray-600">Click a node to expand or collapse</div>
      </div>

      {/* SVG Canvas */}
      <div
        className="overflow-auto"
        style={{ maxHeight: "70vh" }}
      >
        <div
          ref={svgWrapperRef}
          style={{
            width: svgWidth * zoom,
            height: svgHeight * zoom,
            minWidth: "100%",
            background: "#0B0E14",
          }}
        >
          <svg
            width={svgWidth * zoom}
            height={svgHeight * zoom}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            xmlns="http://www.w3.org/2000/svg"
            style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
          >
            {/* Translate all content by offset so nodes are visible */}
            <g transform={`translate(${offsetX}, ${offsetY})`}>
              {/* Draw connections first (behind nodes) */}
              {allNodes
                .filter((n) => n.parentX !== undefined)
                .map((n) => (
                  <ConnectionPath key={`conn-${n.id}`} child={n} />
                ))}

              {/* Draw nodes on top */}
              {allNodes.map((n) => {
                const treeNode = findTreeNode(n.id);
                const hasChildren = (treeNode?.children.length ?? 0) > 0;
                const isExpanded = expandedNodes.has(n.id);

                return (
                  <MindMapNode
                    key={n.id}
                    node={n}
                    expanded={isExpanded}
                    hasChildren={hasChildren}
                    onToggle={handleToggle}
                  />
                );
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
