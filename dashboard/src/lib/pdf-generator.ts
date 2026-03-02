// ============================================================================
// PDF Report Generator - Professional PDF generation using jsPDF
// ============================================================================

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ScanReport, KPIScore, Finding, Recommendation,
  EnhancedRecommendation, AgentResult,
  SecurityMetadata, PerformanceMetadata, CodeQualityMetadata,
  ComparisonResult, ComparisonSiteData, AIComparisonAnalysis,
} from "@/types/api";

// -- Color Palette (dark professional theme for PDF - using light bg) --
const COLORS = {
  primary: [37, 99, 235] as [number, number, number],       // brand blue
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

function getSeverityColor(severity: string): [number, number, number] {
  switch (severity) {
    case "critical": return COLORS.red;
    case "high": return [234, 88, 12];
    case "medium": return COLORS.amber;
    case "low": return COLORS.green;
    default: return COLORS.textLight;
  }
}

// -- Shared Helpers --

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

  // Check if we need a new page
  checkPage(needed: number = 20) {
    if (this.y + needed > this.pageHeight - 25) {
      this.doc.addPage();
      this.pageNum++;
      this.y = 20;
      this.addFooter();
    }
  }

  // Professional header with branding
  addCoverPage(report: ScanReport) {
    const doc = this.doc;
    const pw = this.pageWidth;
    const ph = this.pageHeight;

    // Top gradient bar
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pw, 60, "F");

    // Lighter accent
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

    // Score circle area
    const circleY = 110;
    const score = report.kpiScore.overallScore;
    const scoreColor = getScoreColor(score);

    // Big score display
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
    const passBg = report.kpiScore.passesThreshold ? COLORS.greenLight : COLORS.redLight;
    const passColor = report.kpiScore.passesThreshold ? COLORS.green : COLORS.red;

    doc.setFillColor(...passBg);
    doc.roundedRect(pw / 2 - 12, circleY + 20, 24, 8, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...passColor);
    doc.text(passText, pw / 2, circleY + 25.5, { align: "center" });

    // Category scores
    const categories = [
      { label: "Security", score: report.kpiScore.grades.security.rawScore, weight: "40%" },
      { label: "Performance", score: report.kpiScore.grades.performance.rawScore, weight: "35%" },
      { label: "Code Quality", score: report.kpiScore.grades.codeQuality.rawScore, weight: "25%" },
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
      doc.text(`${cat.label} (${cat.weight})`, x + cardW / 2, cardY + 10, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(...sc);
      doc.text(cat.score.toFixed(1), x + cardW / 2, cardY + 23, { align: "center" });
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

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textLight);
    doc.text("Confidential - DishTV/Watcho OTT Platform Analysis", pw / 2, ph - 15, { align: "center" });
    doc.text(`Generated by VZY Agent on ${new Date().toLocaleDateString()}`, pw / 2, ph - 10, { align: "center" });

    this.addFooter();
  }

  addFooter() {
    const doc = this.doc;
    const pw = this.pageWidth;
    const ph = this.pageHeight;

    // Footer line
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(this.margin, ph - 12, pw - this.margin, ph - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLight);
    doc.text("VZY OTT Verification Agent | Confidential", this.margin, ph - 8);
    doc.text(`Page ${this.pageNum}`, pw - this.margin, ph - 8, { align: "right" });
  }

  // Section header
  addSectionHeader(title: string, color: [number, number, number] = COLORS.primary) {
    this.checkPage(15);

    this.doc.setFillColor(...color);
    this.doc.roundedRect(this.margin, this.y, this.contentWidth, 10, 2, 2, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...COLORS.white);
    this.doc.text(title, this.margin + 5, this.y + 7);

    this.y += 15;
  }

  // Sub-section header
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

  // Add paragraph text
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

  // Add a score card row
  addScoreRow(label: string, score: number, maxScore: number = 100) {
    this.checkPage(10);

    const barWidth = 60;
    const barX = this.margin + 55;
    const barHeight = 5;
    const fillWidth = (score / maxScore) * barWidth;
    const color = getScoreColor(score);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...COLORS.text);
    this.doc.text(label, this.margin, this.y + 4);

    // Background bar
    this.doc.setFillColor(...COLORS.surface);
    this.doc.roundedRect(barX, this.y, barWidth, barHeight, 1, 1, "F");

    // Filled bar
    if (fillWidth > 0) {
      this.doc.setFillColor(...color);
      this.doc.roundedRect(barX, this.y, Math.max(2, fillWidth), barHeight, 1, 1, "F");
    }

    // Score text
    this.doc.setFont("helvetica", "bold");
    this.doc.setTextColor(...color);
    this.doc.text(`${score.toFixed(1)}`, barX + barWidth + 5, this.y + 4);

    this.y += 9;
  }

  // Add table
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

  // Add metric card (inline)
  addMetricCard(x: number, y: number, width: number, label: string, value: string, color?: [number, number, number]) {
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

  // Simple bar chart
  addBarChart(data: { label: string; value: number; maxValue: number }[], title?: string) {
    const barCount = data.length;
    const chartHeight = Math.max(40, barCount * 12 + 10);
    this.checkPage(chartHeight + (title ? 10 : 0));

    if (title) {
      this.addSubHeader(title);
    }

    const barMaxWidth = this.contentWidth - 50;

    data.forEach((item, i) => {
      this.checkPage(12);
      const barY = this.y;
      const barWidth = (item.value / item.maxValue) * barMaxWidth;
      const color = getScoreColor(item.value);

      // Label
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...COLORS.text);
      this.doc.text(item.label, this.margin, barY + 4);

      // Background
      this.doc.setFillColor(...COLORS.surface);
      this.doc.roundedRect(this.margin + 40, barY, barMaxWidth, 6, 1, 1, "F");

      // Bar
      if (barWidth > 0) {
        this.doc.setFillColor(...color);
        this.doc.roundedRect(this.margin + 40, barY, Math.max(2, barWidth), 6, 1, 1, "F");
      }

      // Value
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...color);
      this.doc.text(item.value.toFixed(1), this.margin + 42 + barMaxWidth, barY + 4);

      this.y += 10;
    });

    this.y += 5;
  }

  // Before-After comparison chart
  addBeforeAfterChart(data: { category: string; current: number; projected: number }[]) {
    this.checkPage(50);

    const chartX = this.margin;
    const chartWidth = this.contentWidth;
    const barHeight = 8;
    const groupHeight = 25;
    const maxVal = 100;

    data.forEach((item, i) => {
      this.checkPage(groupHeight + 5);
      const gy = this.y;

      // Category label
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(9);
      this.doc.setTextColor(...COLORS.text);
      this.doc.text(item.category, chartX, gy + 4);

      const barStartX = chartX + 35;
      const barMaxWidth = chartWidth - 55;

      // Current bar
      const currWidth = (item.current / maxVal) * barMaxWidth;
      const currColor = getScoreColor(item.current);
      this.doc.setFillColor(...COLORS.surface);
      this.doc.roundedRect(barStartX, gy, barMaxWidth, barHeight, 1, 1, "F");
      this.doc.setFillColor(...currColor);
      try { this.doc.setGState(new (this.doc as any).GState({ opacity: 0.5 })); } catch { /* skip opacity */ }
      this.doc.roundedRect(barStartX, gy, Math.max(2, currWidth), barHeight, 1, 1, "F");
      try { this.doc.setGState(new (this.doc as any).GState({ opacity: 1 })); } catch { /* skip */ }

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.doc.setTextColor(...currColor);
      this.doc.text(`${item.current.toFixed(1)}`, barStartX + barMaxWidth + 3, gy + 5);

      // Projected bar
      const projWidth = (item.projected / maxVal) * barMaxWidth;
      const projColor = item.projected >= 95 ? COLORS.green : [59, 130, 246] as [number, number, number];
      this.doc.setFillColor(...COLORS.surface);
      this.doc.roundedRect(barStartX, gy + barHeight + 2, barMaxWidth, barHeight, 1, 1, "F");
      this.doc.setFillColor(...projColor);
      this.doc.roundedRect(barStartX, gy + barHeight + 2, Math.max(2, projWidth), barHeight, 1, 1, "F");

      this.doc.setTextColor(...projColor);
      this.doc.text(`${item.projected.toFixed(1)}`, barStartX + barMaxWidth + 3, gy + barHeight + 7);

      // Target line at 95
      const targetX = barStartX + (95 / maxVal) * barMaxWidth;
      this.doc.setDrawColor(...COLORS.green);
      this.doc.setLineDashPattern([1, 1], 0);
      this.doc.setLineWidth(0.3);
      this.doc.line(targetX, gy - 1, targetX, gy + barHeight * 2 + 3);
      this.doc.setLineDashPattern([], 0);

      this.y += groupHeight;
    });

    // Legend
    this.checkPage(10);
    this.doc.setFontSize(7);
    this.doc.setTextColor(...COLORS.textLight);

    this.doc.setFillColor(...COLORS.amber);
    try { this.doc.setGState(new (this.doc as any).GState({ opacity: 0.5 })); } catch { /* skip opacity */ }
    this.doc.rect(this.margin + 35, this.y, 8, 4, "F");
    this.doc.setGState(new (this.doc as any).GState({ opacity: 1 }));
    this.doc.text("Current", this.margin + 45, this.y + 3);

    this.doc.setFillColor(59, 130, 246);
    this.doc.rect(this.margin + 65, this.y, 8, 4, "F");
    this.doc.text("Projected", this.margin + 75, this.y + 3);

    this.doc.setDrawColor(...COLORS.green);
    this.doc.setLineDashPattern([1, 1], 0);
    this.doc.line(this.margin + 100, this.y + 2, this.margin + 108, this.y + 2);
    this.doc.setLineDashPattern([], 0);
    this.doc.text("Target (95)", this.margin + 110, this.y + 3);

    this.y += 10;
  }

  // Severity distribution mini chart
  addSeverityDistribution(findings: Finding[]) {
    this.checkPage(20);

    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach((f) => { counts[f.severity] = (counts[f.severity] || 0) + 1; });

    const total = findings.length || 1;
    const barY = this.y;
    const barWidth = this.contentWidth;
    const barHeight = 10;

    let offset = 0;
    const severities = ["critical", "high", "medium", "low", "info"];
    const sevColors: Record<string, [number, number, number]> = {
      critical: COLORS.red,
      high: [234, 88, 12],
      medium: COLORS.amber,
      low: COLORS.green,
      info: COLORS.textLight,
    };

    severities.forEach((sev) => {
      if (counts[sev] > 0) {
        const w = (counts[sev] / total) * barWidth;
        this.doc.setFillColor(...sevColors[sev]);
        this.doc.rect(this.margin + offset, barY, w, barHeight, "F");
        offset += w;
      }
    });

    // Labels below
    this.y += barHeight + 3;
    let labelX = this.margin;
    severities.forEach((sev) => {
      if (counts[sev] > 0) {
        this.doc.setFillColor(...sevColors[sev]);
        this.doc.rect(labelX, this.y, 4, 4, "F");
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(7);
        this.doc.setTextColor(...COLORS.text);
        this.doc.text(`${sev}: ${counts[sev]}`, labelX + 6, this.y + 3);
        labelX += 30;
      }
    });

    this.y += 10;
  }

  // Add markdown-like content (for AI reports)
  addMarkdownContent(content: string) {
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        this.y += 3;
        continue;
      }

      this.checkPage(8);

      // Heading detection
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
        const text = trimmed.replace(/^[-*] /, "").replace(/\*\*(.+?)\*\*/g, "$1");
        const wrappedLines = this.doc.splitTextToSize(text, this.contentWidth - 10);
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(8.5);
        this.doc.setTextColor(...COLORS.text);

        // Bullet
        this.doc.setFillColor(...COLORS.primary);
        this.doc.circle(this.margin + 3, this.y + 1.5, 1, "F");

        wrappedLines.forEach((wl: string, wi: number) => {
          this.checkPage(5);
          this.doc.text(wl, this.margin + 7, this.y + 3);
          this.y += 4;
        });
        this.y += 1;
      } else if (/^\d+\.\s/.test(trimmed)) {
        const text = trimmed.replace(/\*\*(.+?)\*\*/g, "$1");
        const wrappedLines = this.doc.splitTextToSize(text, this.contentWidth - 10);
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
        // Regular paragraph text - strip markdown bold
        const text = trimmed.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
        this.addParagraph(text, 8.5);
      }
    }
  }

  save(filename: string) {
    this.doc.save(filename);
  }
}

