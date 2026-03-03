// ============================================================================
// Performance Agent - Lighthouse, Core Web Vitals, Player Metrics, CDN
// ============================================================================
//
// Scoring model (v3 — Chrome DevTools aligned):
//   Lighthouse Score:       85 points  (directly proportional to raw LH score)
//   Player Metrics:          6 points  (OTT-specific startup, ABR)
//   CDN Efficiency:          5 points  (cache headers, compression)
//   Resource Optimization:   4 points  (page weight, render-blocking)
//   TOTAL:                 100 points
//
// v3 changes: Lighthouse increased from 75→85 pts to minimize gap between
// VZY Performance Score and Chrome DevTools Lighthouse score. The remaining
// 15 pts are OTT-specific adjustments that Chrome doesn't measure.
//
// Multi-run median: Lighthouse is run LIGHTHOUSE_RUNS times per platform;
// the MEDIAN score is used to reduce run-to-run variance from ±10 to ±3-5.
// ============================================================================

import puppeteer, { Browser, Page } from 'puppeteer';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { BaseAgent } from '../../core/base-agent';
import {
  ScanConfig, WeightedScore, Severity, Platform,
  CoreWebVitals, PlayerMetrics, CDNMetrics, ResourceMetrics,
} from '../../types';

// Thresholds for OTT KPI targets
const THRESHOLDS = {
  lighthouseScore: 95,
  lcp: 2500,       // ms - must be <2.5s
  fcp: 1800,       // ms - must be <1.8s
  cls: 0.1,        // must be <0.1
  ttfb: 800,       // ms - must be <800ms
  fid: 100,        // ms
  inp: 200,        // ms
  playerStartup: 3000,  // ms - OTT specific
  bufferRatio: 0.02,    // 2% max
  drmLicense: 2000,     // ms
  timeToFirstFrame: 4000, // ms
};

// ── Lighthouse configuration matching Chrome DevTools defaults exactly ──
// Uses 'simulate' (Lantern) throttling for hardware-independent scores.
// Lantern simulates throttled conditions from an unthrottled trace, producing
// scores that are LESS hardware-dependent than 'devtools' throttling.
// This is the same method Chrome DevTools → Lighthouse panel uses.
const LIGHTHOUSE_DESKTOP_CONFIG = {
  extends: 'lighthouse:default' as const,
  settings: {
    formFactor: 'desktop' as const,
    throttlingMethod: 'simulate' as const, // Explicit: same as Chrome DevTools default
    throttling: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
    screenEmulation: {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    },
    emulatedUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
    // maxWaitForLoad — use Lighthouse default (45s) for stability
  },
};

const LIGHTHOUSE_MOBILE_CONFIG = {
  extends: 'lighthouse:default' as const,
  settings: {
    formFactor: 'mobile' as const,
    throttlingMethod: 'simulate' as const, // Explicit: same as Chrome DevTools default
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.56,
      uploadThroughputKbps: 675,
    },
    screenEmulation: {
      mobile: true,
      width: 375,
      height: 812,
      deviceScaleFactor: 3,
      disabled: false,
    },
    emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
  },
};

// ── Multi-run strategy for score consistency ──
// Lighthouse has inherent variance of ±5-10 pts per run. Running multiple times
// and taking the MEDIAN reduces variance to ±2-5 pts (per Google's own docs).
// We run 3 times for each platform and use the median score.
// In resource-constrained environments (AWS t3.medium), reduce to 2 runs.
const LIGHTHOUSE_RUNS = process.env.LIGHTHOUSE_RUNS ? parseInt(process.env.LIGHTHOUSE_RUNS) : 3;

// Chrome flags for Lighthouse via chrome-launcher.
//
// We use ignoreDefaultFlags: true because chrome-launcher's defaults include
// --disable-background-networking and --metrics-recording-only, both of which
// break Lighthouse's Lantern trace engine (LanternError).
//
// Below we re-include ALL safe defaults from chrome-launcher EXCEPT those two,
// plus anti-backgrounding flags essential for headless trace collection.
const CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--no-first-run',
  '--disable-extensions',
  '--disable-dev-shm-usage',  // Critical: use /tmp instead of /dev/shm (often undersized in Docker)
  // Anti-backgrounding: prevent renderer throttling in headless mode
  // (without these, performance marks FCP/LCP are missing from traces)
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-ipc-flooding-protection',
  // Safe chrome-launcher defaults (reduce noise in Lantern network trace)
  '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,AutofillServerCommunication,PrivacySandboxSettings4',
  '--disable-component-extensions-with-background-pages',
  '--disable-component-update',
  '--disable-client-side-phishing-detection',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-domain-reliability',
  '--disable-hang-monitor',
  '--disable-prompt-on-repost',
  '--mute-audio',
  '--no-default-browser-check',
  '--password-store=basic',
  '--use-mock-keychain',
  '--force-fieldtrials=*BackgroundTracing/default/',
  '--propagate-iph-for-testing',
  // Explicitly NOT included (these break Lantern trace engine):
  // --disable-background-networking
  // --metrics-recording-only
];

// Puppeteer-specific flags (superset of CHROME_FLAGS for non-Lighthouse uses)
const PUPPETEER_FLAGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--no-first-run',
  '--disable-extensions',
  '--disable-dev-shm-usage',
];

export class PerformanceAgent extends BaseAgent {
  private browser?: Browser;
  private chrome?: chromeLauncher.LaunchedChrome;

  // Track ALL launched Puppeteer browsers so teardown can kill them on timeout
  private _activeBrowsers: Browser[] = [];

  // ── Metric collectors for metadata (per-platform to avoid overwrite) ──
  private _lhScoresMap: Record<string, { performance: number; accessibility: number; bestPractices: number; seo: number; pwa: number }> = {};
  private _cwvValuesMap: Record<string, Record<string, { value: number; rating: 'good' | 'needs-improvement' | 'poor' }>> = {};
  private _playerMetrics: Record<string, number> = {};
  private _resourceData: { totalSize: number; jsSize: number; cssSize: number; imageSize: number; fontSize: number; thirdPartySize: number; requestCount: number; renderBlocking: string[] } | null = null;
  private _cdnStats: { hits: number; total: number; latencies: number[]; compressed: number; uncompressed: number } = { hits: 0, total: 0, latencies: [], compressed: 0, uncompressed: 0 };

