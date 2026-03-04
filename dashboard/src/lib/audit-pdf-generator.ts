// ============================================================================
// Technical Performance Audit PDF Generator
// Generates a professional 6-section performance audit document
// ============================================================================

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ScanReport,
  Finding,
  EnhancedRecommendation,
  SecurityMetadata,
  PerformanceMetadata,
} from "@/types/api";

// -- Color Palette (matches existing pdf-generator.ts) --
const COLORS = {
  primary: [37, 99, 235] as [number, number, number],
  primaryLight: [219, 234, 254] as [number, number, number],
  dark: [17, 24, 39] as [number, number, number],
  text: [31, 41, 55] as [number, number, number],
  textLight: [107, 114, 128] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  greenLight: [220, 252, 231] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  amberLight: [254, 243, 199] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  redLight: [254, 226, 226] as [number, number, number],
  purple: [147, 51, 234] as [number, number, number],
  purpleLight: [243, 232, 255] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  bg: [249, 250, 251] as [number, number, number],
  surface: [243, 244, 246] as [number, number, number],
};

function getScoreColor(score: number): [number, number, number] {
  if (score >= 90) return COLORS.green;
  if (score >= 70) return COLORS.amber;
  return COLORS.red;
}

function getScoreBgColor(score: number): [number, number, number] {
  if (score >= 90) return COLORS.greenLight;
  if (score >= 70) return COLORS.amberLight;
  return COLORS.redLight;
}

function getRatingColor(rating: string): [number, number, number] {
  switch (rating) {
    case "good":
      return COLORS.green;
    case "needs-improvement":
      return COLORS.amber;
    case "poor":
      return COLORS.red;
    default:
      return COLORS.textLight;
  }
}