// ============================================================================
// PUBLIC: Generate Management PDF Report
// ============================================================================
export function generateManagementPDF(report: ScanReport, aiContent?: string) {
  const pdf = new PDFBuilder(
    "Management Report",
    "Executive Overview & Risk Assessment",
  );

  // Cover page
  pdf.addCoverPage(report);

  // Start content on page 2
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  const kpi = report.kpiScore;

  // Executive Summary
  pdf.addSectionHeader("Executive Summary");
  pdf.addParagraph(report.executiveSummary || "No executive summary available.");

  // Risk Assessment
  pdf.addSectionHeader("Risk Assessment", [139, 92, 246]);
  pdf.y += 2;

  const risks = [
    { label: "Security Posture", score: kpi.grades.security.rawScore },
    { label: "Performance Health", score: kpi.grades.performance.rawScore },
    { label: "Code Maintainability", score: kpi.grades.codeQuality.rawScore },
  ];

  risks.forEach((r) => pdf.addScoreRow(r.label, r.score));
  pdf.y += 5;

  // Compliance Status
  pdf.addSubHeader("Compliance Status");
  const compData = [
    ["OWASP Top 10", kpi.grades.security.rawScore >= 85 ? "Compliant" : "At Risk", kpi.grades.security.rawScore.toFixed(1)],
    ["Performance Budget", kpi.grades.performance.rawScore >= 90 ? "Compliant" : "At Risk", kpi.grades.performance.rawScore.toFixed(1)],
    ["Code Standards", kpi.grades.codeQuality.rawScore >= 80 ? "Compliant" : "At Risk", kpi.grades.codeQuality.rawScore.toFixed(1)],
  ];
  pdf.addTable(["Standard", "Status", "Score"], compData);

  // Critical Findings Summary
  if (report.criticalFindings.length > 0) {
    pdf.addSectionHeader("Critical Findings", COLORS.red);

    const findingsRows = report.criticalFindings.slice(0, 15).map((f) => [
      f.severity.toUpperCase(),
      f.title.substring(0, 60),
      f.category,
      f.agent,
    ]);
    pdf.addTable(["Severity", "Finding", "Category", "Agent"], findingsRows);
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    pdf.addSectionHeader("Strategic Recommendations", COLORS.green);

    const recRows = report.recommendations.slice(0, 10).map((r) => [
      `#${r.priority}`,
      r.title,
      r.effort.toUpperCase(),
      r.impact.substring(0, 50),
    ]);
    pdf.addTable(["Priority", "Recommendation", "Effort", "Impact"], recRows);
  }

  // AI-Generated Content
  if (aiContent) {
    pdf.addSectionHeader("AI-Generated Analysis", [139, 92, 246]);
    pdf.addMarkdownContent(aiContent);
  }

  // Regression Comparison
  if (report.comparisonWithPrevious) {
    pdf.addSectionHeader("Trend & Regression Analysis");
    const comp = report.comparisonWithPrevious;

    const compCards = [
      { label: "Score Delta", value: `${comp.scoreDelta > 0 ? "+" : ""}${comp.scoreDelta.toFixed(1)}` },
      { label: "New Findings", value: String(comp.newFindings.length) },
      { label: "Resolved", value: String(comp.resolvedFindings.length) },
    ];

    const cardW = 45;
    const gap = (pdf.contentWidth - 3 * cardW) / 2;
    compCards.forEach((c, i) => {
      pdf.addMetricCard(
        pdf.margin + i * (cardW + gap), pdf.y,
        cardW, c.label, c.value,
        i === 0 ? (comp.scoreDelta >= 0 ? COLORS.green : COLORS.red) :
        i === 1 ? COLORS.amber : COLORS.green,
      );
    });
    pdf.y += 28;

    if (comp.regressions.length > 0) {
      pdf.addSubHeader("Regressions");
      const regRows = comp.regressions.map((r) => [
        r.metric,
        r.previousValue.toFixed(1),
        r.currentValue.toFixed(1),
        r.delta.toFixed(1),
        r.severity.toUpperCase(),
      ]);
      pdf.addTable(["Metric", "Previous", "Current", "Delta", "Severity"], regRows);
    }
  }

  const filename = `VZY-Management-Report-${report.scanId.substring(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}

// ============================================================================
// PUBLIC: Generate Developer PDF Report
// ============================================================================
export function generateDeveloperPDF(report: ScanReport, aiContent?: string) {
  const pdf = new PDFBuilder(
    "Developer Report",
    "Technical Deep-Dive & Remediation Guide",
  );

  // Cover page
  pdf.addCoverPage(report);

  // Start content on page 2
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  const kpi = report.kpiScore;

  // Executive Summary
  pdf.addSectionHeader("Technical Overview");
  pdf.addParagraph(report.executiveSummary || "No executive summary available.");

  // Score Breakdown
  pdf.addSectionHeader("Score Breakdown");
  kpi.grades.security.breakdown.forEach((b) => {
    pdf.addScoreRow(b.metric, b.actualScore, b.maxScore);
  });
  kpi.grades.performance.breakdown.forEach((b) => {
    pdf.addScoreRow(b.metric, b.actualScore, b.maxScore);
  });
  kpi.grades.codeQuality.breakdown.forEach((b) => {
    pdf.addScoreRow(b.metric, b.actualScore, b.maxScore);
  });

  // Severity Distribution
  pdf.addSectionHeader("Severity Distribution", COLORS.red);
  pdf.addSeverityDistribution(report.criticalFindings);

  // All Findings
  pdf.addSectionHeader("Detailed Findings");
  const allFindings = report.criticalFindings.slice(0, 30);
  if (allFindings.length > 0) {
    const findingsRows = allFindings.map((f) => [
      f.severity.toUpperCase(),
      f.title.substring(0, 45),
      f.agent,
      f.evidence?.substring(0, 40) || "-",
      f.remediation?.substring(0, 45) || "-",
    ]);
    pdf.addTable(
      ["Severity", "Finding", "Agent", "Evidence", "Remediation"],
      findingsRows,
      { columnStyles: { 1: { cellWidth: 40 }, 3: { cellWidth: 30 }, 4: { cellWidth: 40 } } },
    );
  }

  // Agent-Specific Details
  report.agentResults.forEach((agent) => {
    if (agent.agentType === "report-generator") return;

    const agentLabel = agent.agentType === "security" ? "Security Agent"
      : agent.agentType === "performance" ? "Performance Agent"
      : "Code Quality Agent";

    const agentColor: [number, number, number] = agent.agentType === "security" ? COLORS.red
      : agent.agentType === "performance" ? COLORS.primary
      : COLORS.purple;

    pdf.addSectionHeader(`${agentLabel} Details`, agentColor);

    // Agent score
    pdf.addScoreRow("Raw Score", agent.score.rawScore);
    pdf.addScoreRow("Weighted Score", agent.score.weightedScore, agent.score.rawScore);

    // Agent findings
    if (agent.findings.length > 0) {
      pdf.addSubHeader(`Findings (${agent.findings.length})`);
      const rows = agent.findings.slice(0, 20).map((f) => [
        f.severity.toUpperCase(),
        f.title.substring(0, 50),
        f.category,
        f.remediation?.substring(0, 50) || "-",
      ]);
      pdf.addTable(["Severity", "Title", "Category", "Remediation"], rows);
    }
  });

  // Recommendations
  if (report.recommendations.length > 0) {
    pdf.addSectionHeader("Remediation Recommendations", COLORS.green);

    report.recommendations.forEach((r) => {
      pdf.checkPage(20);
      pdf.doc.setFont("helvetica", "bold");
      pdf.doc.setFontSize(9);
      pdf.doc.setTextColor(...COLORS.dark);
      pdf.doc.text(`#${r.priority} - ${r.title}`, pdf.margin, pdf.y + 4);
      pdf.y += 7;

      pdf.doc.setFont("helvetica", "normal");
      pdf.doc.setFontSize(8);
      pdf.doc.setTextColor(...COLORS.text);
      const desc = pdf.doc.splitTextToSize(r.description, pdf.contentWidth - 5);
      desc.forEach((line: string) => {
        pdf.checkPage(5);
        pdf.doc.text(line, pdf.margin + 3, pdf.y + 3);
        pdf.y += 4;
      });

      pdf.doc.setFontSize(7);
      pdf.doc.setTextColor(...COLORS.textLight);
      pdf.doc.text(`Effort: ${r.effort} | Impact: ${r.impact.substring(0, 60)} | Category: ${r.category}`, pdf.margin + 3, pdf.y + 3);
      pdf.y += 8;
    });
  }

  // AI-Generated Content
  if (aiContent) {
    pdf.addSectionHeader("AI-Generated Technical Analysis", COLORS.primary);
    pdf.addMarkdownContent(aiContent);
  }

  const filename = `VZY-Developer-Report-${report.scanId.substring(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}

// ============================================================================
// PUBLIC: Generate Comprehensive Full PDF Report
// ============================================================================
export function generateFullPDF(
  report: ScanReport,
  enhancedRecs?: EnhancedRecommendation[],
  mgmtContent?: string,
  devContent?: string,
) {
  const pdf = new PDFBuilder(
    "Comprehensive Analysis Report",
    "Complete OTT Platform Assessment - All Dashboards & AI Insights",
  );

  const kpi = report.kpiScore;

  // ── Page 1: Cover ──
  pdf.addCoverPage(report);

  // ── Page 2: Table of Contents ──
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader("Table of Contents");
  const tocItems = [
    "1. Executive Summary & KPI Overview",
    "2. Security Analysis",
    "3. Performance Analysis",
    "4. Code Quality Analysis",
    "5. All Findings & Severity Distribution",
    "6. AI-Powered Recommendations",
    "7. Projected Score After Fixes",
    "8. Success Matrix",
    "9. Regression & Trend Analysis",
    "10. Management Report (AI-Generated)",
    "11. Developer Report (AI-Generated)",
  ];
  tocItems.forEach((item, i) => {
    pdf.doc.setFont("helvetica", "normal");
    pdf.doc.setFontSize(10);
    pdf.doc.setTextColor(...COLORS.text);
    pdf.doc.text(item, pdf.margin + 5, pdf.y + 4);
    pdf.y += 8;
  });

  // ── Section 1: Executive Summary ──
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader("1. Executive Summary & KPI Overview");
  pdf.addParagraph(report.executiveSummary || "No executive summary available.");

  pdf.y += 3;
  pdf.addSubHeader("Overall Scores");
  pdf.addScoreRow("Overall KPI", kpi.overallScore);
  pdf.addScoreRow("Security (40%)", kpi.grades.security.rawScore);
  pdf.addScoreRow("Performance (35%)", kpi.grades.performance.rawScore);
  pdf.addScoreRow("Code Quality (25%)", kpi.grades.codeQuality.rawScore);

  // Score breakdown table
  pdf.y += 5;
  pdf.addSubHeader("Detailed Score Breakdown");
  const breakdownRows: string[][] = [];
  ["security", "performance", "codeQuality"].forEach((key) => {
    const grade = kpi.grades[key as keyof typeof kpi.grades];
    grade.breakdown.forEach((b) => {
      breakdownRows.push([
        grade.category, b.metric, b.value.toFixed(1),
        b.maxScore.toFixed(0), b.actualScore.toFixed(1),
        b.penalty.toFixed(1), b.details.substring(0, 40),
      ]);
    });
  });
  pdf.addTable(
    ["Agent", "Metric", "Value", "Max", "Score", "Penalty", "Details"],
    breakdownRows,
    { styles: { fontSize: 7 } },
  );

  // ── Section 2: Security Analysis ──
  const secAgent = report.agentResults.find((a) => a.agentType === "security");
  if (secAgent) {
    pdf.addSectionHeader("2. Security Analysis", COLORS.red);

    pdf.addScoreRow("Security Score", secAgent.score.rawScore);
    pdf.y += 3;

    const secMeta = secAgent.metadata as SecurityMetadata;

    // Key metrics
    if (secMeta) {
      pdf.addSubHeader("Security Metrics");

      const secMetrics = [
        ["SSL Grade", secMeta.sslAnalysis?.grade || "N/A"],
        ["Header Score", `${secMeta.headerAnalysis?.score || 0}/100`],
        ["Missing Headers", String(secMeta.headerAnalysis?.missing?.length || 0)],
        ["CORS Issues", String(secMeta.corsAnalysis?.issues?.length || 0)],
        ["Token Leaks", String(secMeta.tokenLeaks?.length || 0)],
        ["Dependency Vulns", String(secMeta.dependencyVulns?.length || 0)],
      ];
      pdf.addTable(["Metric", "Value"], secMetrics);

      // DRM Status
      if (secMeta.drmAnalysis) {
        pdf.addSubHeader("DRM Protection Status");
        const drmRows = [
          ["Widevine", secMeta.drmAnalysis.widevineDetected ? "Detected" : "Not Detected"],
          ["FairPlay", secMeta.drmAnalysis.fairplayDetected ? "Detected" : "Not Detected"],
          ["Key Rotation", secMeta.drmAnalysis.keyRotation ? "Enabled" : "Disabled"],
          ["License URL Safe", secMeta.drmAnalysis.licenseUrlExposed ? "EXPOSED" : "Safe"],
        ];
        pdf.addTable(["DRM Feature", "Status"], drmRows);
      }

      // OWASP
      if (secMeta.owaspFindings?.length > 0) {
        pdf.addSubHeader("OWASP Top 10 Findings");
        const owaspRows = secMeta.owaspFindings.slice(0, 10).map((o) => [
          o.category, o.name, o.risk.toUpperCase(), o.details.substring(0, 50),
        ]);
        pdf.addTable(["Category", "Finding", "Risk", "Details"], owaspRows);
      }
    }

    // Security Findings
    if (secAgent.findings.length > 0) {
      pdf.addSubHeader(`Security Findings (${secAgent.findings.length})`);
      const secRows = secAgent.findings.slice(0, 25).map((f) => [
        f.severity.toUpperCase(), f.title.substring(0, 40),
        f.evidence?.substring(0, 30) || "-", f.remediation?.substring(0, 40) || "-",
      ]);
      pdf.addTable(["Severity", "Finding", "Evidence", "Remediation"], secRows);
    }
  }

  // ── Section 3: Performance Analysis ──
  const perfAgent = report.agentResults.find((a) => a.agentType === "performance");
  if (perfAgent) {
    pdf.addSectionHeader("3. Performance Analysis", COLORS.primary);

    pdf.addScoreRow("Performance Score", perfAgent.score.rawScore);
    pdf.y += 3;

    const perfMeta = perfAgent.metadata as PerformanceMetadata;

    if (perfMeta) {
      // Lighthouse
      if (perfMeta.lighthouse) {
        pdf.addSubHeader("Lighthouse Scores");
        const lhData = [
          { label: "Performance", value: perfMeta.lighthouse.performanceScore, maxValue: 100 },
          { label: "Accessibility", value: perfMeta.lighthouse.accessibilityScore, maxValue: 100 },
          { label: "Best Practices", value: perfMeta.lighthouse.bestPracticesScore, maxValue: 100 },
          { label: "SEO", value: perfMeta.lighthouse.seoScore, maxValue: 100 },
          { label: "PWA", value: perfMeta.lighthouse.pwaScore, maxValue: 100 },
        ];
        pdf.addBarChart(lhData);
      }

      // CWV
      if (perfMeta.coreWebVitals) {
        pdf.addSubHeader("Core Web Vitals");
        const cwvRows = Object.entries(perfMeta.coreWebVitals).map(([key, val]) => [
          key.toUpperCase(), String(val.value), val.rating.toUpperCase(),
        ]);
        pdf.addTable(["Metric", "Value", "Rating"], cwvRows);
      }

      // Player Metrics
      if (perfMeta.playerMetrics) {
        pdf.addSubHeader("Player Metrics");
        const pm = perfMeta.playerMetrics;
        const playerRows = [
          ["Startup Delay", `${pm.startupDelay}ms`],
          ["Time to First Frame", `${pm.timeToFirstFrame}ms`],
          ["Buffer Ratio", `${(pm.bufferRatio * 100).toFixed(1)}%`],
          ["Rebuffer Events", String(pm.rebufferEvents)],
          ["ABR Switches", String(pm.abrSwitchCount)],
          ["DRM License Time", `${pm.drmLicenseTime}ms`],
          ["Playback Failures", String(pm.playbackFailures)],
        ];
        pdf.addTable(["Metric", "Value"], playerRows);
      }

      // CDN
      if (perfMeta.cdnMetrics) {
        pdf.addSubHeader("CDN Metrics");
        const cdn = perfMeta.cdnMetrics;
        const cdnRows = [
          ["Cache Hit Ratio", `${(cdn.hitRatio * 100).toFixed(1)}%`],
          ["Avg Latency", `${cdn.avgLatency}ms`],
          ["P95 Latency", `${cdn.p95Latency}ms`],
          ["Compression", cdn.compressionEnabled ? "Enabled" : "Disabled"],
          ["Cache Headers", cdn.cacheHeaders ? "Present" : "Missing"],
        ];
        pdf.addTable(["Metric", "Value"], cdnRows);
      }

      // Resources
      if (perfMeta.resourceMetrics) {
        pdf.addSubHeader("Resource Breakdown");
        const rm = perfMeta.resourceMetrics;
        const formatKB = (b: number) => `${(b / 1024).toFixed(0)} KB`;
        const resData = [
          { label: "JavaScript", value: rm.jsSize / 1024, maxValue: rm.totalSize / 1024 },
          { label: "CSS", value: rm.cssSize / 1024, maxValue: rm.totalSize / 1024 },
          { label: "Images", value: rm.imageSize / 1024, maxValue: rm.totalSize / 1024 },
          { label: "Fonts", value: rm.fontSize / 1024, maxValue: rm.totalSize / 1024 },
          { label: "3rd Party", value: rm.thirdPartySize / 1024, maxValue: rm.totalSize / 1024 },
        ];
        pdf.addBarChart(resData, "Resource Sizes");
      }
    }
  }

  // ── Section 4: Code Quality Analysis ──
  const cqAgent = report.agentResults.find((a) => a.agentType === "code-quality");
  if (cqAgent) {
    pdf.addSectionHeader("4. Code Quality Analysis", COLORS.purple);

    pdf.addScoreRow("Code Quality Score", cqAgent.score.rawScore);
    pdf.y += 3;

    const cqMeta = cqAgent.metadata as CodeQualityMetadata;

    if (cqMeta) {
      // Lint results
      if (cqMeta.lintResults) {
        pdf.addSubHeader("Lint Results");
        const lintRows = [
          ["Errors", String(cqMeta.lintResults.errors)],
          ["Warnings", String(cqMeta.lintResults.warnings)],
          ["Auto-Fixable", String(cqMeta.lintResults.fixable)],
        ];
        pdf.addTable(["Type", "Count"], lintRows);
      }

      // Complexity
      if (cqMeta.complexity) {
        pdf.addSubHeader("Complexity Metrics");
        const cx = cqMeta.complexity;
        const cxRows = [
          ["Avg Cyclomatic", cx.avgCyclomaticComplexity.toFixed(1)],
          ["Max Cyclomatic", cx.maxCyclomaticComplexity.toFixed(1)],
          ["Avg Cognitive", cx.avgCognitiveComplexity.toFixed(1)],
          ["Max Cognitive", cx.maxCognitiveComplexity.toFixed(1)],
          ["Duplicate Blocks", String(cx.duplicateBlocks)],
          ["Technical Debt", cx.technicalDebt],
        ];
        pdf.addTable(["Metric", "Value"], cxRows);
      }

      // Memory Leaks
      if (cqMeta.memoryLeaks?.length > 0) {
        pdf.addSubHeader(`Memory Leaks (${cqMeta.memoryLeaks.length})`);
        const mlRows = cqMeta.memoryLeaks.slice(0, 10).map((m) => [
          m.type, m.file, String(m.line), m.severity.toUpperCase(), m.description.substring(0, 40),
        ]);
        pdf.addTable(["Type", "File", "Line", "Severity", "Description"], mlRows);
      }

      // Dead Code
      if (cqMeta.deadCode?.length > 0) {
        pdf.addSubHeader(`Dead Code (${cqMeta.deadCode.length})`);
        const dcRows = cqMeta.deadCode.slice(0, 10).map((d) => [
          d.type, d.file, String(d.line), `${(d.confidence * 100).toFixed(0)}%`,
        ]);
        pdf.addTable(["Type", "File", "Line", "Confidence"], dcRows);
      }

      // Anti-Patterns
      if (cqMeta.antiPatterns?.length > 0) {
        pdf.addSubHeader(`Anti-Patterns (${cqMeta.antiPatterns.length})`);
        const apRows = cqMeta.antiPatterns.slice(0, 10).map((a) => [
          a.pattern, a.file, String(a.line), a.suggestion.substring(0, 40),
        ]);
        pdf.addTable(["Pattern", "File", "Line", "Suggestion"], apRows);
      }
    }
  }

  // ── Section 5: All Findings & Severity Distribution ──
  pdf.addSectionHeader("5. All Findings & Severity Distribution");

  pdf.addSubHeader("Severity Distribution");
  pdf.addSeverityDistribution(report.criticalFindings);

  pdf.y += 3;
  pdf.addSubHeader(`All Critical & High Findings (${report.criticalFindings.length})`);
  const allRows = report.criticalFindings.slice(0, 40).map((f) => [
    f.severity.toUpperCase(),
    f.title.substring(0, 40),
    f.agent,
    f.category,
    f.remediation?.substring(0, 40) || "-",
  ]);
  pdf.addTable(["Severity", "Finding", "Agent", "Category", "Remediation"], allRows, {
    styles: { fontSize: 7 },
  });

  // ── Section 6: AI-Powered Recommendations ──
  pdf.addSectionHeader("6. AI-Powered Recommendations", [139, 92, 246]);

  const recs = report.recommendations;
  const WEIGHTS: Record<string, number> = { security: 0.40, performance: 0.35, "code-quality": 0.25 };

  const enhanced: EnhancedRecommendation[] = enhancedRecs?.length
    ? enhancedRecs
    : recs.slice(0, 10).map((r, i) => {
        const effortScore = r.effort === "low" ? 8 : r.effort === "medium" ? 5 : 3;
        const impactScore = Math.max(1, 10 - i);
        const riskScore = Math.max(1, 8 - i);
        const weight = WEIGHTS[r.category] || 0.25;
        const projectedGain = Math.round((impactScore * 2 * weight) * 100) / 100;
        return {
          ...r,
          priority: i + 1,
          impactScore,
          riskScore,
          easeScore: effortScore,
          projectedScoreGain: projectedGain,
          confidence: 0.7,
          quickWin: effortScore >= 7 && impactScore >= 5,
          affectedMetric: r.category === "security" ? "Security" : r.category === "performance" ? "Performance" : "Code Quality",
        };
      });

  // Top 5 Priority Fixes
  pdf.addSubHeader("Top 5 Priority Fixes");
  const top5Rows = enhanced.slice(0, 5).map((r) => [
    `#${r.priority}`,
    r.title.substring(0, 40),
    r.category,
    `${r.impactScore}/10`,
    `${r.riskScore}/10`,
    `${r.easeScore}/10`,
    `+${r.projectedScoreGain.toFixed(1)}`,
    r.effort,
    r.quickWin ? "Yes" : "",
  ]);
  pdf.addTable(
    ["#", "Fix", "Category", "Impact", "Risk", "Ease", "Gain", "Effort", "Quick Win"],
    top5Rows,
    { styles: { fontSize: 7 } },
  );

  // Quick Wins
  const quickWins = enhanced.filter((r) => r.quickWin);
  if (quickWins.length > 0) {
    pdf.addSubHeader(`Quick Wins (${quickWins.length})`);
    const qwRows = quickWins.map((r) => [
      r.title.substring(0, 50),
      r.category,
      `+${r.projectedScoreGain.toFixed(1)} pts`,
    ]);
    pdf.addTable(["Quick Win", "Category", "Projected Gain"], qwRows);
  }

  // ── Section 7: Projected Score After Fixes ──
  pdf.addSectionHeader("7. Projected Score After Fixes", COLORS.green);

  const totalGain = enhanced.reduce((s, r) => s + r.projectedScoreGain, 0);
  const projectedOverall = Math.min(100, kpi.overallScore + totalGain);

  const projectedData = [
    {
      category: "Security",
      current: kpi.grades.security.rawScore,
      projected: Math.min(100, kpi.grades.security.rawScore +
        enhanced.filter((r) => r.category === "security").reduce((s, r) => s + r.projectedScoreGain / 0.4, 0)),
    },
    {
      category: "Performance",
      current: kpi.grades.performance.rawScore,
      projected: Math.min(100, kpi.grades.performance.rawScore +
        enhanced.filter((r) => r.category === "performance").reduce((s, r) => s + r.projectedScoreGain / 0.35, 0)),
    },
    {
      category: "Code Quality",
      current: kpi.grades.codeQuality.rawScore,
      projected: Math.min(100, kpi.grades.codeQuality.rawScore +
        enhanced.filter((r) => r.category === "code-quality").reduce((s, r) => s + r.projectedScoreGain / 0.25, 0)),
    },
  ];

  pdf.addBeforeAfterChart(projectedData);

  // Overall projection summary
  pdf.checkPage(15);
  pdf.doc.setFillColor(...COLORS.primaryLight);
  pdf.doc.roundedRect(pdf.margin, pdf.y, pdf.contentWidth, 14, 3, 3, "F");
  pdf.doc.setFont("helvetica", "bold");
  pdf.doc.setFontSize(10);
  pdf.doc.setTextColor(...COLORS.primary);
  pdf.doc.text(
    `Overall KPI: ${kpi.overallScore.toFixed(1)} → ${projectedOverall.toFixed(1)} (+${totalGain.toFixed(1)} pts)`,
    pdf.pageWidth / 2, pdf.y + 9, { align: "center" },
  );
  pdf.y += 20;

  // ── Section 8: Success Matrix ──
  pdf.addSectionHeader("8. Success Matrix");

  const matrixRows = enhanced.map((r) => [
    `#${r.priority}`,
    r.title.substring(0, 35),
    r.category,
    `${r.riskScore}/10`,
    `${r.impactScore}/10`,
    `+${r.projectedScoreGain.toFixed(1)}`,
    r.effort,
    `${(r.confidence * 100).toFixed(0)}%`,
  ]);
  pdf.addTable(
    ["#", "Issue", "Category", "Risk", "Impact", "Post-Fix Gain", "Effort", "Confidence"],
    matrixRows,
    { styles: { fontSize: 7 } },
  );

  // ── Section 9: Regression & Trend ──
  if (report.comparisonWithPrevious) {
    pdf.addSectionHeader("9. Regression & Trend Analysis");
    const comp = report.comparisonWithPrevious;

    const trendRows = [
      ["Score Change", `${comp.scoreDelta > 0 ? "+" : ""}${comp.scoreDelta.toFixed(1)}`],
      ["New Findings", String(comp.newFindings.length)],
      ["Resolved Findings", String(comp.resolvedFindings.length)],
      ["Regressions", String(comp.regressions.length)],
    ];
    pdf.addTable(["Metric", "Value"], trendRows);

    if (comp.regressions.length > 0) {
      pdf.addSubHeader("Regressions Detail");
      const regRows = comp.regressions.map((r) => [
        r.metric, r.previousValue.toFixed(1), r.currentValue.toFixed(1),
        r.delta.toFixed(1), r.severity.toUpperCase(), r.agent,
      ]);
      pdf.addTable(["Metric", "Previous", "Current", "Delta", "Severity", "Agent"], regRows);
    }

    // Trend history
    if (kpi.trend.history.length > 0) {
      pdf.addSubHeader("Score Trend History");
      const histRows = kpi.trend.history.slice(-14).map((h) => [
        new Date(h.date).toLocaleDateString(),
        h.score.toFixed(1),
      ]);
      pdf.addTable(["Date", "Score"], histRows);
    }
  }

  // ── Section 10: Management Report ──
  if (mgmtContent) {
    pdf.addSectionHeader("10. Management Report (AI-Generated)", [139, 92, 246]);
    pdf.addMarkdownContent(mgmtContent);
  }

  // ── Section 11: Developer Report ──
  if (devContent) {
    pdf.addSectionHeader("11. Developer Report (AI-Generated)", COLORS.primary);
    pdf.addMarkdownContent(devContent);
  }

  // ── Final page: Summary ──
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 30;
  pdf.addFooter();

  pdf.doc.setFillColor(...COLORS.primary);
  pdf.doc.rect(0, 0, pdf.pageWidth, 50, "F");
  pdf.doc.setFont("helvetica", "bold");
  pdf.doc.setFontSize(20);
  pdf.doc.setTextColor(...COLORS.white);
  pdf.doc.text("Report Summary", pdf.pageWidth / 2, 25, { align: "center" });
  pdf.doc.setFontSize(10);
  pdf.doc.setFont("helvetica", "normal");
  pdf.doc.text("VZY OTT Verification Agent - Comprehensive Analysis", pdf.pageWidth / 2, 38, { align: "center" });

  pdf.y = 60;

  // Summary stats
  const summaryItems = [
    { label: "Overall KPI Score", value: `${kpi.overallScore.toFixed(1)} / 100`, color: getScoreColor(kpi.overallScore) },
    { label: "Projected Score After Fixes", value: `${projectedOverall.toFixed(1)} / 100`, color: COLORS.primary },
    { label: "Total Findings", value: String(report.criticalFindings.length), color: COLORS.red },
    { label: "Recommendations", value: String(report.recommendations.length), color: COLORS.green },
    { label: "Quick Wins Available", value: String(quickWins.length), color: COLORS.primary },
    { label: "Regressions", value: String(report.comparisonWithPrevious?.regressions?.length || 0), color: COLORS.amber },
  ];

  summaryItems.forEach((item) => {
    pdf.checkPage(12);
    pdf.doc.setFillColor(...COLORS.white);
    pdf.doc.setDrawColor(...COLORS.border);
    pdf.doc.setLineWidth(0.3);
    pdf.doc.roundedRect(pdf.margin, pdf.y, pdf.contentWidth, 12, 2, 2, "FD");

    pdf.doc.setFont("helvetica", "normal");
    pdf.doc.setFontSize(9);
    pdf.doc.setTextColor(...COLORS.text);
    pdf.doc.text(item.label, pdf.margin + 5, pdf.y + 8);

    pdf.doc.setFont("helvetica", "bold");
    pdf.doc.setFontSize(11);
    pdf.doc.setTextColor(...item.color);
    pdf.doc.text(item.value, pdf.pageWidth - pdf.margin - 5, pdf.y + 8, { align: "right" });

    pdf.y += 15;
  });

  pdf.y += 10;
  pdf.doc.setFont("helvetica", "italic");
  pdf.doc.setFontSize(8);
  pdf.doc.setTextColor(...COLORS.textLight);
  pdf.doc.text(
    `This report was automatically generated by VZY OTT Verification Agent on ${new Date().toLocaleString()}.`,
    pdf.pageWidth / 2, pdf.y, { align: "center" },
  );
  pdf.doc.text(
    "All data is based on the most recent scan results. Projected scores are estimates based on AI analysis.",
    pdf.pageWidth / 2, pdf.y + 5, { align: "center" },
  );

  const filename = `VZY-Complete-Report-${report.scanId.substring(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}

// ============================================================================
// Comparison PDF Helpers
// ============================================================================

function getSiteLabel(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function addComparisonCoverPage(pdf: PDFBuilder, result: ComparisonResult, title: string, subtitle: string) {
  const doc = pdf.doc;
  const pw = pdf.pageWidth;
  const ph = pdf.pageHeight;

  // Top gradient bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pw, 60, "F");
  doc.setFillColor(29, 78, 216);
  doc.rect(0, 55, pw, 8, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...COLORS.white);
  doc.text("VZY Competition Analysis", pw / 2, 25, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(title, pw / 2, 38, { align: "center" });
  doc.setFontSize(10);
  doc.text(subtitle, pw / 2, 48, { align: "center" });

  // Score cards for each site
  const allSites = [result.primary, ...result.competitors];
  const cardW = Math.min(45, (pdf.contentWidth - (allSites.length - 1) * 5) / allSites.length);
  const totalCardsW = allSites.length * cardW + (allSites.length - 1) * 5;
  const startX = (pw - totalCardsW) / 2;
  const cardY = 80;

  allSites.forEach((site, i) => {
    const x = startX + i * (cardW + 5);
    const sc = getScoreColor(site.overallScore);

    doc.setFillColor(...COLORS.white);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardW, 40, 3, 3, "FD");

    // Site label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLight);
    const label = getSiteLabel(site.url).substring(0, 14);
    doc.text(label, x + cardW / 2, cardY + 8, { align: "center" });

    // Score
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...sc);
    doc.text(site.overallScore.toFixed(1), x + cardW / 2, cardY + 24, { align: "center" });

    // Primary badge
    if (i === 0) {
      doc.setFillColor(...COLORS.primaryLight);
      doc.roundedRect(x + 2, cardY + 30, cardW - 4, 6, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.primary);
      doc.text("YOUR SITE", x + cardW / 2, cardY + 34.5, { align: "center" });
    }
  });

  // AI Verdict section
  const verdictY = cardY + 55;
  doc.setFillColor(...COLORS.surface);
  doc.roundedRect(pdf.margin, verdictY, pdf.contentWidth, 28, 3, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.primary);
  doc.text("AI Verdict", pdf.margin + 8, verdictY + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.text);
  const verdictLines = doc.splitTextToSize(result.aiAnalysis.verdict, pdf.contentWidth - 16);
  verdictLines.slice(0, 3).forEach((line: string, i: number) => {
    doc.text(line, pdf.margin + 8, verdictY + 14 + i * 4);
  });

  // Metadata
  const metaY = verdictY + 35;
  doc.setFillColor(...COLORS.surface);
  doc.roundedRect(pdf.margin, metaY, pdf.contentWidth, 20, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textLight);

  doc.setFont("helvetica", "bold");
  doc.text("Gap Score:", pdf.margin + 8, metaY + 8);
  doc.setFont("helvetica", "normal");
  doc.text(String(result.aiAnalysis.competitiveGapScore), pdf.margin + 30, metaY + 8);

  doc.setFont("helvetica", "bold");
  doc.text("Risk:", pdf.margin + 50, metaY + 8);
  doc.setFont("helvetica", "normal");
  doc.text(result.aiAnalysis.riskRating.toUpperCase(), pdf.margin + 62, metaY + 8);

  doc.setFont("helvetica", "bold");
  doc.text("Leader:", pdf.margin + 85, metaY + 8);
  doc.setFont("helvetica", "normal");
  doc.text(getSiteLabel(result.aiAnalysis.leader), pdf.margin + 102, metaY + 8);

  doc.setFont("helvetica", "bold");
  doc.text("Generated:", pdf.margin + 8, metaY + 14);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(result.generatedAt).toLocaleString(), pdf.margin + 32, metaY + 14);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textLight);
  doc.text("Confidential - DishTV/Watcho OTT Platform Analysis", pw / 2, ph - 15, { align: "center" });

  pdf.addFooter();
}

function addComparisonTable(pdf: PDFBuilder, allSites: ComparisonSiteData[], metrics: { label: string; getValue: (s: ComparisonSiteData) => string }[]) {
  const headers = ["Metric", ...allSites.map((s) => getSiteLabel(s.url).substring(0, 15))];
  const rows = metrics.map((m) => [m.label, ...allSites.map((s) => m.getValue(s))]);
  pdf.addTable(headers, rows, { styles: { fontSize: 7 } });
}

// ============================================================================
// PUBLIC: Generate Comparison Developer PDF
// ============================================================================
export function generateComparisonDeveloperPDF(result: ComparisonResult) {
  const pdf = new PDFBuilder("Developer Comparison Report", "Technical Deep-Dive");

  const allSites = [result.primary, ...result.competitors];
  const ai = result.aiAnalysis;

  // Cover
  addComparisonCoverPage(pdf, result, "Developer Comparison Report", "Technical Deep-Dive & Competitive Analysis");

  // Page 2: Score Overview
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader("Score Comparison");
  addComparisonTable(pdf, allSites, [
    { label: "Overall Score", getValue: (s) => s.overallScore.toFixed(1) },
    { label: "Security Score", getValue: (s) => s.securityScore.toFixed(1) },
    { label: "Performance Score", getValue: (s) => s.performanceScore.toFixed(1) },
    { label: "Code Quality Score", getValue: (s) => s.codeQualityScore.toFixed(1) },
  ]);

  // Security Details
  pdf.addSectionHeader("Security Comparison", COLORS.red);
  addComparisonTable(pdf, allSites, [
    { label: "SSL Grade", getValue: (s) => s.sslGrade },
    { label: "Header Score", getValue: (s) => `${s.headerScore}/100` },
    { label: "Missing Headers", getValue: (s) => String(s.missingHeaders.length) },
    { label: "CORS Issues", getValue: (s) => String(s.corsIssues.length) },
    { label: "Token Leaks", getValue: (s) => String(s.tokenLeakCount) },
    { label: "Dependency Vulns", getValue: (s) => String(s.dependencyVulnCount) },
    { label: "Widevine DRM", getValue: (s) => s.drmStatus.widevineDetected ? "Yes" : "No" },
    { label: "FairPlay DRM", getValue: (s) => s.drmStatus.fairplayDetected ? "Yes" : "No" },
    { label: "License URL Exposed", getValue: (s) => s.drmStatus.licenseUrlExposed ? "EXPOSED" : "Safe" },
    { label: "Critical Findings", getValue: (s) => String(s.criticalFindingsCount) },
    { label: "High Findings", getValue: (s) => String(s.highFindingsCount) },
    { label: "Total Findings", getValue: (s) => String(s.totalFindingsCount) },
  ]);

  // OWASP Comparison
  if (allSites[0].owaspSummary?.length > 0) {
    pdf.addSubHeader("OWASP Summary (Primary Site)");
    const owaspRows = allSites[0].owaspSummary.map((o) => [o.category, o.risk.toUpperCase(), String(o.count)]);
    pdf.addTable(["Category", "Risk", "Count"], owaspRows);
  }

  // Performance Details
  pdf.addSectionHeader("Performance Comparison", COLORS.primary);
  addComparisonTable(pdf, allSites, [
    { label: "LH Performance", getValue: (s) => String(s.lighthouseScores.performance) },
    { label: "LH Accessibility", getValue: (s) => String(s.lighthouseScores.accessibility) },
    { label: "LH Best Practices", getValue: (s) => String(s.lighthouseScores.bestPractices) },
    { label: "LH SEO", getValue: (s) => String(s.lighthouseScores.seo) },
  ]);

  // CWV Table
  const cwvKeys = Object.keys(allSites[0]?.coreWebVitals || {});
  if (cwvKeys.length > 0) {
    pdf.addSubHeader("Core Web Vitals");
    addComparisonTable(pdf, allSites, cwvKeys.map((key) => ({
      label: key.toUpperCase(),
      getValue: (s) => {
        const cwv = s.coreWebVitals[key];
        return cwv ? `${cwv.value} (${cwv.rating})` : "N/A";
      },
    })));
  }

  // AI Roadmap
  pdf.addSectionHeader("AI Improvement Roadmap", [139, 92, 246]);
  ai.improvementRoadmap.forEach((phase) => {
    pdf.addSubHeader(`${phase.timeframe} Actions`);
    phase.actions.forEach((action) => {
      pdf.addParagraph(`  - ${action}`, 8);
    });
    pdf.y += 3;
  });

  // Success Matrix
  pdf.addSectionHeader("Success Matrix");
  const matrixHeaders = ["Metric", "Your Score", ...result.competitors.map((c) => getSiteLabel(c.url).substring(0, 12)), "Leader", "Gap"];
  const matrixRows = ai.successMatrix.map((row) => [
    row.metric,
    row.primary.toFixed(1),
    ...row.competitors.map((c) => c.value.toFixed(1)),
    getSiteLabel(row.leader),
    row.gap > 0 ? `-${row.gap.toFixed(1)}` : `+${Math.abs(row.gap).toFixed(1)}`,
  ]);
  pdf.addTable(matrixHeaders, matrixRows, { styles: { fontSize: 7 } });

  const filename = `VZY-Competition-Developer-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}

