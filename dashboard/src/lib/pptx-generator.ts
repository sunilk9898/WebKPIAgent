// ============================================================================
// PowerPoint (PPTX) Generator - Platform Analysis & Competition Reports
// ============================================================================

import PptxGenJS from "pptxgenjs";
import type {
  ComparisonResult, ComparisonSiteData, AIComparisonAnalysis,
  ScanReport, Finding, EnhancedRecommendation,
  SecurityMetadata, PerformanceMetadata, CodeQualityMetadata,
  Regression,
} from "@/types/api";

// ============================================================================
// COMPETITION ANALYSIS - Brand Colors (Light Theme)
// ============================================================================
const BRAND = {
  blue: "2563EB",
  blueLight: "DBEAFE",
  dark: "111827",
  text: "1F2937",
  textLight: "6B7280",
  white: "FFFFFF",
  green: "16A34A",
  greenLight: "DCFCE7",
  amber: "D97706",
  amberLight: "FEF3C7",
  red: "DC2626",
  redLight: "FEE2E2",
  purple: "9333EA",
  surface: "F3F4F6",
  border: "E5E7EB",
  cyan: "0891B2",
};

// ============================================================================
// PLATFORM ANALYSIS - Dark Theme Colors
// ============================================================================
const DARK = {
  bg: "0F172A",
  text: "F1F5F9",
  textMuted: "94A3B8",
  blue: "3B82F6",
  green: "22C55E",
  red: "EF4444",
  amber: "F59E0B",
  purple: "A855F7",
  card: "1E293B",
  border: "334155",
  white: "FFFFFF",
};

// ── Helpers ──

function getSiteLabel(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function scoreColor(score: number): string {
  if (score >= 90) return BRAND.green;
  if (score >= 70) return BRAND.amber;
  return BRAND.red;
}

function riskColor(rating: string): string {
  if (rating === "low") return BRAND.green;
  if (rating === "medium") return BRAND.amber;
  return BRAND.red;
}

function darkScoreColor(score: number): string {
  if (score >= 90) return DARK.green;
  if (score >= 70) return DARK.amber;
  return DARK.red;
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return DARK.red;
    case "high": return DARK.amber;
    case "medium": return "FB923C";
    case "low": return DARK.blue;
    default: return DARK.textMuted;
  }
}

function trendIcon(direction: string): string {
  if (direction === "improving") return "▲";
  if (direction === "declining") return "▼";
  return "●";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

// ── Dark theme master slide helper ──
function addDarkSlide(pptx: PptxGenJS, title: string, slideNum: number): PptxGenJS.Slide {
  const slide = pptx.addSlide({ masterName: "VZY_DARK" });

  // Title bar accent
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.08, h: 0.9,
    fill: { type: "solid", color: DARK.blue },
  });

  slide.addText(title, {
    x: 0.3, y: 0.15, w: 10, h: 0.6,
    fontSize: 22, bold: true, color: DARK.text,
    fontFace: "Helvetica",
  });

  // Slide number
  slide.addText(`${slideNum} / 14`, {
    x: 11.5, y: 0.2, w: 1.5, h: 0.4,
    fontSize: 9, color: DARK.textMuted,
    fontFace: "Helvetica", align: "right",
  });

  // Footer line
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.3, y: 7.1, w: 12.73, h: 0.01,
    fill: { type: "solid", color: DARK.border },
  });

  slide.addText("VZY OTT AI Agent | Confidential", {
    x: 0.3, y: 7.15, w: 6, h: 0.25,
    fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica",
  });

  slide.addText(new Date().toLocaleDateString(), {
    x: 7, y: 7.15, w: 6, h: 0.25,
    fontSize: 7, color: DARK.textMuted,
    fontFace: "Helvetica", align: "right",
  });

  return slide;
}

// ── Dark card shape helper ──
function addCard(
  slide: PptxGenJS.Slide, pptx: PptxGenJS,
  x: number, y: number, w: number, h: number,
): void {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { type: "solid", color: DARK.card },
    rectRadius: 0.08,
    line: { color: DARK.border, width: 0.5 },
  });
}

// ============================================================================
// COMPETITION ANALYSIS - Slide Master (Light Theme) - unchanged from original
// ============================================================================
function addBrandedSlide(pptx: PptxGenJS, title: string): PptxGenJS.Slide {
  const slide = pptx.addSlide();

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.7,
    fill: { type: "solid", color: BRAND.blue },
  });

  slide.addText(title, {
    x: 0.4, y: 0.1, w: 8, h: 0.5,
    fontSize: 18, bold: true, color: BRAND.white,
    fontFace: "Helvetica",
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.2, w: "100%", h: 0.3,
    fill: { type: "solid", color: BRAND.surface },
  });

  slide.addText("VZY OTT Verification Agent | Confidential", {
    x: 0.4, y: 7.22, w: 5, h: 0.25,
    fontSize: 7, color: BRAND.textLight, fontFace: "Helvetica",
  });

  slide.addText(new Date().toLocaleDateString(), {
    x: 7, y: 7.22, w: 2.5, h: 0.25,
    fontSize: 7, color: BRAND.textLight, fontFace: "Helvetica",
    align: "right",
  });

  return slide;
}