function getRatingLabel(rating: string): string {
  switch (rating) {
    case "good":
      return "GOOD";
    case "needs-improvement":
      return "NEEDS IMPROVEMENT";
    case "poor":
      return "CRITICAL";
    default:
      return "N/A";
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(0)} ms`;
}

// ============================================================================
// PDFBuilder - Reused from existing pdf-generator.ts pattern
// ============================================================================

class PDFBuilder {
  doc: jsPDF;
  y: number = 0;
  pageWidth: number;
  pageHeight: number;
  margin: number = 20;
  contentWidth: number;
  pageNum: number = 1;
  reportTitle: string;
  reportSubtitle: string;

  constructor(title: string, subtitle: string) {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - 2 * this.margin;
    this.reportTitle = title;
    this.reportSubtitle = subtitle;
  }

  checkPage(needed: number = 20) {
    if (this.y + needed > this.pageHeight - 25) {
      this.doc.addPage();
      this.pageNum++;
      this.y = 20;
      this.addFooter();
    }
  }

  addCoverPage(report: ScanReport) {
    const doc = this.doc;
    const pw = this.pageWidth;
    const ph = this.pageHeight;

    // Top gradient bar
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pw, 60, "F");

    // Accent stripe
    doc.setFillColor(29, 78, 216);
    doc.rect(0, 55, pw, 8, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...COLORS.white);
    doc.text("VZY OTT Verification Agent", pw / 2, 28, { align: "center" });

    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text(this.reportTitle, pw / 2, 40, { align: "center" });

    doc.setFontSize(10);
    doc.text(this.reportSubtitle, pw / 2, 50, { align: "center" });

    // Score circle
    const circleY = 110;
    const score = report.kpiScore.overallScore;
    const scoreColor = getScoreColor(score);

    doc.setFillColor(...getScoreBgColor(score));
    doc.circle(pw / 2, circleY, 28, "F");
    doc.setDrawColor(...scoreColor);
    doc.setLineWidth(2);
    doc.circle(pw / 2, circleY, 28, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(32);
    doc.setTextColor(...scoreColor);
    doc.text(score.toFixed(1), pw / 2, circleY + 4, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textLight);
    doc.text("/ 100 Overall KPI", pw / 2, circleY + 14, { align: "center" });

    // Pass/Fail badge
    const passText = report.kpiScore.passesThreshold ? "PASS" : "FAIL";
    const passBg = report.kpiScore.passesThreshold
      ? COLORS.greenLight
      : COLORS.redLight;
    const passColor = report.kpiScore.passesThreshold
      ? COLORS.green
      : COLORS.red;

    doc.setFillColor(...passBg);
    doc.roundedRect(pw / 2 - 12, circleY + 20, 24, 8, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...passColor);
    doc.text(passText, pw / 2, circleY + 25.5, { align: "center" });

    // Category scores
    const categories = [
      {
        label: "Security",
        score: report.kpiScore.grades.security.rawScore,
        weight: "40%",
      },
      {
        label: "Performance",
        score: report.kpiScore.grades.performance.rawScore,
        weight: "35%",
      },
      {
        label: "Code Quality",
        score: report.kpiScore.grades.codeQuality.rawScore,
        weight: "25%",
      },
    ];

    const cardY = circleY + 45;
    const cardW = 50;
    const gap = (this.contentWidth - 3 * cardW) / 2;

    categories.forEach((cat, i) => {
      const x = this.margin + i * (cardW + gap);
      const sc = getScoreColor(cat.score);

      doc.setFillColor(...COLORS.white);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, cardY, cardW, 30, 3, 3, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.textLight);
      doc.text(`${cat.label} (${cat.weight})`, x + cardW / 2, cardY + 10, {
        align: "center",
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(...sc);
      doc.text(cat.score.toFixed(1), x + cardW / 2, cardY + 23, {
        align: "center",
      });
    });

    // Report metadata
    const metaY = cardY + 45;
    doc.setFillColor(...COLORS.surface);
    doc.roundedRect(this.margin, metaY, this.contentWidth, 35, 3, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textLight);

    const meta = [
      ["Scan ID:", report.scanId],
      ["Target:", report.target.url || report.target.repoPath || "N/A"],
      ["Platform:", report.platform],
      ["Generated:", new Date(report.generatedAt).toLocaleString()],
    ];

    meta.forEach(([label, value], i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const x = this.margin + 8 + col * (this.contentWidth / 2);
      const yPos = metaY + 10 + row * 12;

      doc.setFont("helvetica", "bold");
      doc.text(label, x, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(String(value).substring(0, 50), x + 25, yPos);
    });

    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textLight);
    doc.text(
      "Confidential - DishTV/Watcho OTT Platform Analysis",
      pw / 2,
      ph - 15,
      { align: "center" }
    );
    doc.text(
      `Generated by VZY Agent on ${new Date().toLocaleDateString()}`,
      pw / 2,
      ph - 10,
      { align: "center" }
    );

    this.addFooter();
  }

  addFooter() {
    const doc = this.doc;
    const pw = this.pageWidth;
    const ph = this.pageHeight;

    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(this.margin, ph - 12, pw - this.margin, ph - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLight);
    doc.text(
      "VZY OTT Verification Agent | Confidential",
      this.margin,
      ph - 8
    );
    doc.text(`Page ${this.pageNum}`, pw - this.margin, ph - 8, {
      align: "right",
    });
  }

  addSectionHeader(
    title: string,
    color: [number, number, number] = COLORS.primary
  ) {
    this.checkPage(15);

    this.doc.setFillColor(...color);
    this.doc.roundedRect(this.margin, this.y, this.contentWidth, 10, 2, 2, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...COLORS.white);
    this.doc.text(title, this.margin + 5, this.y + 7);

    this.y += 15;
  }

  addSubHeader(title: string) {
    this.checkPage(12);

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.setTextColor(...COLORS.dark);
    this.doc.text(title, this.margin, this.y + 5);

    this.doc.setDrawColor(...COLORS.primary);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, this.y + 7, this.margin + 40, this.y + 7);

    this.y += 12;
  }

  addParagraph(text: string, fontSize: number = 9) {
    this.checkPage(10);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(fontSize);
    this.doc.setTextColor(...COLORS.text);

    const lines = this.doc.splitTextToSize(text, this.contentWidth);
    const lineHeight = fontSize * 0.45;

    for (const line of lines) {
      this.checkPage(lineHeight + 1);
      this.doc.text(line, this.margin, this.y);
      this.y += lineHeight;
    }
    this.y += 3;
  }

  addBulletPoint(text: string, fontSize: number = 8.5) {
    this.checkPage(8);

    const wrappedLines = this.doc.splitTextToSize(
      text,
      this.contentWidth - 10
    );

    this.doc.setFillColor(...COLORS.primary);
    this.doc.circle(this.margin + 3, this.y + 1.5, 1, "F");

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(fontSize);
    this.doc.setTextColor(...COLORS.text);

    wrappedLines.forEach((wl: string) => {
      this.checkPage(5);
      this.doc.text(wl, this.margin + 7, this.y + 3);
      this.y += 4;
    });
    this.y += 1;
  }

  addNumberedItem(num: number, text: string, fontSize: number = 8.5) {
    this.checkPage(8);

    const wrappedLines = this.doc.splitTextToSize(
      text,
      this.contentWidth - 12
    );

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(fontSize);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.text(`${num}.`, this.margin + 2, this.y + 3);

    this.doc.setFont("helvetica", "normal");
    this.doc.setTextColor(...COLORS.text);

    wrappedLines.forEach((wl: string) => {
      this.checkPage(5);
      this.doc.text(wl, this.margin + 9, this.y + 3);
      this.y += 4;
    });
    this.y += 1;
  }

  addTable(headers: string[], rows: string[][], options?: any) {
    this.checkPage(20);

    autoTable(this.doc, {
      startY: this.y,
      head: [headers],
      body: rows,
      margin: { left: this.margin, right: this.margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: COLORS.text,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: COLORS.bg,
      },
      columnStyles: options?.columnStyles,
      ...options,
    });

    this.y = (this.doc as any).lastAutoTable.finalY + 8;
  }

  addMetricCard(
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    color?: [number, number, number]
  ) {
    const doc = this.doc;
    doc.setFillColor(...COLORS.white);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, width, 22, 2, 2, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textLight);
    doc.text(label, x + width / 2, y + 7, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...(color || COLORS.dark));
    doc.text(value, x + width / 2, y + 17, { align: "center" });
  }

  addMarkdownContent(content: string) {
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        this.y += 3;
        continue;
      }

      this.checkPage(8);

      if (trimmed.startsWith("### ")) {
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(10);
        this.doc.setTextColor(...COLORS.dark);
        this.doc.text(trimmed.replace("### ", ""), this.margin + 2, this.y + 4);
        this.y += 8;
      } else if (trimmed.startsWith("## ")) {
        this.y += 2;
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(11);
        this.doc.setTextColor(...COLORS.primary);
        this.doc.text(trimmed.replace("## ", ""), this.margin, this.y + 4);
        this.doc.setDrawColor(...COLORS.primary);
        this.doc.setLineWidth(0.4);
        this.doc.line(this.margin, this.y + 6, this.margin + 50, this.y + 6);
        this.y += 10;
      } else if (trimmed.startsWith("# ")) {
        this.y += 3;
        this.addSectionHeader(trimmed.replace("# ", ""));
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const text = trimmed
          .replace(/^[-*] /, "")
          .replace(/\*\*(.+?)\*\*/g, "$1");
        this.addBulletPoint(text);
      } else if (/^\d+\.\s/.test(trimmed)) {
        const text = trimmed.replace(/\*\*(.+?)\*\*/g, "$1");
        const wrappedLines = this.doc.splitTextToSize(
          text,
          this.contentWidth - 10
        );
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(8.5);
        this.doc.setTextColor(...COLORS.text);
        wrappedLines.forEach((wl: string) => {
          this.checkPage(5);
          this.doc.text(wl, this.margin + 5, this.y + 3);
          this.y += 4;
        });
        this.y += 1;
      } else {
        const text = trimmed
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/`([^`]+)`/g, "$1");
        this.addParagraph(text, 8.5);
      }
    }
  }

  save(filename: string) {
    this.doc.save(filename);
  }
}

// ============================================================================
// Helper: Extract agent metadata from report
// ============================================================================

function getPerformanceMetadata(
  report: ScanReport
): PerformanceMetadata | null {
  const agent = report.agentResults.find(
    (a) => a.agentType === "performance"
  );
  return (agent?.metadata as PerformanceMetadata) ?? null;
}

function getSecurityMetadata(report: ScanReport): SecurityMetadata | null {
  const agent = report.agentResults.find((a) => a.agentType === "security");
  return (agent?.metadata as SecurityMetadata) ?? null;
}

function getCWVValue(
  cwv: Record<string, { value: number; rating: "good" | "needs-improvement" | "poor" }>,
  key: string
): { value: number; rating: string } | null {
  if (cwv && cwv[key]) return cwv[key];
  return null;
}

function formatCWVMetric(
  metric: { value: number; rating: string } | null,
  unit: string
): string {
  if (!metric) return "N/A";
  if (unit === "s") return `${(metric.value / 1000).toFixed(2)} s`;
  if (unit === "ms") return `${metric.value.toFixed(0)} ms`;
  if (unit === "") return metric.value.toFixed(3);
  return `${metric.value} ${unit}`;
}

function getStatusLabel(score: number, threshold: number): string {
  if (score >= threshold) return "PASS";
  if (score >= threshold * 0.7) return "NEEDS IMPROVEMENT";
  return "CRITICAL";
}

// ============================================================================
// Section 1: Baseline Performance KPI & Metric Evaluation
// ============================================================================

