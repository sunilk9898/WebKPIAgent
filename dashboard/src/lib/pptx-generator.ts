// ============================================================================
// PowerPoint (PPTX) Generator - Competition Analysis Presentations
// ============================================================================

import PptxGenJS from "pptxgenjs";
import type { ComparisonResult, ComparisonSiteData, AIComparisonAnalysis } from "@/types/api";

// ── Brand Colors ──
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

// ── Slide Master: branded header + footer ──
function addBrandedSlide(pptx: PptxGenJS, title: string): PptxGenJS.Slide {
  const slide = pptx.addSlide();

  // Header bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.7,
    fill: { type: "solid", color: BRAND.blue },
  });

  slide.addText(title, {
    x: 0.4, y: 0.1, w: 8, h: 0.5,
    fontSize: 18, bold: true, color: BRAND.white,
    fontFace: "Helvetica",
  });

  // Footer
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
// PUBLIC: Generate Comparison PowerPoint
// ============================================================================
export function generateComparisonPPTX(result: ComparisonResult) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.author = "VZY OTT Verification Agent";
  pptx.subject = "Competition Analysis";

  const allSites = [result.primary, ...result.competitors];
  const ai = result.aiAnalysis;

  // ── Slide 1: Title ──
  const slide1 = pptx.addSlide();

  // Full background gradient
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

    // Primary label
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

    // Site name
    slide2.addText(getSiteLabel(site.url), {
      x, y: i === 0 ? 1.7 : 1.4, w: cardW, h: 0.3,
      fontSize: 9, color: BRAND.textLight,
      fontFace: "Helvetica", align: "center",
    });

    // Score
    slide2.addText(site.overallScore.toFixed(1), {
      x, y: 2.1, w: cardW, h: 0.6,
      fontSize: 28, bold: true, color: scoreColor(site.overallScore),
      fontFace: "Helvetica", align: "center",
    });

    // Category scores
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

  // Verdict at bottom
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

  // ── Slide 3: Score Comparison Chart (native table) ──
  const slide3 = addBrandedSlide(pptx, "Multi-Dimensional Comparison");

  const scoreMetrics = ["Overall", "Security", "Performance", "Code Quality", "Header Score", "Lighthouse"];
  const tableRows: PptxGenJS.TableRow[] = [
    // Header row
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

  // Add CWV metrics dynamically
  const cwvKeys = Object.keys(allSites[0]?.coreWebVitals || {}).slice(0, 5);
  cwvKeys.forEach((key) => {
    perfMetrics.push({
      label: key.toUpperCase(),
      getValue: (s: ComparisonSiteData) => {
        const cwv = s.coreWebVitals[key];
        return cwv ? `${cwv.value}` : "N/A";
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

  // Gap + Risk + Impact cards
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

  // Verdict
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

  // Strengths / Weaknesses side by side
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

    // Phase header
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

    // Actions
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

  // Key takeaways
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

  // Recommended actions
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