// ============================================================================
// PUBLIC: Generate Platform Analysis PPTX (14 slides, dark theme)
// ============================================================================
export async function generatePlatformAnalysisPPTX(report: ScanReport): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
  pptx.author = "VZY OTT AI Agent";
  pptx.subject = "Platform Analysis Report";

  // Define dark master slide
  pptx.defineSlideMaster({
    title: "VZY_DARK",
    background: { fill: DARK.bg },
  });

  // Extract agent metadata
  const perfResult = report.agentResults.find(a => a.agentType === "performance");
  const secResult = report.agentResults.find(a => a.agentType === "security");
  const cqResult = report.agentResults.find(a => a.agentType === "code-quality");

  const perfMeta = (perfResult?.metadata ?? {}) as Partial<PerformanceMetadata>;
  const secMeta = (secResult?.metadata ?? {}) as Partial<SecurityMetadata>;
  const cqMeta = (cqResult?.metadata ?? {}) as Partial<CodeQualityMetadata>;

  const kpi = report.kpiScore;
  const enhanced = report.enhancedRecommendations || [];
  const comparison = report.comparisonWithPrevious;
  const criticals = report.criticalFindings || [];
  const allFindings = report.agentResults.flatMap(a => a.findings);

  const critCount = allFindings.filter(f => f.severity === "critical").length;
  const highCount = allFindings.filter(f => f.severity === "high").length;
  const dateStr = new Date(report.generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ════════════════════════════════════════════════════════════════
  // SLIDE 1 - Title Slide
  // ════════════════════════════════════════════════════════════════
  const slide1 = pptx.addSlide({ masterName: "VZY_DARK" });

  // Accent stripe at top
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.06,
    fill: { type: "solid", color: DARK.blue },
  });

  // Decorative side bar
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: 1.8, w: 0.06, h: 2.8,
    fill: { type: "solid", color: DARK.blue },
  });

  slide1.addText("VZY OTT Platform Analysis", {
    x: 1.0, y: 2.0, w: 10, h: 1.0,
    fontSize: 36, bold: true, color: DARK.text,
    fontFace: "Helvetica",
  });

  slide1.addText("Report generated by VZY OTT AI Agent", {
    x: 1.0, y: 3.0, w: 10, h: 0.6,
    fontSize: 18, color: DARK.blue,
    fontFace: "Helvetica",
  });

  slide1.addText("Product Engineering — VZY Tech Team", {
    x: 1.0, y: 3.7, w: 10, h: 0.5,
    fontSize: 13, color: DARK.textMuted,
    fontFace: "Helvetica",
  });

  if (report.target.url) {
    slide1.addText(report.target.url, {
      x: 1.0, y: 4.3, w: 10, h: 0.4,
      fontSize: 11, color: DARK.textMuted,
      fontFace: "Helvetica",
    });
  }

  // Bottom bar with date
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 6.8, w: "100%", h: 0.7,
    fill: { type: "solid", color: DARK.card },
  });

  slide1.addText(dateStr, {
    x: 1.0, y: 6.9, w: 5, h: 0.4,
    fontSize: 11, color: DARK.textMuted, fontFace: "Helvetica",
  });

  slide1.addText("Confidential — DishTV / Watcho OTT", {
    x: 6, y: 6.9, w: 6.5, h: 0.4,
    fontSize: 9, color: DARK.textMuted,
    fontFace: "Helvetica", align: "right",
  });

  // ════════════════════════════════════════════════════════════════
  // SLIDE 2 - Overall Score Dashboard
  // ════════════════════════════════════════════════════════════════
  const passTitle = kpi.passesThreshold
    ? "Platform Health Meets Target"
    : "Current Platform Health Fails Threshold";
  const slide2 = addDarkSlide(pptx, passTitle, 2);

  // Overall score card (large, centered)
  addCard(slide2, pptx, 4.5, 1.2, 4.33, 2.4);
  slide2.addText("OVERALL KPI", {
    x: 4.5, y: 1.35, w: 4.33, h: 0.4,
    fontSize: 11, color: DARK.textMuted,
    fontFace: "Helvetica", align: "center",
  });
  slide2.addText(kpi.overallScore.toFixed(1), {
    x: 4.5, y: 1.8, w: 4.33, h: 1.0,
    fontSize: 48, bold: true, color: darkScoreColor(kpi.overallScore),
    fontFace: "Helvetica", align: "center",
  });
  slide2.addText(`/ 100    Target: 95`, {
    x: 4.5, y: 2.8, w: 4.33, h: 0.4,
    fontSize: 11, color: DARK.textMuted,
    fontFace: "Helvetica", align: "center",
  });
  slide2.addText(kpi.passesThreshold ? "PASS" : "FAIL", {
    x: 4.5, y: 3.2, w: 4.33, h: 0.3,
    fontSize: 12, bold: true,
    color: kpi.passesThreshold ? DARK.green : DARK.red,
    fontFace: "Helvetica", align: "center",
  });

  // Three pillar cards
  const pillars = [
    { label: "Security", weight: "40%", score: kpi.grades.security },
    { label: "Performance", weight: "35%", score: kpi.grades.performance },
    { label: "Code Quality", weight: "25%", score: kpi.grades.codeQuality },
  ];

  pillars.forEach((p, i) => {
    const px = 0.5 + i * 4.2;
    addCard(slide2, pptx, px, 4.1, 3.8, 2.5);
    slide2.addText(`${p.label} (${p.weight})`, {
      x: px, y: 4.25, w: 3.8, h: 0.35,
      fontSize: 11, color: DARK.textMuted,
      fontFace: "Helvetica", align: "center",
    });
    slide2.addText(p.score.rawScore.toFixed(1), {
      x: px, y: 4.7, w: 3.8, h: 0.7,
      fontSize: 32, bold: true, color: darkScoreColor(p.score.rawScore),
      fontFace: "Helvetica", align: "center",
    });
    slide2.addText(`Weighted: ${p.score.weightedScore.toFixed(1)}`, {
      x: px, y: 5.5, w: 3.8, h: 0.3,
      fontSize: 10, color: DARK.textMuted,
      fontFace: "Helvetica", align: "center",
    });
    // Top breakdown items
    const bkItems = p.score.breakdown.slice(0, 3);
    bkItems.forEach((bk, j) => {
      slide2.addText(`${bk.metric}: ${bk.actualScore}/${bk.maxScore}`, {
        x: px + 0.2, y: 5.85 + j * 0.22, w: 3.4, h: 0.2,
        fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica",
      });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // SLIDE 3 - Executive Threat and Trend Briefing
  // ════════════════════════════════════════════════════════════════
  const slide3 = addDarkSlide(pptx, "Executive Threat & Trend Briefing", 3);

  // Top KPI row
  const briefCards = [
    { label: "Critical Findings", value: String(critCount), color: DARK.red },
    { label: "High Findings", value: String(highCount), color: DARK.amber },
    { label: "Trend", value: `${trendIcon(kpi.trend.direction)} ${kpi.trend.direction.toUpperCase()}`, color: kpi.trend.direction === "improving" ? DARK.green : kpi.trend.direction === "declining" ? DARK.red : DARK.amber },
    { label: "Score Delta", value: `${kpi.trend.delta >= 0 ? "+" : ""}${kpi.trend.delta.toFixed(1)}`, color: kpi.trend.delta >= 0 ? DARK.green : DARK.red },
  ];

  briefCards.forEach((c, i) => {
    const cx = 0.5 + i * 3.2;
    addCard(slide3, pptx, cx, 1.2, 2.9, 1.3);
    slide3.addText(c.label, {
      x: cx, y: 1.3, w: 2.9, h: 0.35,
      fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
    });
    slide3.addText(c.value, {
      x: cx, y: 1.65, w: 2.9, h: 0.55,
      fontSize: 22, bold: true, color: c.color, fontFace: "Helvetica", align: "center",
    });
  });

  // Top priority risk
  addCard(slide3, pptx, 0.5, 2.8, 12.33, 1.8);
  slide3.addText("TOP PRIORITY RISK", {
    x: 0.7, y: 2.9, w: 4, h: 0.35,
    fontSize: 10, bold: true, color: DARK.red, fontFace: "Helvetica",
  });

  const topRisk = criticals[0];
  if (topRisk) {
    slide3.addText(topRisk.title, {
      x: 0.7, y: 3.25, w: 11.93, h: 0.35,
      fontSize: 13, bold: true, color: DARK.text, fontFace: "Helvetica",
    });
    slide3.addText(topRisk.description.slice(0, 300), {
      x: 0.7, y: 3.6, w: 11.93, h: 0.5,
      fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", wrap: true,
    });
    slide3.addText(`Remediation: ${topRisk.remediation.slice(0, 200)}`, {
      x: 0.7, y: 4.1, w: 11.93, h: 0.35,
      fontSize: 8, color: DARK.blue, fontFace: "Helvetica", wrap: true,
    });
  } else {
    slide3.addText("No critical findings detected.", {
      x: 0.7, y: 3.3, w: 11.93, h: 0.4,
      fontSize: 12, color: DARK.green, fontFace: "Helvetica",
    });
  }

  // Regressions vs resolved
  const regressionsCount = kpi.regressions.length;
  const resolvedCount = comparison?.resolvedFindings?.length ?? 0;

  addCard(slide3, pptx, 0.5, 4.9, 6, 1.8);
  slide3.addText("Regressions", {
    x: 0.7, y: 5.0, w: 3, h: 0.3,
    fontSize: 10, bold: true, color: DARK.amber, fontFace: "Helvetica",
  });
  slide3.addText(String(regressionsCount), {
    x: 0.7, y: 5.3, w: 2, h: 0.6,
    fontSize: 28, bold: true, color: regressionsCount > 0 ? DARK.red : DARK.green, fontFace: "Helvetica",
  });
  slide3.addText("metrics degraded since last scan", {
    x: 2.5, y: 5.45, w: 3.8, h: 0.3,
    fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica",
  });

  addCard(slide3, pptx, 6.83, 4.9, 6, 1.8);
  slide3.addText("Resolved", {
    x: 7.03, y: 5.0, w: 3, h: 0.3,
    fontSize: 10, bold: true, color: DARK.green, fontFace: "Helvetica",
  });
  slide3.addText(String(resolvedCount), {
    x: 7.03, y: 5.3, w: 2, h: 0.6,
    fontSize: 28, bold: true, color: DARK.green, fontFace: "Helvetica",
  });
  slide3.addText("findings resolved since last scan", {
    x: 8.83, y: 5.45, w: 3.8, h: 0.3,
    fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica",
  });

  // ════════════════════════════════════════════════════════════════
  // SLIDE 4 - Security: OWASP & Critical Vulnerabilities
  // ════════════════════════════════════════════════════════════════
  const slide4 = addDarkSlide(pptx, "Security: OWASP & Critical Vulnerabilities", 4);

  // Security score badge
  addCard(slide4, pptx, 10.5, 1.1, 2.33, 1.2);
  slide4.addText("Security Score", {
    x: 10.5, y: 1.15, w: 2.33, h: 0.3,
    fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  slide4.addText(kpi.grades.security.rawScore.toFixed(1), {
    x: 10.5, y: 1.45, w: 2.33, h: 0.6,
    fontSize: 28, bold: true, color: darkScoreColor(kpi.grades.security.rawScore),
    fontFace: "Helvetica", align: "center",
  });

  // OWASP findings table
  const owaspFindings = secMeta.owaspFindings ?? [];
  if (owaspFindings.length > 0) {
    const owaspHeader: PptxGenJS.TableRow = [
      { text: "Category", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue } } },
      { text: "Finding", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue } } },
      { text: "Risk", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
      { text: "Details", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue } } },
    ];

    const owaspRows: PptxGenJS.TableRow[] = owaspFindings.slice(0, 8).map(o => [
      { text: o.category, options: { fontSize: 7, color: DARK.text, fill: { color: DARK.card } } },
      { text: o.name, options: { fontSize: 7, color: DARK.text, fill: { color: DARK.card } } },
      { text: o.risk.toUpperCase(), options: { fontSize: 7, color: severityColor(o.risk), fill: { color: DARK.card }, align: "center" as const, bold: true } },
      { text: o.details.slice(0, 80), options: { fontSize: 7, color: DARK.textMuted, fill: { color: DARK.card } } },
    ]);

    slide4.addTable([owaspHeader, ...owaspRows], {
      x: 0.5, y: 1.2, w: 9.7,
      colW: [2.0, 2.5, 1.0, 4.2],
      border: { type: "solid", color: DARK.border, pt: 0.5 },
      rowH: 0.35,
      autoPage: false,
    });
  } else {
    slide4.addText("No OWASP findings detected.", {
      x: 0.5, y: 1.5, w: 9, h: 0.4,
      fontSize: 11, color: DARK.green, fontFace: "Helvetica",
    });
  }

  // Critical vulnerabilities section
  const secFindings = (secResult?.findings ?? []).filter(f => f.severity === "critical" || f.severity === "high");
  const vulnY = owaspFindings.length > 0 ? 1.2 + 0.35 * Math.min(owaspFindings.length + 1, 9) + 0.3 : 2.2;

  slide4.addText("Critical & High Vulnerabilities", {
    x: 0.5, y: vulnY, w: 8, h: 0.4,
    fontSize: 12, bold: true, color: DARK.red, fontFace: "Helvetica",
  });

  if (secFindings.length > 0) {
    secFindings.slice(0, 5).forEach((f, i) => {
      const fy = vulnY + 0.5 + i * 0.55;
      slide4.addText(`[${f.severity.toUpperCase()}]`, {
        x: 0.7, y: fy, w: 1.2, h: 0.25,
        fontSize: 8, bold: true, color: severityColor(f.severity), fontFace: "Helvetica",
      });
      slide4.addText(f.title, {
        x: 1.9, y: fy, w: 7, h: 0.25,
        fontSize: 9, bold: true, color: DARK.text, fontFace: "Helvetica",
      });
      slide4.addText(f.description.slice(0, 120), {
        x: 1.9, y: fy + 0.25, w: 10, h: 0.22,
        fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica",
      });
    });
  } else {
    slide4.addText("No critical or high security vulnerabilities found.", {
      x: 0.7, y: vulnY + 0.5, w: 10, h: 0.3,
      fontSize: 10, color: DARK.green, fontFace: "Helvetica",
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 5 - Security: API and Token Risks
  // ════════════════════════════════════════════════════════════════
  const slide5 = addDarkSlide(pptx, "Security: API & Token Risks", 5);

  // API Exposure
  const apiExposures = secMeta.apiExposure ?? [];
  addCard(slide5, pptx, 0.5, 1.2, 8.5, 2.6);
  slide5.addText("API Exposure Analysis", {
    x: 0.7, y: 1.3, w: 5, h: 0.35,
    fontSize: 12, bold: true, color: DARK.blue, fontFace: "Helvetica",
  });
  slide5.addText(`${apiExposures.length} endpoints analyzed`, {
    x: 5.5, y: 1.3, w: 3.3, h: 0.35,
    fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", align: "right",
  });

  const unauthAPIs = apiExposures.filter(a => !a.authenticated);
  const sensitiveAPIs = apiExposures.filter(a => a.sensitiveData);
  const noRateLimitAPIs = apiExposures.filter(a => !a.rateLimit);

  const apiStats = [
    { label: "Unauthenticated", count: unauthAPIs.length, color: unauthAPIs.length > 0 ? DARK.red : DARK.green },
    { label: "Sensitive Data Exposed", count: sensitiveAPIs.length, color: sensitiveAPIs.length > 0 ? DARK.red : DARK.green },
    { label: "No Rate Limiting", count: noRateLimitAPIs.length, color: noRateLimitAPIs.length > 0 ? DARK.amber : DARK.green },
  ];

  apiStats.forEach((s, i) => {
    slide5.addText(s.label, {
      x: 0.9, y: 1.8 + i * 0.45, w: 4, h: 0.3,
      fontSize: 9, color: DARK.text, fontFace: "Helvetica",
    });
    slide5.addText(String(s.count), {
      x: 5.5, y: 1.8 + i * 0.45, w: 1.5, h: 0.3,
      fontSize: 11, bold: true, color: s.color, fontFace: "Helvetica", align: "center",
    });
  });

  // Sample exposed endpoints
  if (unauthAPIs.length > 0) {
    const sampleAPIs = unauthAPIs.slice(0, 3);
    sampleAPIs.forEach((api, i) => {
      slide5.addText(`${api.method} ${api.endpoint}`, {
        x: 0.9, y: 3.15 + i * 0.2, w: 7.8, h: 0.2,
        fontSize: 7, color: DARK.amber, fontFace: "Courier New",
      });
    });
  }

  // Token Leaks
  const tokenLeaks = secMeta.tokenLeaks ?? [];
  addCard(slide5, pptx, 9.33, 1.2, 3.5, 2.6);
  slide5.addText("Token Leaks", {
    x: 9.53, y: 1.3, w: 3.1, h: 0.35,
    fontSize: 11, bold: true, color: tokenLeaks.length > 0 ? DARK.red : DARK.green,
    fontFace: "Helvetica",
  });
  slide5.addText(String(tokenLeaks.length), {
    x: 9.53, y: 1.7, w: 3.1, h: 0.6,
    fontSize: 28, bold: true, color: tokenLeaks.length > 0 ? DARK.red : DARK.green,
    fontFace: "Helvetica", align: "center",
  });
  tokenLeaks.slice(0, 3).forEach((t, i) => {
    slide5.addText(`${t.type} @ ${t.location.slice(0, 30)}`, {
      x: 9.53, y: 2.4 + i * 0.25, w: 3.1, h: 0.2,
      fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica",
    });
  });

  // Insecure cookies / headers / SSL
  const headerMeta = secMeta.headerAnalysis;
  const sslMeta = secMeta.sslAnalysis;
  const corsMeta = secMeta.corsAnalysis;

  addCard(slide5, pptx, 0.5, 4.1, 4, 2.8);
  slide5.addText("Header Analysis", {
    x: 0.7, y: 4.2, w: 3.6, h: 0.3,
    fontSize: 10, bold: true, color: DARK.blue, fontFace: "Helvetica",
  });
  if (headerMeta) {
    slide5.addText(`Score: ${headerMeta.score}`, {
      x: 0.7, y: 4.55, w: 3.6, h: 0.25,
      fontSize: 9, color: darkScoreColor(headerMeta.score), fontFace: "Helvetica", bold: true,
    });
    slide5.addText(`Missing: ${headerMeta.missing.slice(0, 5).join(", ")}`, {
      x: 0.7, y: 4.85, w: 3.6, h: 0.5,
      fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica", wrap: true,
    });
    slide5.addText(`Misconfigured: ${headerMeta.misconfigured.length}`, {
      x: 0.7, y: 5.4, w: 3.6, h: 0.25,
      fontSize: 8, color: headerMeta.misconfigured.length > 0 ? DARK.amber : DARK.green, fontFace: "Helvetica",
    });
  }

  addCard(slide5, pptx, 4.83, 4.1, 4, 2.8);
  slide5.addText("SSL/TLS", {
    x: 5.03, y: 4.2, w: 3.6, h: 0.3,
    fontSize: 10, bold: true, color: DARK.blue, fontFace: "Helvetica",
  });
  if (sslMeta) {
    slide5.addText(`Grade: ${sslMeta.grade}`, {
      x: 5.03, y: 4.55, w: 3.6, h: 0.25,
      fontSize: 11, bold: true, color: sslMeta.grade === "A" || sslMeta.grade === "A+" ? DARK.green : DARK.amber, fontFace: "Helvetica",
    });
    slide5.addText(`Protocol: ${sslMeta.protocol}`, {
      x: 5.03, y: 4.85, w: 3.6, h: 0.25,
      fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica",
    });
    slide5.addText(`HSTS: ${sslMeta.hsts ? "Enabled" : "Disabled"}`, {
      x: 5.03, y: 5.1, w: 3.6, h: 0.25,
      fontSize: 8, color: sslMeta.hsts ? DARK.green : DARK.red, fontFace: "Helvetica",
    });
    slide5.addText(`Issues: ${sslMeta.issues.length}`, {
      x: 5.03, y: 5.35, w: 3.6, h: 0.25,
      fontSize: 8, color: sslMeta.issues.length > 0 ? DARK.amber : DARK.green, fontFace: "Helvetica",
    });
  }

  addCard(slide5, pptx, 9.16, 4.1, 3.67, 2.8);
  slide5.addText("CORS", {
    x: 9.36, y: 4.2, w: 3.27, h: 0.3,
    fontSize: 10, bold: true, color: DARK.blue, fontFace: "Helvetica",
  });
  if (corsMeta) {
    slide5.addText(`Wildcard: ${corsMeta.wildcardDetected ? "YES" : "No"}`, {
      x: 9.36, y: 4.55, w: 3.27, h: 0.25,
      fontSize: 9, color: corsMeta.wildcardDetected ? DARK.red : DARK.green, fontFace: "Helvetica", bold: true,
    });
    slide5.addText(`Credentials: ${corsMeta.allowCredentials ? "Allowed" : "Denied"}`, {
      x: 9.36, y: 4.85, w: 3.27, h: 0.25,
      fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica",
    });
    slide5.addText(`Issues: ${corsMeta.issues.length}`, {
      x: 9.36, y: 5.1, w: 3.27, h: 0.25,
      fontSize: 8, color: corsMeta.issues.length > 0 ? DARK.amber : DARK.green, fontFace: "Helvetica",
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 6 - Performance: Latency Bottlenecks
  // ════════════════════════════════════════════════════════════════
  const slide6 = addDarkSlide(pptx, "Performance: Latency Bottlenecks", 6);

  // Performance score badge
  addCard(slide6, pptx, 10.5, 1.1, 2.33, 1.2);
  slide6.addText("Perf Score", {
    x: 10.5, y: 1.15, w: 2.33, h: 0.3,
    fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  slide6.addText(kpi.grades.performance.rawScore.toFixed(1), {
    x: 10.5, y: 1.45, w: 2.33, h: 0.6,
    fontSize: 28, bold: true, color: darkScoreColor(kpi.grades.performance.rawScore),
    fontFace: "Helvetica", align: "center",
  });

  // Core Web Vitals table
  const cwv = perfMeta.coreWebVitals ?? {};
  const cwvKeys = Object.keys(cwv);

  if (cwvKeys.length > 0) {
    const cwvHeader: PptxGenJS.TableRow = [
      { text: "Metric", options: { bold: true, fontSize: 9, color: DARK.text, fill: { color: DARK.blue } } },
      { text: "Value", options: { bold: true, fontSize: 9, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
      { text: "Rating", options: { bold: true, fontSize: 9, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
    ];

    const cwvRows: PptxGenJS.TableRow[] = cwvKeys.map(key => {
      const metric = cwv[key];
      const ratingColor = metric.rating === "good" ? DARK.green : metric.rating === "poor" ? DARK.red : DARK.amber;
      return [
        { text: key.toUpperCase(), options: { fontSize: 9, color: DARK.text, fill: { color: DARK.card }, bold: true } },
        { text: typeof metric.value === "number" && metric.value > 10 ? formatMs(metric.value) : String(metric.value), options: { fontSize: 9, color: DARK.text, fill: { color: DARK.card }, align: "center" as const } },
        { text: metric.rating.toUpperCase(), options: { fontSize: 9, color: ratingColor, fill: { color: DARK.card }, align: "center" as const, bold: true } },
      ];
    });

    slide6.addTable([cwvHeader, ...cwvRows], {
      x: 0.5, y: 1.2, w: 9.7,
      colW: [3.5, 3.1, 3.1],
      border: { type: "solid", color: DARK.border, pt: 0.5 },
      rowH: 0.38,
      autoPage: false,
    });
  }

  // Lighthouse scores row
  const lh = perfMeta.lighthouse;
  if (lh) {
    const lhY = cwvKeys.length > 0 ? 1.2 + 0.38 * (cwvKeys.length + 1) + 0.3 : 1.5;
    slide6.addText("Lighthouse Scores", {
      x: 0.5, y: lhY, w: 5, h: 0.35,
      fontSize: 11, bold: true, color: DARK.blue, fontFace: "Helvetica",
    });

    if (lh.estimated) {
      slide6.addText("(estimated)", {
        x: 4.0, y: lhY, w: 2, h: 0.35,
        fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica",
      });
    }

    const lhMetrics = [
      { label: "Performance", value: lh.performanceScore },
      { label: "Accessibility", value: lh.accessibilityScore },
      { label: "Best Practices", value: lh.bestPracticesScore },
      { label: "SEO", value: lh.seoScore },
    ];

    lhMetrics.forEach((m, i) => {
      const mx = 0.5 + i * 2.5;
      addCard(slide6, pptx, mx, lhY + 0.45, 2.2, 1.1);
      slide6.addText(m.label, {
        x: mx, y: lhY + 0.5, w: 2.2, h: 0.3,
        fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
      });
      slide6.addText(String(m.value), {
        x: mx, y: lhY + 0.8, w: 2.2, h: 0.5,
        fontSize: 20, bold: true, color: darkScoreColor(m.value),
        fontFace: "Helvetica", align: "center",
      });
    });
  }

  // Player metrics snippet
  const player = perfMeta.playerMetrics;
  if (player) {
    addCard(slide6, pptx, 0.5, 5.5, 12.33, 1.3);
    slide6.addText("Player Performance", {
      x: 0.7, y: 5.55, w: 3, h: 0.3,
      fontSize: 10, bold: true, color: DARK.purple, fontFace: "Helvetica",
    });
    const playerStats = [
      `Startup: ${formatMs(player.startupDelay)}`,
      `TTFF: ${formatMs(player.timeToFirstFrame)}`,
      `Buffer Ratio: ${(player.bufferRatio * 100).toFixed(1)}%`,
      `Rebuffer Events: ${player.rebufferEvents}`,
      `ABR Switches: ${player.abrSwitchCount}`,
      `DRM License: ${formatMs(player.drmLicenseTime)}`,
    ];
    slide6.addText(playerStats.join("    |    "), {
      x: 0.7, y: 5.9, w: 11.93, h: 0.6,
      fontSize: 9, color: DARK.text, fontFace: "Helvetica", wrap: true,
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 7 - Performance: JavaScript Payload
  // ════════════════════════════════════════════════════════════════
  const slide7 = addDarkSlide(pptx, "Performance: JavaScript Payload & Resources", 7);

  const resources = perfMeta.resourceMetrics;
  if (resources) {
    // Resource breakdown cards
    const resItems = [
      { label: "JavaScript", size: resources.jsSize, color: DARK.amber },
      { label: "CSS", size: resources.cssSize, color: DARK.blue },
      { label: "Fonts", size: resources.fontSize, color: DARK.purple },
      { label: "Images", size: resources.imageSize, color: DARK.green },
      { label: "3rd Party", size: resources.thirdPartySize, color: DARK.red },
    ];

    resItems.forEach((r, i) => {
      const rx = 0.5 + i * 2.53;
      addCard(slide7, pptx, rx, 1.2, 2.23, 1.5);
      slide7.addText(r.label, {
        x: rx, y: 1.3, w: 2.23, h: 0.3,
        fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
      });
      slide7.addText(formatBytes(r.size), {
        x: rx, y: 1.6, w: 2.23, h: 0.5,
        fontSize: 18, bold: true, color: r.color, fontFace: "Helvetica", align: "center",
      });
      const pct = resources.totalSize > 0 ? ((r.size / resources.totalSize) * 100).toFixed(0) : "0";
      slide7.addText(`${pct}% of total`, {
        x: rx, y: 2.15, w: 2.23, h: 0.25,
        fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
      });
    });

    // Total + request count
    addCard(slide7, pptx, 0.5, 3.0, 6, 1.2);
    slide7.addText("Total Payload", {
      x: 0.7, y: 3.05, w: 3, h: 0.3,
      fontSize: 10, bold: true, color: DARK.text, fontFace: "Helvetica",
    });
    slide7.addText(formatBytes(resources.totalSize), {
      x: 0.7, y: 3.35, w: 3, h: 0.5,
      fontSize: 24, bold: true, color: resources.totalSize > 3_000_000 ? DARK.red : resources.totalSize > 1_500_000 ? DARK.amber : DARK.green,
      fontFace: "Helvetica",
    });
    slide7.addText(`${resources.requestCount} requests`, {
      x: 3.7, y: 3.35, w: 2.5, h: 0.5,
      fontSize: 11, color: DARK.textMuted, fontFace: "Helvetica",
    });

    // Render blocking
    addCard(slide7, pptx, 6.83, 3.0, 6, 1.2);
    slide7.addText("Render-Blocking Resources", {
      x: 7.03, y: 3.05, w: 5, h: 0.3,
      fontSize: 10, bold: true, color: DARK.amber, fontFace: "Helvetica",
    });
    const blocking = resources.renderBlockingResources.slice(0, 4);
    blocking.forEach((rb, i) => {
      slide7.addText(`• ${rb.slice(0, 60)}`, {
        x: 7.03, y: 3.4 + i * 0.2, w: 5.6, h: 0.2,
        fontSize: 7, color: DARK.textMuted, fontFace: "Courier New",
      });
    });

    // Uncompressed assets
    const uncompressed = resources.uncompressedAssets ?? [];
    if (uncompressed.length > 0) {
      addCard(slide7, pptx, 0.5, 4.5, 12.33, 2.2);
      slide7.addText(`Uncompressed Assets (${uncompressed.length})`, {
        x: 0.7, y: 4.6, w: 8, h: 0.3,
        fontSize: 10, bold: true, color: DARK.red, fontFace: "Helvetica",
      });
      uncompressed.slice(0, 8).forEach((ua, i) => {
        const col = i < 4 ? 0 : 1;
        const row = i % 4;
        slide7.addText(`• ${ua.slice(0, 55)}`, {
          x: 0.9 + col * 6, y: 5.0 + row * 0.25, w: 5.8, h: 0.22,
          fontSize: 7, color: DARK.textMuted, fontFace: "Courier New",
        });
      });
    }
  } else {
    slide7.addText("No resource metrics available.", {
      x: 0.5, y: 2.0, w: 10, h: 0.5,
      fontSize: 13, color: DARK.textMuted, fontFace: "Helvetica",
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 8 - Code Quality
  // ════════════════════════════════════════════════════════════════
  const slide8 = addDarkSlide(pptx, "Code Quality Analysis", 8);

  // Score badge
  addCard(slide8, pptx, 10.5, 1.1, 2.33, 1.2);
  slide8.addText("CQ Score", {
    x: 10.5, y: 1.15, w: 2.33, h: 0.3,
    fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  slide8.addText(kpi.grades.codeQuality.rawScore.toFixed(1), {
    x: 10.5, y: 1.45, w: 2.33, h: 0.6,
    fontSize: 28, bold: true, color: darkScoreColor(kpi.grades.codeQuality.rawScore),
    fontFace: "Helvetica", align: "center",
  });

  // Static analysis summary
  const lint = cqMeta.lintResults;
  const complexity = cqMeta.complexity;

  addCard(slide8, pptx, 0.5, 1.2, 4.8, 2.5);
  slide8.addText("Static Analysis (Lint)", {
    x: 0.7, y: 1.3, w: 4.4, h: 0.3,
    fontSize: 11, bold: true, color: DARK.blue, fontFace: "Helvetica",
  });
  if (lint) {
    const lintStats = [
      { label: "Errors", value: String(lint.errors), color: DARK.red },
      { label: "Warnings", value: String(lint.warnings), color: DARK.amber },
      { label: "Fixable", value: String(lint.fixable), color: DARK.green },
    ];
    lintStats.forEach((ls, i) => {
      slide8.addText(ls.label, {
        x: 0.9, y: 1.7 + i * 0.4, w: 2, h: 0.3,
        fontSize: 10, color: DARK.text, fontFace: "Helvetica",
      });
      slide8.addText(ls.value, {
        x: 3.0, y: 1.7 + i * 0.4, w: 2, h: 0.3,
        fontSize: 14, bold: true, color: ls.color, fontFace: "Helvetica",
      });
    });
    // Top rules
    const topRules = lint.rules.slice(0, 3);
    topRules.forEach((r, i) => {
      slide8.addText(`${r.rule} (${r.count}x)`, {
        x: 0.9, y: 2.95 + i * 0.2, w: 4.2, h: 0.2,
        fontSize: 7, color: DARK.textMuted, fontFace: "Courier New",
      });
    });
  }

  // Complexity
  addCard(slide8, pptx, 5.63, 1.2, 4.55, 2.5);
  slide8.addText("Complexity Metrics", {
    x: 5.83, y: 1.3, w: 4.15, h: 0.3,
    fontSize: 11, bold: true, color: DARK.purple, fontFace: "Helvetica",
  });
  if (complexity) {
    const cxItems = [
      { label: "Avg Cyclomatic", value: complexity.avgCyclomaticComplexity.toFixed(1) },
      { label: "Max Cyclomatic", value: String(complexity.maxCyclomaticComplexity) },
      { label: "Avg Cognitive", value: complexity.avgCognitiveComplexity.toFixed(1) },
      { label: "Max Cognitive", value: String(complexity.maxCognitiveComplexity) },
      { label: "Duplicate Blocks", value: String(complexity.duplicateBlocks) },
      { label: "Tech Debt", value: complexity.technicalDebt },
    ];
    cxItems.forEach((cx, i) => {
      slide8.addText(cx.label, {
        x: 5.83, y: 1.7 + i * 0.35, w: 2.8, h: 0.28,
        fontSize: 8, color: DARK.text, fontFace: "Helvetica",
      });
      slide8.addText(cx.value, {
        x: 8.63, y: 1.7 + i * 0.35, w: 1.35, h: 0.28,
        fontSize: 9, bold: true, color: DARK.text, fontFace: "Helvetica", align: "right",
      });
    });
  }

  // Anti-patterns
  const antiPatterns = cqMeta.antiPatterns ?? [];
  addCard(slide8, pptx, 0.5, 4.0, 12.33, 2.8);
  slide8.addText(`Anti-Patterns Found (${antiPatterns.length})`, {
    x: 0.7, y: 4.1, w: 8, h: 0.3,
    fontSize: 11, bold: true, color: DARK.amber, fontFace: "Helvetica",
  });

  if (antiPatterns.length > 0) {
    const apHeader: PptxGenJS.TableRow = [
      { text: "Pattern", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue } } },
      { text: "File", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue } } },
      { text: "Severity", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
      { text: "Suggestion", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue } } },
    ];

    const apRows: PptxGenJS.TableRow[] = antiPatterns.slice(0, 7).map(ap => [
      { text: ap.pattern, options: { fontSize: 7, color: DARK.text, fill: { color: DARK.card } } },
      { text: `${ap.file}:${ap.line}`, options: { fontSize: 7, color: DARK.textMuted, fill: { color: DARK.card } } },
      { text: ap.severity.toUpperCase(), options: { fontSize: 7, color: severityColor(ap.severity), fill: { color: DARK.card }, align: "center" as const, bold: true } },
      { text: ap.suggestion.slice(0, 60), options: { fontSize: 7, color: DARK.textMuted, fill: { color: DARK.card } } },
    ]);

    slide8.addTable([apHeader, ...apRows], {
      x: 0.7, y: 4.5, w: 11.93,
      colW: [2.5, 3.0, 1.2, 5.23],
      border: { type: "solid", color: DARK.border, pt: 0.5 },
      rowH: 0.3,
      autoPage: false,
    });
  } else {
    slide8.addText("No anti-patterns detected.", {
      x: 0.7, y: 4.5, w: 10, h: 0.3,
      fontSize: 10, color: DARK.green, fontFace: "Helvetica",
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 9 - Regression Analysis
  // ════════════════════════════════════════════════════════════════
  const slide9 = addDarkSlide(pptx, "Regression Analysis", 9);

  const regressions = kpi.regressions;

  // Summary cards
  addCard(slide9, pptx, 0.5, 1.2, 3, 1.5);
  slide9.addText("Total Regressions", {
    x: 0.5, y: 1.3, w: 3, h: 0.3,
    fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  slide9.addText(String(regressions.length), {
    x: 0.5, y: 1.6, w: 3, h: 0.7,
    fontSize: 36, bold: true, color: regressions.length > 0 ? DARK.red : DARK.green,
    fontFace: "Helvetica", align: "center",
  });

  addCard(slide9, pptx, 3.8, 1.2, 3, 1.5);
  slide9.addText("Previous Score", {
    x: 3.8, y: 1.3, w: 3, h: 0.3,
    fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  const prevScore = comparison ? kpi.overallScore - comparison.scoreDelta : kpi.overallScore;
  slide9.addText(prevScore.toFixed(1), {
    x: 3.8, y: 1.6, w: 3, h: 0.7,
    fontSize: 28, bold: true, color: darkScoreColor(prevScore),
    fontFace: "Helvetica", align: "center",
  });

  addCard(slide9, pptx, 7.1, 1.2, 3, 1.5);
  slide9.addText("Current Score", {
    x: 7.1, y: 1.3, w: 3, h: 0.3,
    fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  slide9.addText(kpi.overallScore.toFixed(1), {
    x: 7.1, y: 1.6, w: 3, h: 0.7,
    fontSize: 28, bold: true, color: darkScoreColor(kpi.overallScore),
    fontFace: "Helvetica", align: "center",
  });

  addCard(slide9, pptx, 10.4, 1.2, 2.43, 1.5);
  slide9.addText("Delta", {
    x: 10.4, y: 1.3, w: 2.43, h: 0.3,
    fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  const scoreDelta = comparison?.scoreDelta ?? 0;
  slide9.addText(`${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(1)}`, {
    x: 10.4, y: 1.6, w: 2.43, h: 0.7,
    fontSize: 28, bold: true, color: scoreDelta >= 0 ? DARK.green : DARK.red,
    fontFace: "Helvetica", align: "center",
  });

  // Regressions detail table
  if (regressions.length > 0) {
    const regHeader: PptxGenJS.TableRow = [
      { text: "Metric", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue } } },
      { text: "Previous", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
      { text: "Current", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
      { text: "Delta", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
      { text: "Severity", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
      { text: "Agent", options: { bold: true, fontSize: 8, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
    ];

    const regRows: PptxGenJS.TableRow[] = regressions.slice(0, 10).map(r => [
      { text: r.metric, options: { fontSize: 8, color: DARK.text, fill: { color: DARK.card } } },
      { text: r.previousValue.toFixed(1), options: { fontSize: 8, color: DARK.textMuted, fill: { color: DARK.card }, align: "center" as const } },
      { text: r.currentValue.toFixed(1), options: { fontSize: 8, color: DARK.text, fill: { color: DARK.card }, align: "center" as const } },
      { text: `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(1)}`, options: { fontSize: 8, color: r.delta < 0 ? DARK.red : DARK.green, fill: { color: DARK.card }, align: "center" as const, bold: true } },
      { text: r.severity.toUpperCase(), options: { fontSize: 8, color: severityColor(r.severity), fill: { color: DARK.card }, align: "center" as const, bold: true } },
      { text: r.agent, options: { fontSize: 8, color: DARK.textMuted, fill: { color: DARK.card }, align: "center" as const } },
    ]);

    slide9.addTable([regHeader, ...regRows], {
      x: 0.5, y: 3.0, w: 12.33,
      colW: [3.0, 1.8, 1.8, 1.6, 1.6, 2.53],
      border: { type: "solid", color: DARK.border, pt: 0.5 },
      rowH: 0.33,
      autoPage: false,
    });
  } else {
    slide9.addText("No regressions detected since the last scan.", {
      x: 0.5, y: 3.2, w: 10, h: 0.5,
      fontSize: 13, color: DARK.green, fontFace: "Helvetica",
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 10 - Remediation Target Matrix
  // ════════════════════════════════════════════════════════════════
  const slide10 = addDarkSlide(pptx, "Remediation Target Matrix", 10);

  const topRecs = enhanced.sort((a, b) => b.projectedScoreGain - a.projectedScoreGain).slice(0, 5);

  if (topRecs.length > 0) {
    slide10.addText("Top 5 Recommendations by Projected Score Gain", {
      x: 0.5, y: 1.1, w: 10, h: 0.35,
      fontSize: 10, color: DARK.textMuted, fontFace: "Helvetica",
    });

    topRecs.forEach((rec, i) => {
      const ry = 1.6 + i * 1.05;
      const barWidth = Math.max(0.5, (rec.projectedScoreGain / (topRecs[0].projectedScoreGain || 1)) * 8);

      // Priority number
      slide10.addText(`#${i + 1}`, {
        x: 0.5, y: ry, w: 0.5, h: 0.35,
        fontSize: 14, bold: true, color: DARK.blue, fontFace: "Helvetica",
      });

      // Title and description
      slide10.addText(rec.title, {
        x: 1.1, y: ry, w: 7.5, h: 0.3,
        fontSize: 10, bold: true, color: DARK.text, fontFace: "Helvetica",
      });

      // Gain bar
      slide10.addShape(pptx.ShapeType.rect, {
        x: 1.1, y: ry + 0.35, w: barWidth, h: 0.25,
        fill: { type: "solid", color: DARK.blue },
        rectRadius: 0.03,
      });

      slide10.addText(`+${rec.projectedScoreGain.toFixed(1)} pts`, {
        x: 1.1 + barWidth + 0.15, y: ry + 0.33, w: 2, h: 0.28,
        fontSize: 9, bold: true, color: DARK.green, fontFace: "Helvetica",
      });

      // Effort/Impact badges
      const effortColor = rec.effort === "low" ? DARK.green : rec.effort === "high" ? DARK.red : DARK.amber;
      slide10.addText(`Effort: ${rec.effort.toUpperCase()}`, {
        x: 10.0, y: ry, w: 1.5, h: 0.25,
        fontSize: 7, bold: true, color: effortColor, fontFace: "Helvetica", align: "center",
      });
      slide10.addText(`Impact: ${rec.impactScore}`, {
        x: 11.5, y: ry, w: 1.2, h: 0.25,
        fontSize: 7, bold: true, color: DARK.blue, fontFace: "Helvetica", align: "center",
      });
      slide10.addText(`Confidence: ${(rec.confidence * 100).toFixed(0)}%`, {
        x: 10.0, y: ry + 0.25, w: 2.7, h: 0.2,
        fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
      });
    });
  } else {
    slide10.addText("No enhanced recommendations available.", {
      x: 0.5, y: 2.0, w: 10, h: 0.5,
      fontSize: 13, color: DARK.textMuted, fontFace: "Helvetica",
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 11 - Quick Win Analysis
  // ════════════════════════════════════════════════════════════════
  const slide11 = addDarkSlide(pptx, "Quick Win Analysis", 11);

  const quickWins = enhanced.filter(r => r.quickWin).sort((a, b) => b.projectedScoreGain - a.projectedScoreGain);
  const bestQW = quickWins[0];

  if (bestQW) {
    // Best quick win spotlight
    addCard(slide11, pptx, 0.5, 1.2, 12.33, 3.0);

    slide11.addText("BEST QUICK WIN", {
      x: 0.7, y: 1.3, w: 3, h: 0.35,
      fontSize: 10, bold: true, color: DARK.green, fontFace: "Helvetica",
    });

    slide11.addText(bestQW.title, {
      x: 0.7, y: 1.7, w: 11.93, h: 0.45,
      fontSize: 16, bold: true, color: DARK.text, fontFace: "Helvetica",
    });

    slide11.addText(bestQW.description.slice(0, 250), {
      x: 0.7, y: 2.2, w: 11.93, h: 0.5,
      fontSize: 9, color: DARK.textMuted, fontFace: "Helvetica", wrap: true,
    });

    // Score projection cards
    const currentScore = kpi.overallScore;
    const projectedImmediate = currentScore + bestQW.projectedScoreGain;

    const qwCards = [
      { label: "Current Score", value: currentScore.toFixed(1), color: darkScoreColor(currentScore) },
      { label: "Projected Gain", value: `+${bestQW.projectedScoreGain.toFixed(1)}`, color: DARK.green },
      { label: "Immediate KPI", value: projectedImmediate.toFixed(1), color: darkScoreColor(projectedImmediate) },
      { label: "Effort", value: bestQW.effort.toUpperCase(), color: bestQW.effort === "low" ? DARK.green : bestQW.effort === "high" ? DARK.red : DARK.amber },
    ];

    qwCards.forEach((qc, i) => {
      const qx = 0.7 + i * 3.0;
      slide11.addText(qc.label, {
        x: qx, y: 2.9, w: 2.7, h: 0.25,
        fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
      });
      slide11.addText(qc.value, {
        x: qx, y: 3.15, w: 2.7, h: 0.5,
        fontSize: 22, bold: true, color: qc.color, fontFace: "Helvetica", align: "center",
      });
    });

    // Additional quick wins
    if (quickWins.length > 1) {
      slide11.addText("Additional Quick Wins", {
        x: 0.5, y: 4.5, w: 5, h: 0.35,
        fontSize: 11, bold: true, color: DARK.blue, fontFace: "Helvetica",
      });

      quickWins.slice(1, 6).forEach((qw, i) => {
        const qwy = 5.0 + i * 0.45;
        slide11.addText(`${i + 2}.`, {
          x: 0.7, y: qwy, w: 0.4, h: 0.3,
          fontSize: 10, bold: true, color: DARK.blue, fontFace: "Helvetica",
        });
        slide11.addText(qw.title, {
          x: 1.1, y: qwy, w: 8, h: 0.3,
          fontSize: 9, color: DARK.text, fontFace: "Helvetica",
        });
        slide11.addText(`+${qw.projectedScoreGain.toFixed(1)} pts`, {
          x: 9.5, y: qwy, w: 1.5, h: 0.3,
          fontSize: 9, bold: true, color: DARK.green, fontFace: "Helvetica", align: "right",
        });
        slide11.addText(qw.effort.toUpperCase(), {
          x: 11.2, y: qwy, w: 1.5, h: 0.3,
          fontSize: 8, color: qw.effort === "low" ? DARK.green : DARK.amber, fontFace: "Helvetica", align: "right",
        });
      });
    }
  } else {
    slide11.addText("No quick wins identified in the current scan.", {
      x: 0.5, y: 2.0, w: 10, h: 0.5,
      fontSize: 13, color: DARK.textMuted, fontFace: "Helvetica",
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SLIDE 12 - Sprint Backlog Prioritization
  // ════════════════════════════════════════════════════════════════
  const slide12 = addDarkSlide(pptx, "Sprint Backlog Prioritization", 12);

  // Classify recommendations into quadrants
  const doNow = enhanced.filter(r => r.impactScore >= 7 && r.effort === "low");
  const sprintPlan = enhanced.filter(r => r.impactScore >= 7 && (r.effort === "medium" || r.effort === "high"));
  const backlog = enhanced.filter(r => r.impactScore < 7);

  // DO NOW quadrant
  addCard(slide12, pptx, 0.5, 1.2, 4, 5.5);
  slide12.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 1.2, w: 4, h: 0.4,
    fill: { type: "solid", color: DARK.green },
    rectRadius: 0.08,
  });
  slide12.addText(`DO NOW (${doNow.length})`, {
    x: 0.5, y: 1.2, w: 4, h: 0.4,
    fontSize: 11, bold: true, color: DARK.bg, fontFace: "Helvetica", align: "center",
  });
  slide12.addText("High Impact, Low Effort", {
    x: 0.7, y: 1.7, w: 3.6, h: 0.25,
    fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  doNow.slice(0, 6).forEach((r, i) => {
    slide12.addText(`• ${r.title}`, {
      x: 0.7, y: 2.1 + i * 0.55, w: 3.6, h: 0.25,
      fontSize: 8, bold: true, color: DARK.text, fontFace: "Helvetica", wrap: true,
    });
    slide12.addText(`+${r.projectedScoreGain.toFixed(1)} pts`, {
      x: 0.7, y: 2.35 + i * 0.55, w: 3.6, h: 0.2,
      fontSize: 7, color: DARK.green, fontFace: "Helvetica",
    });
  });

  // SPRINT PLANNING quadrant
  addCard(slide12, pptx, 4.83, 1.2, 4, 5.5);
  slide12.addShape(pptx.ShapeType.rect, {
    x: 4.83, y: 1.2, w: 4, h: 0.4,
    fill: { type: "solid", color: DARK.amber },
    rectRadius: 0.08,
  });
  slide12.addText(`SPRINT PLANNING (${sprintPlan.length})`, {
    x: 4.83, y: 1.2, w: 4, h: 0.4,
    fontSize: 11, bold: true, color: DARK.bg, fontFace: "Helvetica", align: "center",
  });
  slide12.addText("High Impact, Medium-High Effort", {
    x: 5.03, y: 1.7, w: 3.6, h: 0.25,
    fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  sprintPlan.slice(0, 6).forEach((r, i) => {
    slide12.addText(`• ${r.title}`, {
      x: 5.03, y: 2.1 + i * 0.55, w: 3.6, h: 0.25,
      fontSize: 8, bold: true, color: DARK.text, fontFace: "Helvetica", wrap: true,
    });
    slide12.addText(`+${r.projectedScoreGain.toFixed(1)} pts | ${r.effort}`, {
      x: 5.03, y: 2.35 + i * 0.55, w: 3.6, h: 0.2,
      fontSize: 7, color: DARK.amber, fontFace: "Helvetica",
    });
  });

  // BACKLOG quadrant
  addCard(slide12, pptx, 9.16, 1.2, 3.67, 5.5);
  slide12.addShape(pptx.ShapeType.rect, {
    x: 9.16, y: 1.2, w: 3.67, h: 0.4,
    fill: { type: "solid", color: DARK.textMuted },
    rectRadius: 0.08,
  });
  slide12.addText(`BACKLOG (${backlog.length})`, {
    x: 9.16, y: 1.2, w: 3.67, h: 0.4,
    fontSize: 11, bold: true, color: DARK.bg, fontFace: "Helvetica", align: "center",
  });
  slide12.addText("Lower Impact", {
    x: 9.36, y: 1.7, w: 3.27, h: 0.25,
    fontSize: 8, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  backlog.slice(0, 8).forEach((r, i) => {
    slide12.addText(`• ${r.title}`, {
      x: 9.36, y: 2.1 + i * 0.45, w: 3.27, h: 0.25,
      fontSize: 7, color: DARK.text, fontFace: "Helvetica", wrap: true,
    });
    slide12.addText(`+${r.projectedScoreGain.toFixed(1)}`, {
      x: 9.36, y: 2.35 + i * 0.45, w: 3.27, h: 0.15,
      fontSize: 6, color: DARK.textMuted, fontFace: "Helvetica",
    });
  });

  // ════════════════════════════════════════════════════════════════
  // SLIDE 13 - Projected ROI
  // ════════════════════════════════════════════════════════════════
  const slide13 = addDarkSlide(pptx, "Projected ROI", 13);

  // Calculate projected scores
  const secGain = enhanced.filter(r => r.category === "security").reduce((sum, r) => sum + r.projectedScoreGain, 0);
  const perfGain = enhanced.filter(r => r.category === "performance").reduce((sum, r) => sum + r.projectedScoreGain, 0);
  const cqGain = enhanced.filter(r => r.category === "code-quality").reduce((sum, r) => sum + r.projectedScoreGain, 0);

  const projectedSec = Math.min(100, kpi.grades.security.rawScore + secGain);
  const projectedPerf = Math.min(100, kpi.grades.performance.rawScore + perfGain);
  const projectedCQ = Math.min(100, kpi.grades.codeQuality.rawScore + cqGain);
  const totalGain = enhanced.reduce((sum, r) => sum + r.projectedScoreGain, 0);
  const projectedOverall = Math.min(100, kpi.overallScore + totalGain);

  // ROI table
  const roiHeader: PptxGenJS.TableRow = [
    { text: "Pillar", options: { bold: true, fontSize: 10, color: DARK.text, fill: { color: DARK.blue } } },
    { text: "Current Score", options: { bold: true, fontSize: 10, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
    { text: "Projected Gain", options: { bold: true, fontSize: 10, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
    { text: "Projected Score", options: { bold: true, fontSize: 10, color: DARK.text, fill: { color: DARK.blue }, align: "center" as const } },
  ];

  const roiRows: PptxGenJS.TableRow[] = [
    [
      { text: "Security (40%)", options: { fontSize: 10, color: DARK.text, fill: { color: DARK.card }, bold: true } },
      { text: kpi.grades.security.rawScore.toFixed(1), options: { fontSize: 10, color: darkScoreColor(kpi.grades.security.rawScore), fill: { color: DARK.card }, align: "center" as const } },
      { text: `+${secGain.toFixed(1)}`, options: { fontSize: 10, color: DARK.green, fill: { color: DARK.card }, align: "center" as const, bold: true } },
      { text: projectedSec.toFixed(1), options: { fontSize: 10, color: darkScoreColor(projectedSec), fill: { color: DARK.card }, align: "center" as const, bold: true } },
    ],
    [
      { text: "Performance (35%)", options: { fontSize: 10, color: DARK.text, fill: { color: DARK.card }, bold: true } },
      { text: kpi.grades.performance.rawScore.toFixed(1), options: { fontSize: 10, color: darkScoreColor(kpi.grades.performance.rawScore), fill: { color: DARK.card }, align: "center" as const } },
      { text: `+${perfGain.toFixed(1)}`, options: { fontSize: 10, color: DARK.green, fill: { color: DARK.card }, align: "center" as const, bold: true } },
      { text: projectedPerf.toFixed(1), options: { fontSize: 10, color: darkScoreColor(projectedPerf), fill: { color: DARK.card }, align: "center" as const, bold: true } },
    ],
    [
      { text: "Code Quality (25%)", options: { fontSize: 10, color: DARK.text, fill: { color: DARK.card }, bold: true } },
      { text: kpi.grades.codeQuality.rawScore.toFixed(1), options: { fontSize: 10, color: darkScoreColor(kpi.grades.codeQuality.rawScore), fill: { color: DARK.card }, align: "center" as const } },
      { text: `+${cqGain.toFixed(1)}`, options: { fontSize: 10, color: DARK.green, fill: { color: DARK.card }, align: "center" as const, bold: true } },
      { text: projectedCQ.toFixed(1), options: { fontSize: 10, color: darkScoreColor(projectedCQ), fill: { color: DARK.card }, align: "center" as const, bold: true } },
    ],
  ];

  slide13.addTable([roiHeader, ...roiRows], {
    x: 0.5, y: 1.2, w: 12.33,
    colW: [3.5, 3, 3, 2.83],
    border: { type: "solid", color: DARK.border, pt: 0.5 },
    rowH: 0.5,
    autoPage: false,
  });

  // Projected overall score large display
  addCard(slide13, pptx, 3.5, 3.5, 6.33, 3.2);
  slide13.addText("PROJECTED OVERALL SCORE", {
    x: 3.5, y: 3.65, w: 6.33, h: 0.4,
    fontSize: 12, color: DARK.textMuted, fontFace: "Helvetica", align: "center",
  });
  slide13.addText(projectedOverall.toFixed(1), {
    x: 3.5, y: 4.1, w: 6.33, h: 1.2,
    fontSize: 56, bold: true, color: darkScoreColor(projectedOverall),
    fontFace: "Helvetica", align: "center",
  });
  slide13.addText(`Current: ${kpi.overallScore.toFixed(1)}  →  Projected: ${projectedOverall.toFixed(1)}  (${totalGain >= 0 ? "+" : ""}${totalGain.toFixed(1)} pts)`, {
    x: 3.5, y: 5.4, w: 6.33, h: 0.4,
    fontSize: 11, color: DARK.text, fontFace: "Helvetica", align: "center",
  });
  slide13.addText(projectedOverall >= 95 ? "Target of 95 ACHIEVABLE with full remediation" : `Gap to target: ${(95 - projectedOverall).toFixed(1)} pts remaining after all remediations`, {
    x: 3.5, y: 5.85, w: 6.33, h: 0.4,
    fontSize: 10, color: projectedOverall >= 95 ? DARK.green : DARK.amber,
    fontFace: "Helvetica", align: "center",
  });

  // ════════════════════════════════════════════════════════════════
  // SLIDE 14 - Developer Handoff and Action Items
  // ════════════════════════════════════════════════════════════════
  const slide14 = addDarkSlide(pptx, "Developer Handoff & Action Items", 14);

  // Immediate 24-hour actions (security hotfixes)
  addCard(slide14, pptx, 0.5, 1.2, 6, 5.5);
  slide14.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 1.2, w: 6, h: 0.45,
    fill: { type: "solid", color: DARK.red },
    rectRadius: 0.08,
  });
  slide14.addText("IMMEDIATE (24 Hours) — Security Hotfixes", {
    x: 0.7, y: 1.22, w: 5.6, h: 0.4,
    fontSize: 10, bold: true, color: DARK.text, fontFace: "Helvetica",
  });

  const immediateActions = criticals.slice(0, 8);
  if (immediateActions.length > 0) {
    immediateActions.forEach((f, i) => {
      const ay = 1.85 + i * 0.6;
      slide14.addText(`☐`, {
        x: 0.7, y: ay, w: 0.3, h: 0.25,
        fontSize: 10, color: DARK.red, fontFace: "Helvetica",
      });
      slide14.addText(f.title, {
        x: 1.05, y: ay, w: 5.25, h: 0.25,
        fontSize: 9, bold: true, color: DARK.text, fontFace: "Helvetica",
      });
      slide14.addText(f.remediation.slice(0, 100), {
        x: 1.05, y: ay + 0.25, w: 5.25, h: 0.25,
        fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica", wrap: true,
      });
    });
  } else {
    slide14.addText("No immediate security hotfixes required.", {
      x: 0.7, y: 2.0, w: 5.6, h: 0.4,
      fontSize: 10, color: DARK.green, fontFace: "Helvetica",
    });
  }

  // Sprint actions (performance tuning from recommendations)
  addCard(slide14, pptx, 6.83, 1.2, 6, 5.5);
  slide14.addShape(pptx.ShapeType.rect, {
    x: 6.83, y: 1.2, w: 6, h: 0.45,
    fill: { type: "solid", color: DARK.blue },
    rectRadius: 0.08,
  });
  slide14.addText("NEXT SPRINT — Performance & Quality", {
    x: 7.03, y: 1.22, w: 5.6, h: 0.4,
    fontSize: 10, bold: true, color: DARK.text, fontFace: "Helvetica",
  });

  const sprintActions = enhanced
    .filter(r => !r.quickWin)
    .sort((a, b) => b.projectedScoreGain - a.projectedScoreGain)
    .slice(0, 8);

  if (sprintActions.length > 0) {
    sprintActions.forEach((r, i) => {
      const sy = 1.85 + i * 0.6;
      slide14.addText(`☐`, {
        x: 7.03, y: sy, w: 0.3, h: 0.25,
        fontSize: 10, color: DARK.blue, fontFace: "Helvetica",
      });
      slide14.addText(r.title, {
        x: 7.38, y: sy, w: 4.5, h: 0.25,
        fontSize: 9, bold: true, color: DARK.text, fontFace: "Helvetica",
      });
      slide14.addText(`+${r.projectedScoreGain.toFixed(1)} pts | ${r.effort} effort`, {
        x: 11.88, y: sy, w: 0.75, h: 0.25,
        fontSize: 7, color: DARK.green, fontFace: "Helvetica", align: "right",
      });
      slide14.addText(r.description.slice(0, 90), {
        x: 7.38, y: sy + 0.25, w: 5.25, h: 0.25,
        fontSize: 7, color: DARK.textMuted, fontFace: "Helvetica", wrap: true,
      });
    });
  } else {
    slide14.addText("No additional sprint actions. Focus on quick wins above.", {
      x: 7.03, y: 2.0, w: 5.6, h: 0.4,
      fontSize: 10, color: DARK.green, fontFace: "Helvetica",
    });
  }

  // ── Save ──
  const filename = `VZY-Platform-Analysis-${new Date().toISOString().slice(0, 10)}.pptx`;
  await pptx.writeFile({ fileName: filename });
}

// ============================================================================
// COMPETITION ANALYSIS (existing export, preserved)
// ============================================================================
export function generateComparisonPPTX(result: ComparisonResult) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "VZY OTT Verification Agent";
  pptx.subject = "Competition Analysis";

  const allSites = [result.primary, ...result.competitors];
  const ai = result.aiAnalysis;

  // ── Slide 1: Title ──
  const slide1 = pptx.addSlide();

  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: "100%",
    fill: { type: "solid", color: BRAND.blue },
  });

  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 6.8, w: "100%", h: 0.7,
    fill: { type: "solid", color: "1D4ED8" },
  });

  slide1.addText("VZY OTT Verification Agent", {
    x: 0, y: 1.5, w: "100%", h: 0.8,
    fontSize: 32, bold: true, color: BRAND.white,
    fontFace: "Helvetica", align: "center",
  });

  slide1.addText("Competition Analysis Report", {
    x: 0, y: 2.5, w: "100%", h: 0.6,
    fontSize: 22, color: BRAND.blueLight,
    fontFace: "Helvetica", align: "center",
  });

  const siteLabels = allSites.map((s) => getSiteLabel(s.url));
  slide1.addText(`${siteLabels[0]} vs ${siteLabels.slice(1).join(", ")}`, {
    x: 0, y: 3.3, w: "100%", h: 0.5,
    fontSize: 14, color: BRAND.white,
    fontFace: "Helvetica", align: "center",
  });

  slide1.addText(new Date(result.generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  }), {
    x: 0, y: 4.2, w: "100%", h: 0.4,
    fontSize: 12, color: BRAND.blueLight,
    fontFace: "Helvetica", align: "center",
  });

  slide1.addText("Confidential - DishTV/Watcho OTT Platform Analysis", {
    x: 0, y: 6.9, w: "100%", h: 0.3,
    fontSize: 8, color: BRAND.blueLight,
    fontFace: "Helvetica", align: "center",
  });

  // ── Slide 2: Score Overview ──
  const slide2 = addBrandedSlide(pptx, "Score Overview");

  const cardW = Math.min(2.5, (12 - 0.3 * allSites.length) / allSites.length);
  const totalW = allSites.length * cardW + (allSites.length - 1) * 0.3;
  const startX = (13.33 - totalW) / 2;

  allSites.forEach((site, i) => {
    const x = startX + i * (cardW + 0.3);

    slide2.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.2, w: cardW, h: 2.5,
      fill: { type: "solid", color: BRAND.white },
      line: { color: BRAND.border, width: 1 },
      rectRadius: 0.1,
    });

    if (i === 0) {
      slide2.addShape(pptx.ShapeType.roundRect, {
        x: x + 0.15, y: 1.35, w: cardW - 0.3, h: 0.3,
        fill: { type: "solid", color: BRAND.blueLight },
        rectRadius: 0.05,
      });
      slide2.addText("YOUR SITE", {
        x: x + 0.15, y: 1.35, w: cardW - 0.3, h: 0.3,
        fontSize: 7, bold: true, color: BRAND.blue,
        fontFace: "Helvetica", align: "center",
      });
    }

    slide2.addText(getSiteLabel(site.url), {
      x, y: i === 0 ? 1.7 : 1.4, w: cardW, h: 0.3,
      fontSize: 9, color: BRAND.textLight,
      fontFace: "Helvetica", align: "center",
    });

    slide2.addText(site.overallScore.toFixed(1), {
      x, y: 2.1, w: cardW, h: 0.6,
      fontSize: 28, bold: true, color: scoreColor(site.overallScore),
      fontFace: "Helvetica", align: "center",
    });

    [
      { label: "Security", score: site.securityScore },
      { label: "Performance", score: site.performanceScore },
      { label: "Code Quality", score: site.codeQualityScore },
    ].forEach((cat, j) => {
      const catY = 2.9 + j * 0.25;
      slide2.addText(`${cat.label}: ${cat.score.toFixed(1)}`, {
        x: x + 0.1, y: catY, w: cardW - 0.2, h: 0.2,
        fontSize: 8, color: scoreColor(cat.score),
        fontFace: "Helvetica", align: "center",
      });
    });
  });

  slide2.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 4.2, w: 12.33, h: 1.0,
    fill: { type: "solid", color: BRAND.surface },
    rectRadius: 0.1,
  });
  slide2.addText("AI Verdict", {
    x: 0.7, y: 4.3, w: 2, h: 0.3,
    fontSize: 10, bold: true, color: BRAND.blue,
    fontFace: "Helvetica",
  });
  slide2.addText(ai.verdict, {
    x: 0.7, y: 4.6, w: 11.93, h: 0.5,
    fontSize: 9, color: BRAND.text,
    fontFace: "Helvetica", wrap: true,
  });

  // ── Slide 3: Score Comparison Chart ──
  const slide3 = addBrandedSlide(pptx, "Multi-Dimensional Comparison");

  const scoreMetrics = ["Overall", "Security", "Performance", "Code Quality", "Header Score", "Lighthouse"];
  const tableRows: PptxGenJS.TableRow[] = [
    [
      { text: "Metric", options: { bold: true, fontSize: 9, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" } },
      ...allSites.map((s) => ({
        text: getSiteLabel(s.url), options: { bold: true, fontSize: 9, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" as const },
      })),
    ],
    ...scoreMetrics.map((metric) => [
      { text: metric, options: { fontSize: 9, color: BRAND.text, bold: true } },
      ...allSites.map((site) => {
        let val = 0;
        if (metric === "Overall") val = site.overallScore;
        else if (metric === "Security") val = site.securityScore;
        else if (metric === "Performance") val = site.performanceScore;
        else if (metric === "Code Quality") val = site.codeQualityScore;
        else if (metric === "Header Score") val = site.headerScore;
        else if (metric === "Lighthouse") val = site.lighthouseScores.performance;
        return { text: val.toFixed(1), options: { fontSize: 9, color: scoreColor(val), align: "center" as const, bold: true } };
      }),
    ]),
  ];

  const colW = Math.min(2, (12 - 2.5) / allSites.length);
  slide3.addTable(tableRows, {
    x: 0.5, y: 1.0, w: 12.33,
    colW: [2.5, ...allSites.map(() => colW)],
    border: { type: "solid", color: BRAND.border, pt: 0.5 },
    rowH: 0.35,
    autoPage: false,
  });

  // ── Slide 4: Security Gap Analysis ──
  const slide4 = addBrandedSlide(pptx, "Security Gap Analysis");

  const secMetrics = [
    { label: "SSL Grade", getValue: (s: ComparisonSiteData) => s.sslGrade },
    { label: "Header Score", getValue: (s: ComparisonSiteData) => `${s.headerScore}` },
    { label: "Missing Headers", getValue: (s: ComparisonSiteData) => String(s.missingHeaders.length) },
    { label: "CORS Issues", getValue: (s: ComparisonSiteData) => String(s.corsIssues.length) },
    { label: "Token Leaks", getValue: (s: ComparisonSiteData) => String(s.tokenLeakCount) },
    { label: "Dependency Vulns", getValue: (s: ComparisonSiteData) => String(s.dependencyVulnCount) },
    { label: "Widevine DRM", getValue: (s: ComparisonSiteData) => s.drmStatus.widevineDetected ? "Yes" : "No" },
    { label: "FairPlay DRM", getValue: (s: ComparisonSiteData) => s.drmStatus.fairplayDetected ? "Yes" : "No" },
    { label: "License Exposed", getValue: (s: ComparisonSiteData) => s.drmStatus.licenseUrlExposed ? "EXPOSED" : "Safe" },
  ];

  const secRows: PptxGenJS.TableRow[] = [
    [
      { text: "Security Metric", options: { bold: true, fontSize: 9, color: BRAND.white, fill: { color: BRAND.red }, align: "center" } },
      ...allSites.map((s) => ({
        text: getSiteLabel(s.url), options: { bold: true, fontSize: 9, color: BRAND.white, fill: { color: BRAND.red }, align: "center" as const },
      })),
    ],
    ...secMetrics.map((m) => [
      { text: m.label, options: { fontSize: 8, color: BRAND.text, bold: true } },
      ...allSites.map((s) => ({ text: m.getValue(s), options: { fontSize: 8, color: BRAND.text, align: "center" as const } })),
    ]),
  ];

  slide4.addTable(secRows, {
    x: 0.5, y: 1.0, w: 12.33,
    colW: [2.5, ...allSites.map(() => colW)],
    border: { type: "solid", color: BRAND.border, pt: 0.5 },
    rowH: 0.32,
    autoPage: false,
  });

  // ── Slide 5: Performance Benchmarking ──
  const slide5 = addBrandedSlide(pptx, "Performance Benchmarking");

  const perfMetrics = [
    { label: "LH Performance", getValue: (s: ComparisonSiteData) => String(s.lighthouseScores.performance) },
    { label: "LH Accessibility", getValue: (s: ComparisonSiteData) => String(s.lighthouseScores.accessibility) },
    { label: "LH Best Practices", getValue: (s: ComparisonSiteData) => String(s.lighthouseScores.bestPractices) },
    { label: "LH SEO", getValue: (s: ComparisonSiteData) => String(s.lighthouseScores.seo) },
  ];

  const cwvKeysComp = Object.keys(allSites[0]?.coreWebVitals || {}).slice(0, 5);
  cwvKeysComp.forEach((key) => {
    perfMetrics.push({
      label: key.toUpperCase(),
      getValue: (s: ComparisonSiteData) => {
        const cwvItem = s.coreWebVitals[key];
        return cwvItem ? `${cwvItem.value}` : "N/A";
      },
    });
  });

  const perfRows: PptxGenJS.TableRow[] = [
    [
      { text: "Performance Metric", options: { bold: true, fontSize: 9, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" } },
      ...allSites.map((s) => ({
        text: getSiteLabel(s.url), options: { bold: true, fontSize: 9, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" as const },
      })),
    ],
    ...perfMetrics.map((m) => [
      { text: m.label, options: { fontSize: 8, color: BRAND.text, bold: true } },
      ...allSites.map((s) => ({ text: m.getValue(s), options: { fontSize: 8, color: BRAND.text, align: "center" as const } })),
    ]),
  ];

  slide5.addTable(perfRows, {
    x: 0.5, y: 1.0, w: 12.33,
    colW: [2.5, ...allSites.map(() => colW)],
    border: { type: "solid", color: BRAND.border, pt: 0.5 },
    rowH: 0.32,
    autoPage: false,
  });

  // ── Slide 6: AI Competitive Intelligence ──
  const slide6 = addBrandedSlide(pptx, "AI Competitive Intelligence");

  const intelCards = [
    { label: "Competitive Gap", value: String(ai.competitiveGapScore), color: ai.competitiveGapScore <= 20 ? BRAND.green : ai.competitiveGapScore <= 50 ? BRAND.amber : BRAND.red },
    { label: "Risk Rating", value: ai.riskRating.toUpperCase(), color: riskColor(ai.riskRating) },
    { label: "Business Impact", value: String(ai.businessImpactScore), color: BRAND.blue },
    { label: "Leader", value: getSiteLabel(ai.leader), color: BRAND.green },
  ];

  intelCards.forEach((card, i) => {
    const cx = 0.5 + i * 3.2;
    slide6.addShape(pptx.ShapeType.roundRect, {
      x: cx, y: 1.0, w: 2.9, h: 1.2,
      fill: { type: "solid", color: BRAND.white },
      line: { color: BRAND.border, width: 1 },
      rectRadius: 0.1,
    });
    slide6.addText(card.label, {
      x: cx, y: 1.05, w: 2.9, h: 0.35,
      fontSize: 9, color: BRAND.textLight,
      fontFace: "Helvetica", align: "center",
    });
    slide6.addText(card.value, {
      x: cx, y: 1.4, w: 2.9, h: 0.6,
      fontSize: 22, bold: true, color: card.color,
      fontFace: "Helvetica", align: "center",
    });
  });

  slide6.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 2.5, w: 12.33, h: 1.0,
    fill: { type: "solid", color: BRAND.surface },
    rectRadius: 0.1,
  });
  slide6.addText("AI Verdict", {
    x: 0.7, y: 2.55, w: 2, h: 0.3,
    fontSize: 10, bold: true, color: BRAND.blue,
    fontFace: "Helvetica",
  });
  slide6.addText(ai.verdict, {
    x: 0.7, y: 2.85, w: 11.93, h: 0.55,
    fontSize: 9, color: BRAND.text,
    fontFace: "Helvetica", wrap: true,
  });

  slide6.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 3.8, w: 5.9, h: 3.0,
    fill: { type: "solid", color: BRAND.greenLight },
    rectRadius: 0.1,
  });
  slide6.addText("Your Strengths", {
    x: 0.7, y: 3.85, w: 5.5, h: 0.3,
    fontSize: 10, bold: true, color: BRAND.green,
    fontFace: "Helvetica",
  });
  slide6.addText(ai.primaryStrengths.map((s) => `  +  ${s}`).join("\n"), {
    x: 0.7, y: 4.2, w: 5.5, h: 2.5,
    fontSize: 8, color: BRAND.text,
    fontFace: "Helvetica", wrap: true, valign: "top",
  });

  slide6.addShape(pptx.ShapeType.roundRect, {
    x: 6.93, y: 3.8, w: 5.9, h: 3.0,
    fill: { type: "solid", color: BRAND.amberLight },
    rectRadius: 0.1,
  });
  slide6.addText("Areas to Improve", {
    x: 7.13, y: 3.85, w: 5.5, h: 0.3,
    fontSize: 10, bold: true, color: BRAND.amber,
    fontFace: "Helvetica",
  });
  slide6.addText(ai.primaryWeaknesses.map((w) => `  -  ${w}`).join("\n"), {
    x: 7.13, y: 4.2, w: 5.5, h: 2.5,
    fontSize: 8, color: BRAND.text,
    fontFace: "Helvetica", wrap: true, valign: "top",
  });

  // ── Slide 7: Improvement Roadmap ──
  const slide7 = addBrandedSlide(pptx, "Improvement Roadmap");

  const roadmapColors: Record<string, string> = {
    "30-day": BRAND.green,
    "60-day": BRAND.amber,
    "90-day": BRAND.red,
  };
  const roadmapBg: Record<string, string> = {
    "30-day": BRAND.greenLight,
    "60-day": BRAND.amberLight,
    "90-day": BRAND.redLight,
  };

  ai.improvementRoadmap.forEach((phase, i) => {
    const px = 0.5 + i * 4.11;
    const color = roadmapColors[phase.timeframe] || BRAND.blue;
    const bg = roadmapBg[phase.timeframe] || BRAND.surface;

    slide7.addShape(pptx.ShapeType.roundRect, {
      x: px, y: 1.0, w: 3.81, h: 5.5,
      fill: { type: "solid", color: bg },
      rectRadius: 0.1,
    });

    slide7.addShape(pptx.ShapeType.roundRect, {
      x: px + 0.15, y: 1.15, w: 3.51, h: 0.4,
      fill: { type: "solid", color: color },
      rectRadius: 0.05,
    });
    slide7.addText(phase.timeframe.toUpperCase(), {
      x: px + 0.15, y: 1.15, w: 3.51, h: 0.4,
      fontSize: 12, bold: true, color: BRAND.white,
      fontFace: "Helvetica", align: "center",
    });

    const actionsText = phase.actions.map((a, j) => `${j + 1}. ${a}`).join("\n\n");
    slide7.addText(actionsText, {
      x: px + 0.2, y: 1.7, w: 3.41, h: 4.6,
      fontSize: 9, color: BRAND.text,
      fontFace: "Helvetica", wrap: true, valign: "top",
      lineSpacingMultiple: 1.2,
    });
  });

  // ── Slide 8: Success Matrix ──
  const slide8 = addBrandedSlide(pptx, "Success Matrix");

  const matrixHeader: PptxGenJS.TableRow = [
    { text: "Metric", options: { bold: true, fontSize: 8, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" } },
    { text: "Your Score", options: { bold: true, fontSize: 8, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" } },
    ...result.competitors.map((c) => ({
      text: getSiteLabel(c.url), options: { bold: true, fontSize: 8, color: BRAND.white, fill: { color: BRAND.blue } as any, align: "center" as const },
    })),
    { text: "Leader", options: { bold: true, fontSize: 8, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" } },
    { text: "Gap", options: { bold: true, fontSize: 8, color: BRAND.white, fill: { color: BRAND.blue }, align: "center" } },
  ];

  const matrixBody: PptxGenJS.TableRow[] = ai.successMatrix.map((row) => [
    { text: row.metric, options: { fontSize: 8, color: BRAND.text, bold: true } },
    { text: row.primary.toFixed(1), options: { fontSize: 8, color: row.leader === result.primary.url ? BRAND.green : BRAND.text, align: "center" as const, bold: row.leader === result.primary.url } },
    ...row.competitors.map((c) => ({
      text: c.value.toFixed(1),
      options: { fontSize: 8, color: row.leader === c.url ? BRAND.green : BRAND.text, align: "center" as const, bold: row.leader === c.url },
    })),
    { text: getSiteLabel(row.leader), options: { fontSize: 8, color: BRAND.blue, align: "center" as const, bold: true } },
    { text: row.gap > 0 ? `-${row.gap.toFixed(1)}` : `+${Math.abs(row.gap).toFixed(1)}`, options: { fontSize: 8, color: row.gap <= 0 ? BRAND.green : row.gap <= 10 ? BRAND.amber : BRAND.red, align: "center" as const, bold: true } },
  ]);

  const matColCount = 2 + result.competitors.length + 2;
  const matColW = Array(matColCount).fill((12.33 - 2.5) / (matColCount - 1));
  matColW[0] = 2.5;

  slide8.addTable([matrixHeader, ...matrixBody], {
    x: 0.5, y: 1.0, w: 12.33,
    colW: matColW,
    border: { type: "solid", color: BRAND.border, pt: 0.5 },
    rowH: 0.3,
    autoPage: false,
  });

  // ── Slide 9: Summary & Next Steps ──
  const slide9 = addBrandedSlide(pptx, "Summary & Next Steps");

  slide9.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 1.0, w: 6, h: 5.5,
    fill: { type: "solid", color: BRAND.surface },
    rectRadius: 0.1,
  });
  slide9.addText("Key Takeaways", {
    x: 0.7, y: 1.1, w: 5.6, h: 0.35,
    fontSize: 13, bold: true, color: BRAND.blue,
    fontFace: "Helvetica",
  });

  const takeaways = [
    `Overall Leader: ${getSiteLabel(ai.leader)}`,
    `Competitive Gap Score: ${ai.competitiveGapScore}/100 (${ai.riskRating} risk)`,
    `Business Impact Score: ${ai.businessImpactScore}/100`,
    `Your Overall Score: ${result.primary.overallScore.toFixed(1)}`,
    ...ai.strategicSuggestions.slice(0, 4),
  ];
  slide9.addText(takeaways.map((t, i) => `${i + 1}. ${t}`).join("\n\n"), {
    x: 0.7, y: 1.55, w: 5.6, h: 4.8,
    fontSize: 10, color: BRAND.text,
    fontFace: "Helvetica", wrap: true, valign: "top",
    lineSpacingMultiple: 1.3,
  });

  slide9.addShape(pptx.ShapeType.roundRect, {
    x: 6.83, y: 1.0, w: 6, h: 5.5,
    fill: { type: "solid", color: BRAND.blueLight },
    rectRadius: 0.1,
  });
  slide9.addText("Recommended Actions", {
    x: 7.03, y: 1.1, w: 5.6, h: 0.35,
    fontSize: 13, bold: true, color: BRAND.blue,
    fontFace: "Helvetica",
  });

  const actions = ai.improvementRoadmap
    .flatMap((phase) => phase.actions.map((a) => `[${phase.timeframe}] ${a}`))
    .slice(0, 8);
  slide9.addText(actions.map((a, i) => `${i + 1}. ${a}`).join("\n\n"), {
    x: 7.03, y: 1.55, w: 5.6, h: 4.8,
    fontSize: 9, color: BRAND.text,
    fontFace: "Helvetica", wrap: true, valign: "top",
    lineSpacingMultiple: 1.2,
  });

  // ── Save ──
  const filename = `VZY-Competition-Analysis-${new Date().toISOString().slice(0, 10)}.pptx`;
  pptx.writeFile({ fileName: filename });
}