  // Track CDN issues by type (grouped) instead of per-asset
  private _cdnIssues: { missingCache: string[]; uncompressed: string[] } = { missingCache: [], uncompressed: [] };

  constructor() {
    super('performance');
  }

  // Track warm-up state to skip redundant warm-ups in batch scans
  // (each batch scan creates a new agent instance, but the Chrome process is fresh each time)
  private static lastWarmupTime = 0;
  private static readonly WARMUP_COOLDOWN = 120_000; // 2 minutes — skip warm-up if done recently

  protected async setup(config: ScanConfig): Promise<void> {
    const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

    this.chrome = await chromeLauncher.launch({
      chromeFlags: CHROME_FLAGS,
      ignoreDefaultFlags: true, // prevent chrome-launcher from adding --disable-background-networking & --metrics-recording-only
      ...(chromePath ? { chromePath } : {}),
    });

    // Skip warm-up if Chrome was recently warmed (batch scans create many agents quickly)
    const timeSinceWarmup = Date.now() - PerformanceAgent.lastWarmupTime;
    if (timeSinceWarmup < PerformanceAgent.WARMUP_COOLDOWN) {
      this.logger.info(`Chrome warm-up skipped (last warm-up ${Math.round(timeSinceWarmup / 1000)}s ago)`);
      return;
    }

    // Warm up Chrome by loading a simple page first
    // This prevents LanternError on first real scan in Docker
    try {
      await lighthouse('https://example.com', {
        port: this.chrome.port,
        output: 'json',
        logLevel: 'error',
      }, {
        extends: 'lighthouse:default' as const,
        settings: {
          onlyCategories: ['performance'],
          maxWaitForLoad: 10000,
        },
      });
      PerformanceAgent.lastWarmupTime = Date.now();
      this.logger.info('Chrome warm-up complete');
    } catch (e) {
      this.logger.warn('Chrome warm-up failed (non-critical)', { error: String(e) });
    }
  }

  /**
   * Resolve redirects (server-side AND client-side) to get the final URL.
   * This prevents Lighthouse LanternError caused by redirects creating
   * multiple navigations in the trace (e.g. vzy.one → vzy.one/en).
   * The trace engine cannot map metric scores when two navigations exist.
   *
   * Uses Puppeteer to catch JavaScript/meta-refresh redirects that fetch() misses.
   * Results are cached for 10 minutes to speed up batch scans.
   */
  private static redirectCache = new Map<string, { finalUrl: string; timestamp: number }>();
  private static readonly REDIRECT_CACHE_TTL = 600_000; // 10 minutes

  private async resolveRedirects(url: string): Promise<string> {
    // Check cache first
    const cached = PerformanceAgent.redirectCache.get(url);
    if (cached && Date.now() - cached.timestamp < PerformanceAgent.REDIRECT_CACHE_TTL) {
      if (cached.finalUrl !== url) {
        this.logger.info(`Resolved redirect (cached): ${url} → ${cached.finalUrl}`);
      }
      return cached.finalUrl;
    }
    let browser: Browser | null = null;
    try {
      const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
      browser = await puppeteer.launch({
        headless: true,
        args: PUPPETEER_FLAGS,
        ...(chromePath ? { executablePath: chromePath } : {}),
      });
      const page = await browser.newPage();
      // Navigate and wait for redirects to settle (networkidle0 = no requests for 500ms)
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
      const finalUrl = page.url();
      await page.close();
      // Cache the result regardless of whether there was a redirect
      PerformanceAgent.redirectCache.set(url, { finalUrl: finalUrl || url, timestamp: Date.now() });
      if (finalUrl && finalUrl !== url) {
        this.logger.info(`Resolved redirect: ${url} → ${finalUrl}`);
        return finalUrl;
      }
    } catch (e) {
      this.logger.warn('Redirect resolution failed, using original URL', { error: String(e) });
    } finally {
      if (browser) await browser.close();
    }
    // Cache "no redirect" result too
    PerformanceAgent.redirectCache.set(url, { finalUrl: url, timestamp: Date.now() });
    return url;
  }

  protected async scan(config: ScanConfig): Promise<void> {
    // Resolve redirects before scanning to prevent LanternError from double-navigation traces
    const url = await this.resolveRedirects(config.target.url!);
    const platforms: Platform[] = config.platform === 'both' ? ['desktop', 'mweb'] : [config.platform];

    // Platform-specific analyses (Lighthouse, CWV, Player)
    for (const platform of platforms) {
      this.logger.info(`Running performance scan for ${platform}`);

      // Phase 1: Lighthouse audit (with retry on failure)
      await this.runLighthouse(url, platform);

      // Phase 2: Core Web Vitals (real measurement)
      await this.measureCoreWebVitals(url, platform);

      // Phase 3: OTT Player Metrics
      await this.measurePlayerMetrics(url, platform);
    }

    // Phase 4: CDN & Resource Analysis — run ONCE (platform-independent)
    await this.analyzeCDN(url);
    await this.analyzeResources(url);

    // Phase 5: Generate grouped CDN findings (instead of per-asset)
    this.generateGroupedCDNFindings(url);

    // Phase 6: Populate structured metadata for dashboard
    this.populateMetadata(platforms);
  }

  protected async teardown(): Promise<void> {
    // Close all tracked Puppeteer browsers (CWV, player, CDN, resource)
    for (const b of this._activeBrowsers) {
      try { await b.close(); } catch { /* already closed */ }
    }
    this._activeBrowsers = [];

    // Kill chrome-launcher instance (Lighthouse) — uses the specific pid, safe for concurrency
    if (this.chrome) {
      try { await this.chrome.kill(); } catch { /* already dead */ }
      this.chrome = undefined;
    }

    // NOTE: Do NOT pkill all chrome processes — that kills other concurrent scans' Chrome.
    // Each chrome-launcher/puppeteer instance tracks its own pid and cleans up via .kill()/.close().
  }