// ============================================================================
// PUBLIC: Generate Comparison Executive PDF
// ============================================================================
export function generateComparisonExecutivePDF(result: ComparisonResult) {
  const pdf = new PDFBuilder("Executive Comparison Report", "Management Overview");

  const allSites = [result.primary, ...result.competitors];
  const ai = result.aiAnalysis;

  // Cover
  addComparisonCoverPage(pdf, result, "Executive Comparison Report", "Competitive Positioning & Strategic Analysis");

  // Page 2: KPI Comparison
  pdf.doc.addPage();
  pdf.pageNum++;
  pdf.y = 20;
  pdf.addFooter();

  pdf.addSectionHeader("KPI Score Comparison");
  addComparisonTable(pdf, allSites, [
    { label: "Overall KPI", getValue: (s) => s.overallScore.toFixed(1) },
    { label: "Security (40%)", getValue: (s) => s.securityScore.toFixed(1) },
    { label: "Performance (35%)", getValue: (s) => s.performanceScore.toFixed(1) },
    { label: "Code Quality (25%)", getValue: (s) => s.codeQualityScore.toFixed(1) },
  ]);

  // Competitive Gap
  pdf.addSectionHeader("Competitive Gap Analysis", [139, 92, 246]);

  const gapColor = ai.competitiveGapScore <= 20 ? COLORS.green : ai.competitiveGapScore <= 50 ? COLORS.amber : COLORS.red;

  const cardW = 50;
  const gap2 = (pdf.contentWidth - 3 * cardW) / 2;
  pdf.addMetricCard(pdf.margin, pdf.y, cardW, "Gap Score", String(ai.competitiveGapScore), gapColor);
  pdf.addMetricCard(pdf.margin + cardW + gap2, pdf.y, cardW, "Risk Rating", ai.riskRating.toUpperCase(),
    ai.riskRating === "low" ? COLORS.green : ai.riskRating === "medium" ? COLORS.amber : COLORS.red);
  pdf.addMetricCard(pdf.margin + 2 * (cardW + gap2), pdf.y, cardW, "Business Impact", String(ai.businessImpactScore), COLORS.primary);
  pdf.y += 28;

  // AI Verdict
  pdf.addSubHeader("AI Verdict");
  pdf.addParagraph(ai.verdict);
  pdf.y += 3;

  // Strengths / Weaknesses
  pdf.addSectionHeader("Your Strengths", COLORS.green);
  ai.primaryStrengths.forEach((s) => pdf.addParagraph(`  + ${s}`, 8.5));
  pdf.y += 3;

  pdf.addSectionHeader("Areas to Improve", COLORS.amber);
  ai.primaryWeaknesses.forEach((w) => pdf.addParagraph(`  - ${w}`, 8.5));
  pdf.y += 3;

  // Strategic Suggestions
  pdf.addSectionHeader("Strategic Suggestions", COLORS.primary);
  ai.strategicSuggestions.forEach((s, i) => {
    pdf.addParagraph(`${i + 1}. ${s}`, 8.5);
  });
  pdf.y += 3;

  // Roadmap
  pdf.addSectionHeader("Improvement Roadmap", [139, 92, 246]);
  ai.improvementRoadmap.forEach((phase) => {
    pdf.addSubHeader(`${phase.timeframe}`);
    phase.actions.forEach((action) => {
      pdf.addParagraph(`  - ${action}`, 8);
    });
    pdf.y += 2;
  });

  // Success Matrix
  pdf.addSectionHeader("Success Matrix");
  const matrixHeaders = ["Metric", "Your Score", ...result.competitors.map((c) => getSiteLabel(c.url).substring(0, 12)), "Leader", "Gap"];
  const matrixRows = ai.successMatrix.map((row) => [
    row.metric,
    row.primary.toFixed(1),
    ...row.competitors.map((c) => c.value.toFixed(1)),
    getSiteLabel(row.leader),
    row.gap > 0 ? `-${row.gap.toFixed(1)}` : `+${Math.abs(row.gap).toFixed(1)}`,
  ]);
  pdf.addTable(matrixHeaders, matrixRows, { styles: { fontSize: 7 } });

  // Competitor Insights
  if (ai.competitorInsights.length > 0) {
    pdf.addSectionHeader("Competitor Insights");
    ai.competitorInsights.forEach((ci) => {
      pdf.addSubHeader(getSiteLabel(ci.url));
      if (ci.strengths.length > 0) {
        pdf.addParagraph("Strengths:", 8);
        ci.strengths.forEach((s) => pdf.addParagraph(`  + ${s}`, 8));
      }
      if (ci.weaknesses.length > 0) {
        pdf.addParagraph("Weaknesses:", 8);
        ci.weaknesses.forEach((w) => pdf.addParagraph(`  - ${w}`, 8));
      }
      pdf.y += 3;
    });
  }

  const filename = `VZY-Competition-Executive-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}