function buildSection1(pdf: PDFBuilder, report: ScanReport) {
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader(
    "Section 1: Baseline Performance KPI & Metric Evaluation"
  );

  const perfMeta = getPerformanceMetadata(report);
  const overallScore = report.kpiScore.overallScore;
  const perfRaw = report.kpiScore.grades.performance.rawScore;

  // Opening paragraph
  pdf.addParagraph(
    `Performance is a cornerstone of user experience for OTT streaming platforms. ` +
      `Suboptimal load times, unresponsive interfaces, and resource-heavy page construction ` +
      `directly erode viewer retention and degrade content discoverability. The VZY OTT platform ` +
      `currently records an overall KPI score of ${overallScore.toFixed(1)} against a target threshold ` +
      `of 95.0. This section evaluates the individual Lighthouse audit categories and their ` +
      `weighted contribution to the composite score.`
  );

  pdf.y += 2;

  // Build the metrics table
  const lighthouse = perfMeta?.lighthouse;
  const perfScore = lighthouse?.performanceScore ?? 0;
  const a11yScore = lighthouse?.accessibilityScore ?? 0;
  const bpScore = lighthouse?.bestPracticesScore ?? 0;
  const seoScore = lighthouse?.seoScore ?? 0;

  const rows: string[][] = [
    [
      "Lighthouse Performance",
      `${perfScore.toFixed(1)}`,
      ">= 90",
      getStatusLabel(perfScore, 90),
    ],
    [
      "Accessibility",
      `${a11yScore.toFixed(1)}`,
      ">= 90",
      getStatusLabel(a11yScore, 90),
    ],
    [
      "Best Practices",
      `${bpScore.toFixed(1)}`,
      ">= 90",
      getStatusLabel(bpScore, 90),
    ],
    ["SEO", `${seoScore.toFixed(1)}`, ">= 90", getStatusLabel(seoScore, 90)],
    [
      "Overall KPI Score",
      `${overallScore.toFixed(1)}`,
      ">= 95",
      overallScore >= 95 ? "PASS" : "FAIL",
    ],
  ];

  pdf.addTable(
    ["Metric Category", "Current Value", "Target Threshold", "Status"],
    rows,
    {
      columnStyles: {
        0: { cellWidth: 50 },
        3: { cellWidth: 35, halign: "center" as const },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 3) {
          const val = data.cell.raw as string;
          if (val === "PASS") {
            data.cell.styles.textColor = COLORS.green;
            data.cell.styles.fontStyle = "bold";
          } else if (val === "CRITICAL" || val === "FAIL") {
            data.cell.styles.textColor = COLORS.red;
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = COLORS.amber;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    }
  );

  // Analytical paragraph
  const secWeight = report.kpiScore.grades.security.weightedScore;
  const perfWeight = report.kpiScore.grades.performance.weightedScore;
  const cqWeight = report.kpiScore.grades.codeQuality.weightedScore;

  const lowestCategory =
    perfRaw <= report.kpiScore.grades.security.rawScore &&
    perfRaw <= report.kpiScore.grades.codeQuality.rawScore
      ? "Performance"
      : report.kpiScore.grades.security.rawScore <=
          report.kpiScore.grades.codeQuality.rawScore
        ? "Security"
        : "Code Quality";

  const gap = 95 - overallScore;

  pdf.addParagraph(
    `The composite KPI score is computed using a weighted formula: Security (40%) contributes ` +
      `${secWeight.toFixed(1)} points, Performance (35%) contributes ${perfWeight.toFixed(1)} points, ` +
      `and Code Quality (25%) contributes ${cqWeight.toFixed(1)} points. The current aggregate of ` +
      `${overallScore.toFixed(1)} falls ${gap > 0 ? gap.toFixed(1) + " points short of" : "at or above"} ` +
      `the 95-point target. The ${lowestCategory} category is the primary factor suppressing the ` +
      `overall score. A Lighthouse performance score of ${perfScore.toFixed(1)} indicates ` +
      `${perfScore < 50 ? "severe" : perfScore < 70 ? "moderate" : "minor"} rendering and loading ` +
      `deficiencies that must be addressed to achieve the target KPI.`
  );

  if (lighthouse?.estimated) {
    pdf.addParagraph(
      `Note: The Lighthouse scores reported above were generated using conservative estimation ` +
        `due to an accessibility constraint during the scan. Actual production values may differ ` +
        `and should be validated with a full Lighthouse audit.`,
      8
    );
  }
}

// ============================================================================
// Section 2: Core Web Vitals Diagnostic - Desktop vs. Mobile
// ============================================================================

function buildSection2(pdf: PDFBuilder, report: ScanReport) {
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader(
    "Section 2: Core Web Vitals (CWV) Diagnostic: Desktop vs. Mobile"
  );

  const perfMeta = getPerformanceMetadata(report);
  const cwv = perfMeta?.coreWebVitals ?? {};

  pdf.addParagraph(
    `Core Web Vitals are the industry-standard metrics that Google uses to evaluate real-world ` +
      `user experience. For an OTT platform, these vitals directly impact search ranking, viewer ` +
      `acquisition, and session duration. This section presents a side-by-side comparison of ` +
      `desktop and mobile CWV readings, identifying the specific metrics that require remediation.`
  );

  pdf.y += 2;

  // CWV metric definitions with units
  const cwvMetrics = [
    { key: "TTFB", label: "Time to First Byte (TTFB)", unit: "ms" },
    { key: "LCP", label: "Largest Contentful Paint (LCP)", unit: "s" },
    { key: "CLS", label: "Cumulative Layout Shift (CLS)", unit: "" },
    { key: "FCP", label: "First Contentful Paint (FCP)", unit: "s" },
    { key: "TTI", label: "Time to Interactive (TTI)", unit: "s" },
    { key: "SI", label: "Speed Index (SI)", unit: "s" },
  ];

  const rows: string[][] = cwvMetrics.map((m) => {
    const desktop = getCWVValue(cwv, m.key);
    const mobile = getCWVValue(cwv, `${m.key}_MOBILE`);

    const desktopVal = formatCWVMetric(desktop, m.unit);
    const mobileVal = formatCWVMetric(mobile, m.unit);

    const desktopRating = desktop ? getRatingLabel(desktop.rating) : "N/A";
    const mobileRating = mobile ? getRatingLabel(mobile.rating) : "N/A";

    return [m.label, desktopVal, desktopRating, mobileVal, mobileRating];
  });

  pdf.addTable(
    [
      "Metric",
      "Desktop Value",
      "Desktop Rating",
      "Mobile Value",
      "Mobile Rating",
    ],
    rows,
    {
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 28, halign: "center" as const },
        2: { cellWidth: 32, halign: "center" as const },
        3: { cellWidth: 28, halign: "center" as const },
        4: { cellWidth: 32, halign: "center" as const },
      },
      didParseCell: (data: any) => {
        if (
          data.section === "body" &&
          (data.column.index === 2 || data.column.index === 4)
        ) {
          const val = data.cell.raw as string;
          if (val === "GOOD") {
            data.cell.styles.textColor = COLORS.green;
            data.cell.styles.fontStyle = "bold";
          } else if (val === "CRITICAL") {
            data.cell.styles.textColor = COLORS.red;
            data.cell.styles.fontStyle = "bold";
          } else if (val === "NEEDS IMPROVEMENT") {
            data.cell.styles.textColor = COLORS.amber;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    }
  );

  // Analysis paragraph - identify critical metrics
  const criticalDesktop = cwvMetrics.filter((m) => {
    const d = getCWVValue(cwv, m.key);
    return d && d.rating === "poor";
  });

  const criticalMobile = cwvMetrics.filter((m) => {
    const d = getCWVValue(cwv, `${m.key}_MOBILE`);
    return d && d.rating === "poor";
  });

  const needsImprovementDesktop = cwvMetrics.filter((m) => {
    const d = getCWVValue(cwv, m.key);
    return d && d.rating === "needs-improvement";
  });

  const hasMobileData = cwvMetrics.some((m) =>
    getCWVValue(cwv, `${m.key}_MOBILE`)
  );

  if (criticalDesktop.length > 0 || criticalMobile.length > 0) {
    const critDesktopLabels = criticalDesktop.map((m) => m.label).join(", ");
    const critMobileLabels = criticalMobile.map((m) => m.label).join(", ");

    pdf.addParagraph(
      `Critical-rated metrics require immediate attention. ` +
        `${criticalDesktop.length > 0 ? `On desktop, the following metrics are rated CRITICAL: ${critDesktopLabels}. ` : ""}` +
        `${criticalMobile.length > 0 ? `On mobile, the following metrics are rated CRITICAL: ${critMobileLabels}. ` : ""}` +
        `These values indicate a degraded experience that is likely to result in increased bounce rates ` +
        `and reduced search engine visibility.`
    );
  }

  if (needsImprovementDesktop.length > 0) {
    pdf.addParagraph(
      `Additionally, ${needsImprovementDesktop.length} desktop metric(s) are rated NEEDS IMPROVEMENT: ` +
        `${needsImprovementDesktop.map((m) => m.label).join(", ")}. These should be targeted in the ` +
        `medium-term optimization roadmap.`
    );
  }

  if (!hasMobileData) {
    pdf.addParagraph(
      `Mobile-specific CWV data was not available for this scan. It is strongly recommended ` +
        `that a dedicated mobile audit be conducted, as mobile users typically constitute the ` +
        `majority of OTT platform traffic and are more susceptible to performance regressions.`,
      8
    );
  } else {
    // Delta analysis
    const lcpDesktop = getCWVValue(cwv, "LCP");
    const lcpMobile = getCWVValue(cwv, "LCP_MOBILE");
    if (lcpDesktop && lcpMobile) {
      const delta = lcpMobile.value - lcpDesktop.value;
      if (delta > 0) {
        pdf.addParagraph(
          `The LCP delta between desktop and mobile is ${formatMs(Math.abs(delta))} slower on mobile. ` +
            `This gap suggests that image optimization, lazy loading strategies, or server-side rendering ` +
            `adaptations are not adequately tailored for mobile network conditions and device capabilities.`
        );
      }
    }
  }
}

// ============================================================================
// Section 3: Resource Analysis and Payload Optimization
// ============================================================================

function buildSection3(pdf: PDFBuilder, report: ScanReport) {
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader(
    "Section 3: Resource Analysis and Payload Optimization"
  );

  const perfMeta = getPerformanceMetadata(report);
  const resources = perfMeta?.resourceMetrics;

  pdf.addParagraph(
    `Page weight and resource composition are fundamental determinants of load performance. ` +
      `Excessive JavaScript payloads, unoptimized images, and uncompressed assets directly ` +
      `inflate Time to Interactive and degrade the perceived responsiveness of the application. ` +
      `This section breaks down the resource profile of the scanned target and identifies the ` +
      `highest-impact optimization opportunities.`
  );

  pdf.y += 2;

  if (resources) {
    // Resource breakdown table
    const totalSize = resources.totalSize || 0;
    const jsPercent =
      totalSize > 0
        ? ((resources.jsSize / totalSize) * 100).toFixed(1)
        : "0.0";
    const cssPercent =
      totalSize > 0
        ? ((resources.cssSize / totalSize) * 100).toFixed(1)
        : "0.0";
    const imgPercent =
      totalSize > 0
        ? ((resources.imageSize / totalSize) * 100).toFixed(1)
        : "0.0";
    const fontPercent =
      totalSize > 0
        ? ((resources.fontSize / totalSize) * 100).toFixed(1)
        : "0.0";
    const tpPercent =
      totalSize > 0
        ? ((resources.thirdPartySize / totalSize) * 100).toFixed(1)
        : "0.0";

    const resourceRows: string[][] = [
      [
        "JavaScript",
        formatBytes(resources.jsSize),
        `${jsPercent}%`,
        resources.jsSize > 500000 ? "CRITICAL" : resources.jsSize > 200000 ? "NEEDS REVIEW" : "OK",
      ],
      [
        "CSS",
        formatBytes(resources.cssSize),
        `${cssPercent}%`,
        resources.cssSize > 200000 ? "NEEDS REVIEW" : "OK",
      ],
      [
        "Images",
        formatBytes(resources.imageSize),
        `${imgPercent}%`,
        resources.imageSize > 1000000 ? "CRITICAL" : resources.imageSize > 500000 ? "NEEDS REVIEW" : "OK",
      ],
      [
        "Fonts",
        formatBytes(resources.fontSize),
        `${fontPercent}%`,
        resources.fontSize > 300000 ? "NEEDS REVIEW" : "OK",
      ],
      [
        "Third-Party Scripts",
        formatBytes(resources.thirdPartySize),
        `${tpPercent}%`,
        resources.thirdPartySize > 300000 ? "CRITICAL" : resources.thirdPartySize > 150000 ? "NEEDS REVIEW" : "OK",
      ],
      ["Total Page Weight", formatBytes(totalSize), "100%", ""],
    ];

    pdf.addTable(
      ["Resource Type", "Size", "% of Total", "Assessment"],
      resourceRows,
      {
        columnStyles: {
          0: { cellWidth: 42 },
          1: { cellWidth: 30, halign: "right" as const },
          2: { cellWidth: 25, halign: "center" as const },
          3: { cellWidth: 32, halign: "center" as const },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 3) {
            const val = data.cell.raw as string;
            if (val === "OK") {
              data.cell.styles.textColor = COLORS.green;
              data.cell.styles.fontStyle = "bold";
            } else if (val === "CRITICAL") {
              data.cell.styles.textColor = COLORS.red;
              data.cell.styles.fontStyle = "bold";
            } else if (val === "NEEDS REVIEW") {
              data.cell.styles.textColor = COLORS.amber;
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      }
    );

    // Additional metadata
    pdf.addSubHeader("Request Profile");
    pdf.addParagraph(
      `Total HTTP requests: ${resources.requestCount}. ` +
        `Uncompressed assets detected: ${resources.uncompressedAssets?.length ?? 0}. ` +
        `Render-blocking resources: ${resources.renderBlockingResources?.length ?? 0}.`
    );

    // Opportunities
    pdf.y += 2;
    pdf.addSubHeader("Top Opportunities for Optimization");

    if (resources.jsSize > 200000) {
      pdf.addBulletPoint(
        `JavaScript payload (${formatBytes(resources.jsSize)}) exceeds recommended threshold. ` +
          `Implement code splitting, tree-shaking, and deferred loading for non-critical bundles.`
      );
    }

    if (resources.thirdPartySize > 150000) {
      pdf.addBulletPoint(
        `Third-party scripts (${formatBytes(resources.thirdPartySize)}) represent ${tpPercent}% of ` +
          `total page weight. Audit each script for necessity, defer non-essential analytics, ` +
          `and consider self-hosting critical dependencies.`
      );
    }

    if (resources.imageSize > 500000) {
      pdf.addBulletPoint(
        `Image assets (${formatBytes(resources.imageSize)}) are a significant contributor to page weight. ` +
          `Convert to WebP/AVIF formats, implement responsive srcset attributes, and enable ` +
          `lazy loading for below-the-fold content.`
      );
    }

    if (
      resources.uncompressedAssets &&
      resources.uncompressedAssets.length > 0
    ) {
      pdf.addBulletPoint(
        `${resources.uncompressedAssets.length} asset(s) are served without compression. ` +
          `Enable Brotli or Gzip compression at the server/CDN level to reduce transfer sizes ` +
          `by an estimated 60-80%.`
      );
    }

    if (
      resources.renderBlockingResources &&
      resources.renderBlockingResources.length > 0
    ) {
      pdf.addBulletPoint(
        `${resources.renderBlockingResources.length} render-blocking resource(s) detected. ` +
          `Inline critical CSS, defer non-essential stylesheets, and add async/defer attributes ` +
          `to script tags that do not affect above-the-fold content.`
      );
    }

    if (resources.jsSize <= 200000 && resources.thirdPartySize <= 150000 && resources.imageSize <= 500000) {
      pdf.addBulletPoint(
        `Resource sizes are within acceptable thresholds. Continue monitoring payload sizes ` +
          `as new features are deployed to prevent regressions.`
      );
    }

    // JS analysis paragraph
    pdf.y += 2;
    pdf.addParagraph(
      `JavaScript execution is the single largest contributor to Time to Interactive on modern ` +
        `web applications. The current JS payload of ${formatBytes(resources.jsSize)} requires ` +
        `parsing, compilation, and execution before the page becomes fully interactive. ` +
        `Third-party scripts add an additional ${formatBytes(resources.thirdPartySize)} of payload, ` +
        `often executing synchronously and blocking the main thread. Reducing the combined ` +
        `script footprint through bundle analysis and selective loading is the most impactful ` +
        `single optimization available.`
    );
  } else {
    pdf.addParagraph(
      `Resource metrics were not available for this scan. This may indicate that the ` +
        `performance agent was unable to complete resource analysis. A rescan is recommended ` +
        `to capture full payload data.`
    );
  }
}

// ============================================================================
// Section 4: Infrastructure & Delivery Analysis: CDN and Server Response
// ============================================================================

function buildSection4(pdf: PDFBuilder, report: ScanReport) {
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader(
    "Section 4: Infrastructure & Delivery Analysis: CDN and Server Response"
  );

  const perfMeta = getPerformanceMetadata(report);
  const secMeta = getSecurityMetadata(report);
  const cdn = perfMeta?.cdnMetrics;

  pdf.addParagraph(
    `Content delivery infrastructure underpins every aspect of OTT platform performance. ` +
      `CDN hit ratios, edge server latency, and cache policy configuration determine whether ` +
      `users experience sub-second page loads or endure multi-second delays. This section ` +
      `evaluates the CDN and server response characteristics observed during the scan.`
  );

  pdf.y += 2;

  if (cdn) {
    // CDN metrics table
    const cdnRows: string[][] = [
      [
        "Cache Hit Ratio",
        `${(cdn.hitRatio * 100).toFixed(1)}%`,
        ">= 90%",
        cdn.hitRatio >= 0.9
          ? "GOOD"
          : cdn.hitRatio >= 0.7
            ? "NEEDS IMPROVEMENT"
            : "CRITICAL",
      ],
      [
        "Average Latency",
        `${cdn.avgLatency.toFixed(0)} ms`,
        "<= 100 ms",
        cdn.avgLatency <= 100
          ? "GOOD"
          : cdn.avgLatency <= 300
            ? "NEEDS IMPROVEMENT"
            : "CRITICAL",
      ],
      [
        "P95 Latency",
        `${cdn.p95Latency.toFixed(0)} ms`,
        "<= 500 ms",
        cdn.p95Latency <= 500
          ? "GOOD"
          : cdn.p95Latency <= 1000
            ? "NEEDS IMPROVEMENT"
            : "CRITICAL",
      ],
      [
        "Edge Locations",
        `${cdn.edgeLocations?.length ?? 0} detected`,
        ">= 3",
        (cdn.edgeLocations?.length ?? 0) >= 3 ? "GOOD" : "NEEDS IMPROVEMENT",
      ],
      [
        "Cache Headers Present",
        cdn.cacheHeaders ? "Yes" : "No",
        "Yes",
        cdn.cacheHeaders ? "GOOD" : "CRITICAL",
      ],
      [
        "Compression Enabled",
        cdn.compressionEnabled ? "Yes" : "No",
        "Yes",
        cdn.compressionEnabled ? "GOOD" : "CRITICAL",
      ],
    ];

    pdf.addTable(
      ["CDN Metric", "Observed Value", "Target", "Rating"],
      cdnRows,
      {
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 35, halign: "center" as const },
          2: { cellWidth: 30, halign: "center" as const },
          3: { cellWidth: 35, halign: "center" as const },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 3) {
            const val = data.cell.raw as string;
            if (val === "GOOD") {
              data.cell.styles.textColor = COLORS.green;
              data.cell.styles.fontStyle = "bold";
            } else if (val === "CRITICAL") {
              data.cell.styles.textColor = COLORS.red;
              data.cell.styles.fontStyle = "bold";
            } else if (val === "NEEDS IMPROVEMENT") {
              data.cell.styles.textColor = COLORS.amber;
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      }
    );
  } else {
    pdf.addParagraph(
      `CDN metrics were not captured during this scan. The platform should ensure that ` +
        `a CDN is properly configured and that cache headers are present on all static assets.`
    );
  }

  // Security header analysis
  pdf.y += 2;
  pdf.addSubHeader("Cache-Control & Server Header Analysis");

  if (secMeta?.headerAnalysis) {
    const headerScore = secMeta.headerAnalysis.score;
    pdf.addParagraph(
      `The security header analysis yielded a score of ${headerScore.toFixed(0)}/100. ` +
        `${secMeta.headerAnalysis.missing.length} critical header(s) are absent from the ` +
        `server response, and ${secMeta.headerAnalysis.misconfigured.length} header(s) are ` +
        `misconfigured.`
    );

    if (secMeta.headerAnalysis.missing.length > 0) {
      pdf.addParagraph(
        `Missing headers: ${secMeta.headerAnalysis.missing.join(", ")}`,
        8
      );
    }

    if (secMeta.headerAnalysis.misconfigured.length > 0) {
      secMeta.headerAnalysis.misconfigured.forEach((mc) => {
        pdf.addBulletPoint(`${mc.header}: ${mc.issue}`);
      });
    }
  }

  // Technical directives
  pdf.y += 2;
  pdf.addSubHeader("Technical Directives");

  const directives: string[] = [];

  if (cdn && cdn.hitRatio < 0.9) {
    directives.push(
      `Increase CDN cache hit ratio from ${(cdn.hitRatio * 100).toFixed(1)}% to >= 90% by ` +
        `reviewing cache key configuration, extending TTL for static assets, and ensuring ` +
        `query string normalization is enabled.`
    );
  }

  if (cdn && !cdn.compressionEnabled) {
    directives.push(
      `Enable Brotli compression at the CDN edge. Brotli provides 15-25% better compression ` +
        `ratios than Gzip for text-based assets, directly reducing transfer times.`
    );
  }

  if (cdn && !cdn.cacheHeaders) {
    directives.push(
      `Implement proper Cache-Control headers on all static resources. Use ` +
        `"public, max-age=31536000, immutable" for fingerprinted assets and ` +
        `"public, max-age=3600, stale-while-revalidate=86400" for HTML documents.`
    );
  }

  if (cdn && cdn.p95Latency > 500) {
    directives.push(
      `P95 latency of ${cdn.p95Latency.toFixed(0)} ms exceeds the 500 ms threshold. ` +
        `Evaluate edge server proximity to target user demographics and consider adding ` +
        `additional PoP (Points of Presence) in high-traffic regions.`
    );
  }

  if (
    secMeta?.headerAnalysis &&
    secMeta.headerAnalysis.missing.includes("Strict-Transport-Security")
  ) {
    directives.push(
      `Deploy HSTS (Strict-Transport-Security) header with a minimum max-age of 31536000 ` +
        `seconds and includeSubDomains directive to enforce HTTPS connections and prevent ` +
        `protocol downgrade attacks.`
    );
  }

  if (directives.length === 0) {
    directives.push(
      `CDN and server configuration appear well-optimized. Continue monitoring hit ratios ` +
        `and latency percentiles to detect degradation early.`
    );
  }

  directives.forEach((d) => pdf.addBulletPoint(d));
}

// ============================================================================
// Section 5: Visual Stability and Layout Shift Correction
// ============================================================================

function buildSection5(pdf: PDFBuilder, report: ScanReport) {
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader(
    "Section 5: Visual Stability and Layout Shift Correction"
  );

  const perfMeta = getPerformanceMetadata(report);
  const cwv = perfMeta?.coreWebVitals ?? {};

  pdf.addParagraph(
    `Visual stability is a direct measure of user trust. Layout shifts that cause content ` +
      `to jump unexpectedly lead to misclicks, accidental navigation, and user frustration. ` +
      `For an OTT platform where users interact with video players, content carousels, and ` +
      `subscription CTAs, even minor layout instability can result in measurable conversion loss. ` +
      `This section analyzes the CLS profile and FCP-to-LCP rendering gap.`
  );

  pdf.y += 2;

  // CLS Analysis
  pdf.addSubHeader("Cumulative Layout Shift (CLS) Analysis");

  const clsDesktop = getCWVValue(cwv, "CLS");
  const clsMobile = getCWVValue(cwv, "CLS_MOBILE");

  const clsRows: string[][] = [
    [
      "Desktop CLS",
      clsDesktop ? clsDesktop.value.toFixed(3) : "N/A",
      "<= 0.10",
      clsDesktop ? getRatingLabel(clsDesktop.rating) : "N/A",
    ],
    [
      "Mobile CLS",
      clsMobile ? clsMobile.value.toFixed(3) : "N/A",
      "<= 0.10",
      clsMobile ? getRatingLabel(clsMobile.rating) : "N/A",
    ],
  ];

  pdf.addTable(["Platform", "CLS Value", "Target", "Rating"], clsRows, {
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 30, halign: "center" as const },
      2: { cellWidth: 30, halign: "center" as const },
      3: { cellWidth: 40, halign: "center" as const },
    },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 3) {
        const val = data.cell.raw as string;
        if (val === "GOOD") {
          data.cell.styles.textColor = COLORS.green;
          data.cell.styles.fontStyle = "bold";
        } else if (val === "CRITICAL") {
          data.cell.styles.textColor = COLORS.red;
          data.cell.styles.fontStyle = "bold";
        } else if (val === "NEEDS IMPROVEMENT") {
          data.cell.styles.textColor = COLORS.amber;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  if (clsDesktop && clsDesktop.value > 0.1) {
    pdf.addParagraph(
      `The desktop CLS of ${clsDesktop.value.toFixed(3)} exceeds the 0.10 threshold, ` +
        `indicating significant layout instability during page load. Common culprits include ` +
        `images without explicit dimensions, dynamically injected ad slots, web font loading ` +
        `causing FOUT/FOIT, and late-loading third-party widgets.`
    );
  }

  if (clsMobile && clsMobile.value > 0.1) {
    pdf.addParagraph(
      `The mobile CLS of ${clsMobile.value.toFixed(3)} is particularly concerning given ` +
        `that mobile viewports amplify layout shifts. Smaller screens mean that even minor ` +
        `element displacement can push interactive targets out of the tap zone.`
    );
  }

  // FCP-to-LCP Gap Analysis
  pdf.y += 2;
  pdf.addSubHeader("FCP-to-LCP Rendering Gap Analysis");

  const fcpDesktop = getCWVValue(cwv, "FCP");
  const lcpDesktop = getCWVValue(cwv, "LCP");
  const fcpMobile = getCWVValue(cwv, "FCP_MOBILE");
  const lcpMobile = getCWVValue(cwv, "LCP_MOBILE");

  if (fcpDesktop && lcpDesktop) {
    const gapDesktop = lcpDesktop.value - fcpDesktop.value;
    pdf.addParagraph(
      `Desktop FCP-to-LCP gap: ${formatMs(gapDesktop)}. ` +
        `FCP occurs at ${formatMs(fcpDesktop.value)} and LCP at ${formatMs(lcpDesktop.value)}. ` +
        `${gapDesktop > 1500 ? "This gap exceeds 1.5 seconds and indicates that the largest content element " + "is loaded significantly later than the first paint, suggesting render-blocking resources " + "or lazy-loaded hero content." : "This gap is within acceptable range, indicating that the primary content " + "renders in close proximity to the first paint."}`
    );
  }

  if (fcpMobile && lcpMobile) {
    const gapMobile = lcpMobile.value - fcpMobile.value;
    pdf.addParagraph(
      `Mobile FCP-to-LCP gap: ${formatMs(gapMobile)}. ` +
        `${gapMobile > 2000 ? "The mobile rendering gap is especially wide, likely due to image-heavy hero " + "sections that are not optimized for mobile bandwidth constraints." : "The mobile rendering gap is within expected parameters."}`
    );
  }

  if (!fcpDesktop && !lcpDesktop) {
    pdf.addParagraph(
      `FCP and LCP data were not available for gap analysis. Ensure that the performance ` +
        `scan captures these metrics for a complete stability assessment.`
    );
  }

  // Remediation requirements
  pdf.y += 2;
  pdf.addSubHeader("Technical Remediation Requirements");

  const remediations: string[] = [];

  if (clsDesktop && clsDesktop.value > 0.1) {
    remediations.push(
      "Set explicit width and height attributes on all img and video elements to reserve " +
        "layout space before assets load. Use CSS aspect-ratio for responsive containers."
    );
    remediations.push(
      "Preload web fonts using <link rel='preload' as='font'> and apply font-display: swap " +
        "to prevent FOIT-induced layout shifts during initial render."
    );
    remediations.push(
      "Reserve fixed dimensions for ad slots and dynamically injected content using " +
        "min-height CSS properties. Implement skeleton screens for asynchronously loaded sections."
    );
  }

  if (fcpDesktop && lcpDesktop && lcpDesktop.value - fcpDesktop.value > 1500) {
    remediations.push(
      "Preload the LCP resource (typically the hero image or video poster) using " +
        "<link rel='preload' as='image'> in the document head to eliminate the FCP-to-LCP gap."
    );
    remediations.push(
      "Evaluate whether the LCP element is blocked by render-blocking CSS or JavaScript. " +
        "Inline critical styles and defer non-essential scripts to accelerate primary content rendering."
    );
  }

  if (remediations.length === 0) {
    remediations.push(
      "Visual stability metrics are within acceptable thresholds. Maintain current layout " +
        "reservation practices and monitor CLS during feature releases."
    );
    remediations.push(
      "Implement automated CLS regression testing in the CI/CD pipeline to catch layout " +
        "instability before deployment."
    );
  }

  remediations.forEach((r, i) => pdf.addNumberedItem(i + 1, r));
}

// ============================================================================
// Section 6: Strategic Remediation Roadmap & Success Matrix
// ============================================================================

function buildSection6(pdf: PDFBuilder, report: ScanReport) {
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader(
    "Section 6: Strategic Remediation Roadmap & Success Matrix"
  );

  const enhanced = report.enhancedRecommendations ?? [];
  const recommendations = report.recommendations ?? [];

  pdf.addParagraph(
    `This section consolidates all identified performance deficiencies into a prioritized ` +
      `remediation roadmap. Each item is scored by impact, implementation effort, and projected ` +
      `score gain to enable data-driven prioritization. Quick wins are highlighted for immediate ` +
      `deployment, while strategic initiatives are mapped to a phased recovery plan targeting ` +
      `the 95-point KPI threshold.`
  );

  pdf.y += 2;

  // High-Priority Fixes Matrix
  if (enhanced.length > 0) {
    pdf.addSubHeader("High-Priority Fixes Matrix");

    // Sort by impact score descending
    const sorted = [...enhanced].sort(
      (a, b) => b.impactScore - a.impactScore
    );

    const matrixRows: string[][] = sorted.map((rec) => [
      rec.title.length > 50 ? rec.title.substring(0, 47) + "..." : rec.title,
      `${rec.impactScore}/10`,
      rec.effort.toUpperCase(),
      `+${rec.projectedScoreGain.toFixed(1)}`,
    ]);

    pdf.addTable(
      ["Issue", "Impact (1-10)", "Effort", "Projected Score Gain"],
      matrixRows,
      {
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 28, halign: "center" as const },
          2: { cellWidth: 25, halign: "center" as const },
          3: { cellWidth: 35, halign: "center" as const },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 2) {
            const val = data.cell.raw as string;
            if (val === "LOW") {
              data.cell.styles.textColor = COLORS.green;
              data.cell.styles.fontStyle = "bold";
            } else if (val === "HIGH") {
              data.cell.styles.textColor = COLORS.red;
              data.cell.styles.fontStyle = "bold";
            } else if (val === "MEDIUM") {
              data.cell.styles.textColor = COLORS.amber;
              data.cell.styles.fontStyle = "bold";
            }
          }
          if (data.section === "body" && data.column.index === 3) {
            data.cell.styles.textColor = COLORS.green;
            data.cell.styles.fontStyle = "bold";
          }
        },
      }
    );
  } else if (recommendations.length > 0) {
    // Fall back to regular recommendations if enhanced are not available
    pdf.addSubHeader("Remediation Priority Matrix");

    const recRows: string[][] = recommendations.map((rec) => [
      rec.title.length > 50 ? rec.title.substring(0, 47) + "..." : rec.title,
      `${rec.priority}`,
      rec.effort.toUpperCase(),
      rec.impact.length > 30
        ? rec.impact.substring(0, 27) + "..."
        : rec.impact,
    ]);

    pdf.addTable(
      ["Issue", "Priority", "Effort", "Expected Impact"],
      recRows,
      {
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 20, halign: "center" as const },
          2: { cellWidth: 25, halign: "center" as const },
          3: { cellWidth: 50 },
        },
      }
    );
  } else {
    pdf.addParagraph(
      `No prioritized recommendations were generated for this scan. This may indicate ` +
        `that the platform is performing within acceptable parameters, or that the report ` +
        `generator was unable to produce enhanced analysis.`
    );
  }

  // Quick Wins
  const quickWins = enhanced.filter((r) => r.quickWin);
  if (quickWins.length > 0) {
    pdf.y += 2;
    pdf.addSubHeader("Quick Wins (Low Effort, High Impact)");

    pdf.addParagraph(
      `The following ${quickWins.length} item(s) have been identified as quick wins. These ` +
        `represent low-effort changes that yield disproportionately high score improvements ` +
        `and should be prioritized for immediate deployment.`
    );

    quickWins.forEach((qw) => {
      const detail =
        `${qw.title} - Projected gain: +${qw.projectedScoreGain.toFixed(1)} points. ` +
        `${qw.description}`;
      pdf.addBulletPoint(detail);
    });
  }

  // Path to Platform Recovery
  pdf.y += 4;
  pdf.addSubHeader("Path to Platform Recovery");

  const totalProjectedGain = enhanced.reduce(
    (sum, r) => sum + r.projectedScoreGain,
    0
  );
  const currentScore = report.kpiScore.overallScore;
  const projectedScore = Math.min(100, currentScore + totalProjectedGain);
  const reachesTarget = projectedScore >= 95;

  pdf.addParagraph(
    `The current overall KPI score of ${currentScore.toFixed(1)} requires a minimum improvement ` +
      `of ${Math.max(0, 95 - currentScore).toFixed(1)} points to meet the 95-point platform target. ` +
      `${enhanced.length > 0 ? `The ${enhanced.length} remediation items identified in this audit carry a combined projected ` + `score gain of +${totalProjectedGain.toFixed(1)} points, bringing the estimated post-remediation ` + `score to ${projectedScore.toFixed(1)}.` : `Remediation items from the recommendations list should be prioritized by effort and ` + `expected impact to systematically close the gap to the 95-point threshold.`}`
  );

  if (reachesTarget && enhanced.length > 0) {
    pdf.addParagraph(
      `Based on the projected gains, full implementation of the remediation roadmap is ` +
        `expected to bring the platform to or above the 95-point threshold. The recommended ` +
        `approach is to implement quick wins first to achieve measurable progress, followed ` +
        `by the high-impact/high-effort items in subsequent sprint cycles.`
    );
  } else if (!reachesTarget && enhanced.length > 0) {
    pdf.addParagraph(
      `The projected score of ${projectedScore.toFixed(1)} suggests that additional optimization ` +
        `beyond the current recommendations may be required to reach the 95-point target. ` +
        `A follow-up audit is recommended after the initial remediation phase to identify ` +
        `second-order improvements and architectural changes that could close the remaining gap.`
    );
  }

  pdf.addParagraph(
    `This report should be treated as a living document. Performance characteristics of OTT ` +
      `platforms evolve with content updates, feature deployments, and infrastructure changes. ` +
      `Weekly rescans using the VZY Verification Agent are recommended to track progress and ` +
      `detect regressions before they impact the end-user experience.`
  );
}

// ============================================================================
// PUBLIC: Generate Performance Audit PDF
// ============================================================================

export function generatePerformanceAuditPDF(
  report: ScanReport,
  aiContent?: string
) {
  const scanId = report.scanId;
  const pdf = new PDFBuilder(
    "Technical Performance Audit",
    `VZY OTT Platform Analysis (Scan ID: ${scanId})`
  );

  // Cover page
  pdf.addCoverPage(report);

  // Document title page
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 30;
  pdf.addFooter();

  pdf.doc.setFont("helvetica", "bold");
  pdf.doc.setFontSize(16);
  pdf.doc.setTextColor(...COLORS.dark);
  pdf.doc.text(
    `Technical Performance Audit: VZY OTT Platform`,
    pdf.pageWidth / 2,
    pdf.y,
    { align: "center" }
  );
  pdf.y += 8;

  pdf.doc.setFont("helvetica", "normal");
  pdf.doc.setFontSize(11);
  pdf.doc.setTextColor(...COLORS.textLight);
  pdf.doc.text(`Scan ID: ${scanId}`, pdf.pageWidth / 2, pdf.y, {
    align: "center",
  });
  pdf.y += 5;

  pdf.doc.text(
    `Generated: ${new Date(report.generatedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    pdf.pageWidth / 2,
    pdf.y,
    { align: "center" }
  );
  pdf.y += 5;

  pdf.doc.text(
    `Platform: ${report.platform === "both" ? "Desktop & Mobile" : report.platform === "mweb" ? "Mobile Web" : "Desktop"}`,
    pdf.pageWidth / 2,
    pdf.y,
    { align: "center" }
  );
  pdf.y += 12;

  // Divider
  pdf.doc.setDrawColor(...COLORS.primary);
  pdf.doc.setLineWidth(0.5);
  pdf.doc.line(pdf.margin + 30, pdf.y, pdf.pageWidth - pdf.margin - 30, pdf.y);
  pdf.y += 10;

  // Table of contents
  pdf.doc.setFont("helvetica", "bold");
  pdf.doc.setFontSize(12);
  pdf.doc.setTextColor(...COLORS.dark);
  pdf.doc.text("Table of Contents", pdf.margin, pdf.y);
  pdf.y += 8;

  const sections = [
    "Section 1: Baseline Performance KPI & Metric Evaluation",
    "Section 2: Core Web Vitals (CWV) Diagnostic: Desktop vs. Mobile",
    "Section 3: Resource Analysis and Payload Optimization",
    "Section 4: Infrastructure & Delivery Analysis: CDN and Server Response",
    "Section 5: Visual Stability and Layout Shift Correction",
    "Section 6: Strategic Remediation Roadmap & Success Matrix",
  ];

  sections.forEach((section, i) => {
    pdf.doc.setFont("helvetica", "normal");
    pdf.doc.setFontSize(10);
    pdf.doc.setTextColor(...COLORS.primary);
    pdf.doc.text(`${i + 1}.  ${section}`, pdf.margin + 5, pdf.y);
    pdf.y += 7;
  });

  if (aiContent) {
    pdf.doc.setFont("helvetica", "normal");
    pdf.doc.setFontSize(10);
    pdf.doc.setTextColor(...COLORS.primary);
    pdf.doc.text("7.  AI-Generated Analysis & Commentary", pdf.margin + 5, pdf.y);
    pdf.y += 7;
  }

  // Build all 6 sections
  buildSection1(pdf, report);
  buildSection2(pdf, report);
  buildSection3(pdf, report);
  buildSection4(pdf, report);
  buildSection5(pdf, report);
  buildSection6(pdf, report);

  // Optional: AI-generated content appendix
  if (aiContent) {
    pdf.doc.addPage();
    pdf.pageNum++;
    pdf.y = 20;
    pdf.addFooter();

    pdf.addSectionHeader("AI-Generated Analysis & Commentary", COLORS.purple);
    pdf.addParagraph(
      `The following analysis was generated by the VZY AI engine based on the scan data. ` +
        `It provides additional context, identifies patterns across metrics, and offers ` +
        `strategic recommendations informed by industry benchmarks.`
    );
    pdf.y += 2;
    pdf.addMarkdownContent(aiContent);
  }

  // Save
  const filename = `VZY-Performance-Audit-${scanId}-${new Date().toISOString().split("T")[0]}.pdf`;
  pdf.save(filename);
}