  // ---------------------------------------------------------------------------
  // Lighthouse Audit — Multi-run median strategy for consistency
  // ---------------------------------------------------------------------------
  // Per Google's docs, Lighthouse has ±5-10 pt variance per run. Running N times
  // and taking the MEDIAN halves variance to ±2-5 pts. We run LIGHTHOUSE_RUNS
  // times, discard score=0 failures, and pick the median result.
  // ---------------------------------------------------------------------------
  private async runLighthouse(url: string, platform: Platform): Promise<void> {
    this.logger.info(`Running Lighthouse for ${platform} (${LIGHTHOUSE_RUNS} runs, median strategy)`);

    if (!this.chrome) return;

    const config = platform === 'mweb' ? LIGHTHOUSE_MOBILE_CONFIG : LIGHTHOUSE_DESKTOP_CONFIG;
    const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

    // Collect all valid run results
    const runResults: { score: number; lhr: any }[] = [];
    let lastError: string | null = null;
    let consecutiveFailures = 0;

    for (let run = 1; run <= LIGHTHOUSE_RUNS; run++) {
      try {
        this.logger.info(`Lighthouse run ${run}/${LIGHTHOUSE_RUNS} for ${platform}`);

        const result = await lighthouse(url, {
          port: this.chrome.port,
          output: 'json',
          logLevel: 'error',
        }, config);

        if (!result?.lhr) {
          lastError = 'Lighthouse returned no result';
          this.logger.warn(`Lighthouse run ${run}/${LIGHTHOUSE_RUNS}: no LHR returned for ${platform}`);
          consecutiveFailures++;
        } else {
          const lhr = result.lhr;
          const perfScore = Math.round((lhr.categories.performance?.score || 0) * 100);

          // Log score=0 diagnostics
          if (perfScore === 0) {
            const runtimeErrors = lhr.runtimeError?.code || 'none';
            this.logger.warn(`Lighthouse run ${run} score=0 diagnostics`, {
              platform, run, chromePort: this.chrome?.port,
              runtimeError: runtimeErrors,
              fcp: lhr.audits?.['first-contentful-paint']?.numericValue || 'missing',
              lcp: lhr.audits?.['largest-contentful-paint']?.numericValue || 'missing',
              auditsCount: Object.keys(lhr.audits || {}).length,
            });
            consecutiveFailures++;
          } else {
            runResults.push({ score: perfScore, lhr });
            consecutiveFailures = 0;
          }

          this.logger.info(`Lighthouse run ${run}: ${platform} score = ${perfScore}`);
        }

        // If 2+ consecutive failures, relaunch Chrome
        if (consecutiveFailures >= 2 && run < LIGHTHOUSE_RUNS) {
          this.logger.warn('2+ consecutive Lighthouse failures, relaunching Chrome...');
          await this.chrome.kill();
          this.chrome = await chromeLauncher.launch({
            chromeFlags: CHROME_FLAGS,
            ignoreDefaultFlags: true,
            ...(chromePath ? { chromePath } : {}),
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
          consecutiveFailures = 0;
        }
      } catch (error) {
        lastError = String(error);
        this.logger.warn(`Lighthouse run ${run}/${LIGHTHOUSE_RUNS} failed for ${platform}: ${lastError}`);
        consecutiveFailures++;

        // Relaunch Chrome after exception
        if (run < LIGHTHOUSE_RUNS) {
          try {
            await this.chrome.kill();
            this.chrome = await chromeLauncher.launch({
              chromeFlags: CHROME_FLAGS,
              ignoreDefaultFlags: true,
              ...(chromePath ? { chromePath } : {}),
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
            consecutiveFailures = 0;
          } catch (relaunchErr) {
            this.logger.error('Failed to relaunch Chrome', { error: String(relaunchErr) });
          }
        }
      }
    }

    // ── Select MEDIAN result ──
    if (runResults.length === 0) {
      this.logger.error(`Lighthouse failed: 0 valid runs out of ${LIGHTHOUSE_RUNS} for ${platform}`);
      this.addFinding({
        severity: 'info',
        category: 'Lighthouse',
        title: `Lighthouse scan incomplete for ${platform}`,
        description: `Lighthouse could not calculate a performance score for ${platform}. All ${LIGHTHOUSE_RUNS} runs returned score 0 or failed.`,
        location: { url },
        evidence: `0 valid runs out of ${LIGHTHOUSE_RUNS}. Last error: ${lastError || 'none'}`,
        remediation: 'Check if the site blocks headless Chrome. Try running Chrome DevTools Lighthouse manually to compare.',
        references: [],
        autoFixable: false,
      });
      return;
    }

    // Sort by score and pick median
    runResults.sort((a, b) => a.score - b.score);
    const medianIdx = Math.floor(runResults.length / 2);
    const medianResult = runResults[medianIdx];
    const allScores = runResults.map(r => r.score);
    const minScore = allScores[0];
    const maxScore = allScores[allScores.length - 1];
    const variance = maxScore - minScore;

    const finalScore = medianResult.score;
    const finalLhr = medianResult.lhr;

    this.logger.info(`Lighthouse ${platform} median selection`, {
      runs: LIGHTHOUSE_RUNS,
      validRuns: runResults.length,
      allScores: allScores.join(', '),
      median: finalScore,
      min: minScore,
      max: maxScore,
      variance,
    });

    // Store median scores per-platform for metadata (all 5 Lighthouse categories)
    this._lhScoresMap[platform] = {
      performance: finalScore,
      accessibility: Math.round((finalLhr.categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((finalLhr.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((finalLhr.categories.seo?.score || 0) * 100),
      pwa: Math.round((finalLhr.categories.pwa?.score || 0) * 100),
    };

    this.logger.info(`Lighthouse ${platform} (median of ${runResults.length}): Performance=${finalScore}, Accessibility=${this._lhScoresMap[platform].accessibility}, BestPractices=${this._lhScoresMap[platform].bestPractices}, SEO=${this._lhScoresMap[platform].seo}, PWA=${this._lhScoresMap[platform].pwa}`);

    // Check against target
    if (finalScore < THRESHOLDS.lighthouseScore) {
      this.addFinding({
        severity: finalScore < 50 ? 'critical' : finalScore < 80 ? 'high' : 'medium',
        category: 'Lighthouse',
        title: `Lighthouse performance score: ${finalScore} (target: ${THRESHOLDS.lighthouseScore})`,
        description: `${platform} Lighthouse performance score is ${finalScore}/100, below the target of ${THRESHOLDS.lighthouseScore}. (Median of ${runResults.length} runs; range: ${minScore}-${maxScore})`,
        location: { url },
        evidence: JSON.stringify({
          performance: finalScore,
          accessibility: this._lhScoresMap[platform].accessibility,
          bestPractices: this._lhScoresMap[platform].bestPractices,
          seo: this._lhScoresMap[platform].seo,
          runs: allScores,
          variance,
        }),
        remediation: this.generateLighthouseRemediation(finalLhr),
        references: [],
        autoFixable: false,
      });
    }

    // Warn if variance is very high (indicates environment instability)
    if (variance > 15 && runResults.length >= 2) {
      this.addFinding({
        severity: 'info',
        category: 'Lighthouse',
        title: `High Lighthouse variance for ${platform}: ${variance} pts (${allScores.join(', ')})`,
        description: `Lighthouse scores varied by ${variance} points across ${runResults.length} runs. This may indicate CPU contention, network instability, or non-deterministic page content.`,
        location: { url },
        evidence: `Scores: ${allScores.join(', ')} | Variance: ${variance}`,
        remediation: 'Ensure no other heavy processes are running during scans. Consider running scans on dedicated hardware.',
        references: ['https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md'],
        autoFixable: false,
      });
    }

    // Extract individual audit failures from median result
    const failedAudits = Object.values(finalLhr.audits)
      .filter((audit: any) => audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode === 'numeric')
      .sort((a: any, b: any) => (a.score || 0) - (b.score || 0))
      .slice(0, 10);

    for (const audit of failedAudits as any[]) {
      this.addFinding({
        severity: audit.score < 0.5 ? 'high' : 'medium',
        category: 'Lighthouse Audit',
        title: `[${platform}] ${audit.title}: ${audit.displayValue || 'Failed'}`,
        description: audit.description?.substring(0, 200) || '',
        location: { url },
        evidence: `Score: ${Math.round((audit.score || 0) * 100)}/100`,
        remediation: audit.description || 'Review Lighthouse audit details for specific recommendations.',
        references: [],
        autoFixable: false,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Core Web Vitals Measurement
  // ---------------------------------------------------------------------------
  private async measureCoreWebVitals(url: string, platform: Platform): Promise<void> {
    this.logger.info('Measuring Core Web Vitals');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        ...PUPPETEER_FLAGS,
        ...(platform === 'mweb' ? ['--window-size=375,812'] : ['--window-size=1350,940']),
      ],
    });
    this._activeBrowsers.push(browser);

    try {
      const page = await browser.newPage();

      if (platform === 'mweb') {
        await page.setViewport({ width: 375, height: 812, isMobile: true, deviceScaleFactor: 3 });
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
      } else {
        await page.setViewport({ width: 1350, height: 940, deviceScaleFactor: 1 });
      }

      // Inject web-vitals measurement
      await page.evaluateOnNewDocument(() => {
        (window as any).__webVitals = {};
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
              (window as any).__webVitals.lcp = entry.startTime;
            }
            if (entry.entryType === 'first-input') {
              (window as any).__webVitals.fid = (entry as any).processingStart - entry.startTime;
            }
            if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
              (window as any).__webVitals.cls = ((window as any).__webVitals.cls || 0) + (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        observer.observe({ type: 'first-input', buffered: true });
        observer.observe({ type: 'layout-shift', buffered: true });
      });

      const startTime = Date.now();
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const ttfb = Date.now() - startTime;

      // Wait for metrics to stabilize (reduced from 5s to 3s for faster scans)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Collect paint timing
      const paintTimings = await page.evaluate(() => {
        const entries = performance.getEntriesByType('paint');
        return {
          fcp: entries.find((e) => e.name === 'first-contentful-paint')?.startTime || 0,
        };
      });

      // Collect web vitals
      const webVitals = await page.evaluate(() => (window as any).__webVitals || {});

      // Assess each metric
      const metrics: { name: string; value: number; threshold: number; unit: string }[] = [
        { name: 'LCP', value: webVitals.lcp || 0, threshold: THRESHOLDS.lcp, unit: 'ms' },
        { name: 'FCP', value: paintTimings.fcp, threshold: THRESHOLDS.fcp, unit: 'ms' },
        { name: 'CLS', value: webVitals.cls || 0, threshold: THRESHOLDS.cls, unit: '' },
        { name: 'FID', value: webVitals.fid || 0, threshold: THRESHOLDS.fid, unit: 'ms' },
        { name: 'TTFB', value: ttfb, threshold: THRESHOLDS.ttfb, unit: 'ms' },
      ];

      // Store CWV values for metadata
      const rateMetric = (val: number, good: number, poor: number): 'good' | 'needs-improvement' | 'poor' =>
        val <= good ? 'good' : val <= poor ? 'needs-improvement' : 'poor';

      this._cwvValuesMap[platform] = {
        lcp: { value: webVitals.lcp || 0, rating: rateMetric(webVitals.lcp || 0, 2500, 4000) },
        fcp: { value: paintTimings.fcp || 0, rating: rateMetric(paintTimings.fcp || 0, 1800, 3000) },
        cls: { value: webVitals.cls || 0, rating: rateMetric(webVitals.cls || 0, 0.1, 0.25) },
        fid: { value: webVitals.fid || 0, rating: rateMetric(webVitals.fid || 0, 100, 300) },
        ttfb: { value: ttfb, rating: rateMetric(ttfb, 800, 1800) },
        inp: { value: 0, rating: 'good' as const },
      };

      for (const metric of metrics) {
        const isOverThreshold = metric.value > metric.threshold;

        if (isOverThreshold && metric.value > 0) {
          const severity: Severity = metric.value > metric.threshold * 2 ? 'critical'
            : metric.value > metric.threshold * 1.5 ? 'high' : 'medium';

          this.addFinding({
            severity,
            category: 'Core Web Vitals',
            title: `[${platform}] ${metric.name}: ${metric.value.toFixed(metric.name === 'CLS' ? 3 : 0)}${metric.unit} (target: <${metric.threshold}${metric.unit})`,
            description: `${metric.name} exceeds the target threshold on ${platform}. Current: ${metric.value.toFixed(2)}${metric.unit}, Target: <${metric.threshold}${metric.unit}`,
            location: { url },
            evidence: `Measured ${metric.name}: ${metric.value}${metric.unit}`,
            remediation: this.getWebVitalRemediation(metric.name),
            references: ['https://web.dev/vitals/'],
            autoFixable: false,
          });
        }
      }
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // OTT Player Metrics
  // ---------------------------------------------------------------------------
  private async measurePlayerMetrics(url: string, platform: Platform): Promise<void> {
    this.logger.info('Measuring OTT player metrics');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [...PUPPETEER_FLAGS, '--autoplay-policy=no-user-gesture-required'],
    });
    this._activeBrowsers.push(browser);

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Try to find and interact with a video player
      const playerMetrics = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return null;

        return {
          hasVideo: true,
          readyState: video.readyState,
          networkState: video.networkState,
          currentSrc: video.currentSrc ? 'present' : 'none',
          duration: video.duration,
          buffered: video.buffered.length > 0 ? video.buffered.end(0) : 0,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          // Check for common player SDKs
          hasShakaPlayer: !!(window as any).shaka,
          hasHlsJs: !!(window as any).Hls,
          hasDashJs: !!(window as any).dashjs,
          hasBitmovin: !!(window as any).bitmovin,
        };
      });

      if (!playerMetrics?.hasVideo) {
        this.logger.info('No video player found on landing page - skipping player metrics');
        this._playerMetrics = {}; // Mark as "no player"
        return;
      }

      // Monitor player startup time
      const startupTime = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          const video = document.querySelector('video');
          if (!video) return resolve(0);

          const start = performance.now();
          if (video.readyState >= 3) {
            resolve(0); // Already ready
            return;
          }

          const timeout = setTimeout(() => resolve(10000), 10000);
          video.addEventListener('canplay', () => {
            clearTimeout(timeout);
            resolve(performance.now() - start);
          }, { once: true });

          // Try to play
          video.play().catch(() => {});
        });
      });

      if (startupTime > THRESHOLDS.playerStartup) {
        this.addFinding({
          severity: startupTime > 6000 ? 'critical' : 'high',
          category: 'Player Performance',
          title: `[${platform}] Player startup delay: ${startupTime.toFixed(0)}ms (target: <${THRESHOLDS.playerStartup}ms)`,
          description: `Video player takes ${startupTime.toFixed(0)}ms to reach playable state, exceeding the ${THRESHOLDS.playerStartup}ms target.`,
          location: { url },
          evidence: `Startup time: ${startupTime}ms`,
          remediation: 'Optimize player initialization: preload manifest, use server-side ad insertion, preconnect to CDN, lazy-load non-critical player plugins.',
          references: [],
          autoFixable: false,
        });
      }

      // Check for ABR (Adaptive Bitrate) configuration
      const abrConfig = await page.evaluate(() => {
        // Check Shaka Player ABR
        if ((window as any).shaka) {
          const player = (document.querySelector('video') as any)?.player;
          if (player) {
            return { engine: 'shaka', config: 'detected' };
          }
        }
        // Check hls.js ABR
        if ((window as any).Hls) {
          return { engine: 'hls.js', config: 'detected' };
        }
        return null;
      });

      if (!abrConfig) {
        this.addFinding({
          severity: 'medium',
          category: 'Player Performance',
          title: 'No ABR streaming engine detected',
          description: 'Could not detect an adaptive bitrate streaming engine (Shaka, hls.js, dash.js).',
          location: { url },
          remediation: 'Implement ABR streaming for optimal video delivery. Use Shaka Player or hls.js for HLS/DASH content.',
          references: [],
          autoFixable: false,
        });
      }

      // Store player metrics for metadata
      this._playerMetrics = {
        startupDelay: startupTime,
        timeToFirstFrame: startupTime,
        bufferRatio: 0,
        rebufferEvents: 0,
        abrSwitchCount: abrConfig ? 1 : 0,
        abrSwitchLatency: 0,
        drmLicenseTime: 0,
        playbackFailures: 0,
      };
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // CDN Analysis (collects issues, findings generated later as grouped)
  // ---------------------------------------------------------------------------
  private async analyzeCDN(url: string): Promise<void> {
    this.logger.info('Analyzing CDN configuration');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: PUPPETEER_FLAGS,
    });
    this._activeBrowsers.push(browser);

    try {
      const page = await browser.newPage();

      page.on('response', async (response) => {
        const headers = response.headers();
        const resUrl = response.url();

        // Check cache headers
        const cacheControl = headers['cache-control'] || '';
        const cdnHeaders = headers['x-cache'] || headers['x-cdn'] || headers['cf-cache-status'] || '';

        if (resUrl.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|mp4|m3u8|ts)$/i)) {
          // Track CDN stats for metadata
          this._cdnStats.total++;
          if (cdnHeaders.toLowerCase().includes('hit')) this._cdnStats.hits++;

          // Collect issues for grouped findings (instead of per-asset)
          if (!cacheControl || cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
            this._cdnIssues.missingCache.push(new URL(resUrl).pathname.split('/').pop() || resUrl);
          }

          // Check compression
          const encoding = headers['content-encoding'];
          if (encoding) this._cdnStats.compressed++;
          else this._cdnStats.uncompressed++;
          const contentType = headers['content-type'] || '';
          if (!encoding && (contentType.includes('javascript') || contentType.includes('css') || contentType.includes('html'))) {
            this._cdnIssues.uncompressed.push(new URL(resUrl).pathname.split('/').pop() || resUrl);
          }
        }
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Generate grouped CDN findings (1 per issue type, not per asset)
  // ---------------------------------------------------------------------------
  private generateGroupedCDNFindings(url: string): void {
    const { missingCache, uncompressed } = this._cdnIssues;

    if (missingCache.length > 0) {
      // One grouped finding instead of N individual findings
      const severity: Severity = missingCache.length > 20 ? 'high' : missingCache.length > 5 ? 'medium' : 'low';
      this.addFinding({
        severity,
        category: 'CDN Performance',
        title: `${missingCache.length} static assets lack proper cache headers`,
        description: `Found ${missingCache.length} static resources without adequate Cache-Control headers. These assets are not being cached by browsers or CDN, causing redundant network requests.`,
        location: { url },
        evidence: `Affected resources: ${missingCache.slice(0, 5).join(', ')}${missingCache.length > 5 ? ` ... and ${missingCache.length - 5} more` : ''}`,
        remediation: 'Set aggressive cache headers for static assets: Cache-Control: public, max-age=31536000, immutable',
        references: [],
        autoFixable: true,
      });
    }

    if (uncompressed.length > 0) {
      const severity: Severity = uncompressed.length > 10 ? 'high' : uncompressed.length > 3 ? 'medium' : 'low';
      this.addFinding({
        severity,
        category: 'CDN Performance',
        title: `${uncompressed.length} text assets served without compression`,
        description: `Found ${uncompressed.length} text-based resources (JS/CSS/HTML) served without gzip/brotli compression.`,
        location: { url },
        evidence: `Affected resources: ${uncompressed.slice(0, 5).join(', ')}${uncompressed.length > 5 ? ` ... and ${uncompressed.length - 5} more` : ''}`,
        remediation: 'Enable Brotli (preferred) or gzip compression for all text-based assets at the CDN level.',
        references: [],
        autoFixable: true,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Resource Analysis
  // ---------------------------------------------------------------------------
  private async analyzeResources(url: string): Promise<void> {
    this.logger.info('Analyzing resource loading');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: PUPPETEER_FLAGS,
    });
    this._activeBrowsers.push(browser);

    try {
      const page = await browser.newPage();

      const resources: { url: string; type: string; size: number }[] = [];

      page.on('response', async (response) => {
        try {
          const buffer = await response.buffer();
          resources.push({
            url: response.url(),
            type: response.headers()['content-type'] || 'unknown',
            size: buffer.length,
          });
        } catch {
          // Some responses can't be buffered
        }
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
      const jsSize = resources.filter((r) => r.type.includes('javascript')).reduce((sum, r) => sum + r.size, 0);
      const cssSize = resources.filter((r) => r.type.includes('css')).reduce((sum, r) => sum + r.size, 0);
      const imgSize = resources.filter((r) => r.type.includes('image')).reduce((sum, r) => sum + r.size, 0);
      const fontSize = resources.filter((r) => r.type.includes('font') || r.url.match(/\.(woff2?|ttf|otf|eot)$/i)).reduce((sum, r) => sum + r.size, 0);

      // Total page weight check
      if (totalSize > 5_000_000) { // 5MB
        this.addFinding({
          severity: totalSize > 10_000_000 ? 'critical' : 'high',
          category: 'Resource Size',
          title: `Total page weight: ${(totalSize / 1_000_000).toFixed(1)}MB`,
          description: `Total page weight of ${(totalSize / 1_000_000).toFixed(1)}MB exceeds recommended 5MB limit. JS: ${(jsSize / 1_000_000).toFixed(1)}MB, CSS: ${(cssSize / 1_000).toFixed(0)}KB, Images: ${(imgSize / 1_000_000).toFixed(1)}MB`,
          location: { url },
          evidence: `Total: ${totalSize}, JS: ${jsSize}, CSS: ${cssSize}, Images: ${imgSize}`,
          remediation: 'Implement code splitting, tree-shaking, lazy loading for images, and optimize asset delivery.',
          references: [],
          autoFixable: false,
        });
      }

      // Check for render-blocking resources
      const renderBlocking = await page.evaluate(() => {
        const blocking: string[] = [];
        document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
          if (!el.hasAttribute('media') || el.getAttribute('media') === 'all') {
            blocking.push(el.getAttribute('href') || 'inline');
          }
        });
        document.querySelectorAll('script:not([async]):not([defer]):not([type="module"])').forEach((el) => {
          if (el.getAttribute('src')) {
            blocking.push(el.getAttribute('src')!);
          }
        });
        return blocking;
      });

      // Store resource data for metadata
      this._resourceData = {
        totalSize,
        jsSize,
        cssSize,
        imageSize: imgSize,
        fontSize,
        thirdPartySize: 0,
        requestCount: resources.length,
        renderBlocking,
      };

      if (renderBlocking.length > 3) {
        this.addFinding({
          severity: 'high',
          category: 'Render Blocking',
          title: `${renderBlocking.length} render-blocking resources detected`,
          description: `Found ${renderBlocking.length} render-blocking CSS/JS resources that delay first paint.`,
          location: { url },
          evidence: renderBlocking.slice(0, 5).join(', '),
          remediation: 'Use async/defer for scripts, inline critical CSS, and load non-critical CSS asynchronously.',
          references: ['https://web.dev/render-blocking-resources/'],
          autoFixable: false,
        });
      }
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Populate Structured Metadata for Dashboard
  // ---------------------------------------------------------------------------
  private populateMetadata(platforms: Platform[]): void {
    // ── Lighthouse Metrics ──
    // Use desktop scores as primary (matches Chrome DevTools); fall back to mobile.
    // IMPORTANT: Always populate lighthouseData so dashboard donut charts always render.
    // When Lighthouse fails, estimate performanceScore from CWV data.
    const primaryLH = this._lhScoresMap['desktop'] || this._lhScoresMap['mweb'] || null;
    let lighthouseData: Record<string, unknown>;
    if (primaryLH) {
      lighthouseData = {
        performanceScore: primaryLH.performance,
        accessibilityScore: primaryLH.accessibility,
        bestPracticesScore: primaryLH.bestPractices,
        seoScore: primaryLH.seo,
        pwaScore: primaryLH.pwa,
        estimated: false,
        ...(Object.keys(this._lhScoresMap).length > 1 ? { byPlatform: this._lhScoresMap } : {}),
      };
    } else {
      // Lighthouse failed — estimate performance from CWV so dashboard always shows gauges
      const cwvLcp = this._cwvValuesMap['desktop']?.lcp?.value || this._cwvValuesMap['mweb']?.lcp?.value || 0;
      const estPerf = cwvLcp > 0
        ? (cwvLcp <= 2500 ? 90 : cwvLcp <= 4000 ? Math.round(90 - ((cwvLcp - 2500) / 1500) * 40) : Math.max(10, Math.round(50 - ((cwvLcp - 4000) / 4000) * 40)))
        : 50;
      lighthouseData = {
        performanceScore: estPerf,
        accessibilityScore: 0,
        bestPracticesScore: 0,
        seoScore: 0,
        pwaScore: 0,
        estimated: true,
      };
      this.logger.warn(`Lighthouse failed — estimated performanceScore=${estPerf} from CWV LCP=${cwvLcp}ms for dashboard`);
    }

    // ── Core Web Vitals ──
    // Use desktop CWV as primary; fall back to mobile
    const primaryCWV = this._cwvValuesMap['desktop'] || this._cwvValuesMap['mweb'] || null;
    const coreWebVitals = primaryCWV || null;

    // ── Player Metrics ──
    const hasPlayer = this._playerMetrics && Object.keys(this._playerMetrics).length > 0;
    const playerMetrics = hasPlayer
      ? {
          startupDelay: this._playerMetrics.startupDelay || 0,
          timeToFirstFrame: this._playerMetrics.timeToFirstFrame || 0,
          bufferRatio: this._playerMetrics.bufferRatio || 0,
          rebufferEvents: this._playerMetrics.rebufferEvents || 0,
          abrSwitchCount: this._playerMetrics.abrSwitchCount || 0,
          abrSwitchLatency: this._playerMetrics.abrSwitchLatency || 0,
          drmLicenseTime: this._playerMetrics.drmLicenseTime || 0,
          playbackFailures: this._playerMetrics.playbackFailures || 0,
        }
      : null;

    // ── CDN Metrics ──
    const cdnTotal = this._cdnStats.total || 1;
    const cdnMetrics = {
      hitRatio: this._cdnStats.total > 0 ? this._cdnStats.hits / cdnTotal : 0,
      avgLatency: 0,
      p95Latency: 0,
      compressionEnabled: this._cdnStats.compressed > this._cdnStats.uncompressed,
    };

    // ── Resource Metrics ──
    const resourceMetrics = this._resourceData
      ? {
          totalSize: this._resourceData.totalSize,
          jsSize: this._resourceData.jsSize,
          cssSize: this._resourceData.cssSize,
          imageSize: this._resourceData.imageSize,
          fontSize: this._resourceData.fontSize,
          thirdPartySize: this._resourceData.thirdPartySize,
          requestCount: this._resourceData.requestCount,
          renderBlockingResources: this._resourceData.renderBlocking,
        }
      : null;

    this.metadata = {
      lighthouse: lighthouseData,
      coreWebVitals,
      playerMetrics,
      cdnMetrics,
      resourceMetrics,
    };
  }

  // ---------------------------------------------------------------------------
  // Scoring (v2 — Lighthouse-aligned, 75/10/8/7 split)
  // ---------------------------------------------------------------------------
  protected calculateScore(): WeightedScore {
    // ── Chrome DevTools–aligned scoring (v3) ──
    //
    // Goal: VZY Performance Score ≈ Chrome Lighthouse Performance Score (±5 pts)
    // Lighthouse gets 85/100 pts so VZY score closely tracks Chrome DevTools.
    // Remaining 15 pts = OTT-specific factors Chrome doesn't measure.
    //
    // Example: Lighthouse 63 → 63% of 85 = 53.55 + OTT ~12 → VZY ~66 (vs Chrome 63)
    // Old v2:  Lighthouse 63 → 63% of 75 = 47.25 + OTT ~17 → VZY ~64 (wider gap possible)

    // 1. LIGHTHOUSE SCORE (85 points) — directly proportional to actual Lighthouse score
    //    Use desktop as primary (matches Chrome DevTools comparison), fall back to mobile
    const lighthouseFindings = this.findings.filter((f) => f.category === 'Lighthouse');
    const desktopLH = this._lhScoresMap['desktop']?.performance;
    const mobileLH = this._lhScoresMap['mweb']?.performance;
    const primaryLHScore = (desktopLH !== undefined && desktopLH > 0)
      ? desktopLH
      : (mobileLH !== undefined && mobileLH > 0)
        ? mobileLH
        : null;

    let lighthouseActual: number;
    if (primaryLHScore !== null) {
      lighthouseActual = Math.round((primaryLHScore / 100) * 85 * 100) / 100;
    } else {
      // Lighthouse FAILED — estimate from CWV data if available
      const cwvLcp = this._cwvValuesMap['desktop']?.lcp?.value || this._cwvValuesMap['mweb']?.lcp?.value || 0;
      const cwvFcp = this._cwvValuesMap['desktop']?.fcp?.value || this._cwvValuesMap['mweb']?.fcp?.value || 0;
      if (cwvLcp > 0 || cwvFcp > 0) {
        const lcpScore = cwvLcp <= 2500 ? 90 : cwvLcp <= 4000 ? Math.round(90 - ((cwvLcp - 2500) / 1500) * 40) : Math.max(10, Math.round(50 - ((cwvLcp - 4000) / 4000) * 40));
        lighthouseActual = Math.round((lcpScore / 100) * 85 * 100) / 100;
        this.logger.warn(`Lighthouse failed — estimated score from CWV LCP (${cwvLcp}ms → ~${lcpScore}/100 → ${lighthouseActual}/85)`);
      } else {
        lighthouseActual = 42.5; // 50% default (42.5/85)
        this.logger.warn('Lighthouse failed and no CWV data available — using 50% default (42.5/85)');
      }
    }
    const lighthouseAuditFindings = this.findings.filter((f) => f.category === 'Lighthouse Audit');

    // 2. CWV — NOT scored (already in Lighthouse). Kept for dashboard display only.
    const cwvFindings = this.findings.filter((f) => f.category === 'Core Web Vitals');

    // 3. PLAYER METRICS (6 points) — OTT-specific, not part of Lighthouse
    const playerFindings = this.findings.filter((f) => f.category.includes('Player'));
    const playerPenalty = playerFindings.reduce((sum, f) => {
      const w = f.severity === 'critical' ? 4 : f.severity === 'high' ? 2 : 1;
      return sum + w;
    }, 0);
    const playerActual = Math.max(0, 6 - Math.min(playerPenalty, 6));

    // 4. CDN EFFICIENCY (5 points) — OTT-specific (CDN config, cache headers, compression)
    const cdnFindings = this.findings.filter((f) => f.category.includes('CDN'));
    const cdnPenalty = cdnFindings.reduce((sum, f) => {
      const w = f.severity === 'critical' ? 3 : f.severity === 'high' ? 2 : 1;
      return sum + w;
    }, 0);
    const cdnActual = Math.max(0, 5 - Math.min(cdnPenalty, 5));

    // 5. RESOURCE OPTIMIZATION (4 points) — page weight, render-blocking
    const resourceFindings = this.findings.filter((f) =>
      f.category.includes('Resource') || f.category.includes('Render'),
    );
    const resourcePenalty = resourceFindings.reduce((sum, f) => {
      const w = f.severity === 'critical' ? 3 : f.severity === 'high' ? 2 : 1;
      return sum + w;
    }, 0);
    const resourceActual = Math.max(0, 4 - Math.min(resourcePenalty, 4));

    const breakdown = [
      {
        metric: 'Lighthouse Score', value: primaryLHScore || 0, maxScore: 85,
        actualScore: lighthouseActual,
        penalty: Math.round((85 - lighthouseActual) * 100) / 100,
        details: `Raw LH: ${primaryLHScore ?? 'N/A'}/100 → ${lighthouseActual}/85 | ${lighthouseFindings.length} finding(s), ${lighthouseAuditFindings.length} audit(s)`,
      },
      {
        metric: 'Core Web Vitals (info)', value: 0, maxScore: 0,
        actualScore: 0,
        penalty: 0,
        details: `${cwvFindings.length} finding(s) — included in Lighthouse score`,
      },
      {
        metric: 'Player Metrics', value: 0, maxScore: 6,
        actualScore: playerActual,
        penalty: Math.min(playerPenalty, 6),
        details: `${playerFindings.length} finding(s)`,
      },
      {
        metric: 'CDN Efficiency', value: 0, maxScore: 5,
        actualScore: cdnActual,
        penalty: Math.min(cdnPenalty, 5),
        details: `${cdnFindings.length} grouped finding(s)`,
      },
      {
        metric: 'Resource Optimization', value: 0, maxScore: 4,
        actualScore: resourceActual,
        penalty: Math.min(resourcePenalty, 4),
        details: `${resourceFindings.length} finding(s)`,
      },
    ];

    const rawScore = this.clampScore(breakdown.reduce((sum, b) => sum + b.actualScore, 0));

    // Log score breakdown for debugging
    this.logger.info('Performance score breakdown (v3)', {
      rawScore,
      lighthouseInput: primaryLHScore,
      lighthouseActual,
      playerActual,
      cdnActual,
      resourceActual,
      findingsCount: this.findings.length,
      expectedChromeDevToolsAlignment: primaryLHScore
        ? `LH ${primaryLHScore} → VZY ${rawScore} (gap: ${Math.abs(rawScore - primaryLHScore)} pts)`
        : 'N/A (Lighthouse failed)',
    });

    return {
      category: 'performance',
      rawScore,
      weight: 0.35,
      weightedScore: rawScore * 0.35,
      breakdown,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private getWebVitalRemediation(metric: string): string {
    const remediations: Record<string, string> = {
      LCP: 'Optimize largest content element: preload hero images, use CDN, inline critical CSS, optimize server response time. For OTT: preload poster images, optimize carousel hero banners.',
      FCP: 'Reduce server response time, eliminate render-blocking resources, inline critical CSS, preconnect to required origins.',
      CLS: 'Set explicit dimensions on images/videos, avoid dynamically injected content above the fold, use CSS contain. For OTT: set fixed dimensions on content thumbnails and carousels.',
      FID: 'Break up long tasks, use web workers for heavy computation, defer non-critical JS. For OTT: defer player SDK initialization.',
      TTFB: 'Optimize server response: use CDN edge caching, optimize database queries, implement HTTP/2 server push, use stale-while-revalidate.',
    };
    return remediations[metric] || 'Review and optimize this metric.';
  }

  private generateLighthouseRemediation(lhr: any): string {
    const opportunities = Object.values(lhr.audits)
      .filter((a: any) => a.details?.type === 'opportunity' && a.details?.overallSavingsMs > 100)
      .sort((a: any, b: any) => (b.details?.overallSavingsMs || 0) - (a.details?.overallSavingsMs || 0))
      .slice(0, 3)
      .map((a: any) => `${a.title} (potential savings: ${(a.details.overallSavingsMs / 1000).toFixed(1)}s)`);

    return opportunities.length > 0
      ? `Top opportunities: ${opportunities.join('; ')}`
      : 'Review Lighthouse report for specific optimization opportunities.';
  }
}
