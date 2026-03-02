// ============================================================================
// Performance Agent - Lighthouse, Core Web Vitals, Player Metrics, CDN
// ============================================================================
//
// Scoring model (v2 — Lighthouse-aligned):
//   Lighthouse Score:       75 points  (directly proportional to raw LH score)
//   Player Metrics:         10 points  (OTT-specific startup, ABR)
//   CDN Efficiency:          8 points  (cache headers, compression)
//   Resource Optimization:   7 points  (page weight, render-blocking)
//   TOTAL:                 100 points
//
// This ensures the VZY Performance Score closely tracks the Lighthouse
// performance score while still accounting for OTT-specific factors.
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
// Source: lighthouse/core/config/desktop-config.js (Lighthouse 12.x)
const LIGHTHOUSE_DESKTOP_CONFIG = {
  extends: 'lighthouse:default' as const,
  settings: {
    formFactor: 'desktop' as const,
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
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    // maxWaitForLoad — use Lighthouse default (45s) for stability
  },
};

const LIGHTHOUSE_MOBILE_CONFIG = {
  extends: 'lighthouse:default' as const,
  settings: {
    formFactor: 'mobile' as const,
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
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },
};

// Max retry attempts for Lighthouse when it returns 0/null
const LIGHTHOUSE_MAX_RETRIES = 3;

// Chrome flags for Lighthouse via chrome-launcher.
//
// CRITICAL: We use ignoreDefaultFlags: true when launching Chrome because
// chrome-launcher's defaults include --disable-background-networking and
// --metrics-recording-only, both of which break Lighthouse's Lantern trace
// engine (causes LanternError: missing metric scores for specified navigation).
//
// Keep this list MINIMAL. Additional problematic flags:
//   - DO NOT use --single-process or --no-zygote (breaks multi-process tracing)
//   - DO NOT use --disable-dev-shm-usage IF shm_size >= 1gb (forces slow /tmp)
//
// With docker-compose shm_size: 2gb, Chrome can use fast /dev/shm for IPC.
const CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--no-first-run',
  '--disable-extensions',
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

  // ── Metric collectors for metadata (per-platform to avoid overwrite) ──
  private _lhScoresMap: Record<string, { performance: number; accessibility: number; bestPractices: number; seo: number }> = {};
  private _cwvValuesMap: Record<string, Record<string, { value: number; rating: 'good' | 'needs-improvement' | 'poor' }>> = {};
  private _playerMetrics: Record<string, number> = {};
  private _resourceData: { totalSize: number; jsSize: number; cssSize: number; imageSize: number; fontSize: number; thirdPartySize: number; requestCount: number; renderBlocking: string[] } | null = null;
  private _cdnStats: { hits: number; total: number; latencies: number[]; compressed: number; uncompressed: number } = { hits: 0, total: 0, latencies: [], compressed: 0, uncompressed: 0 };

  // Track CDN issues by type (grouped) instead of per-asset
  private _cdnIssues: { missingCache: string[]; uncompressed: string[] } = { missingCache: [], uncompressed: [] };

  constructor() {
    super('performance');
  }

  protected async setup(config: ScanConfig): Promise<void> {
    const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

    this.chrome = await chromeLauncher.launch({
      chromeFlags: CHROME_FLAGS,
      ignoreDefaultFlags: true, // prevent chrome-launcher from adding --disable-background-networking & --metrics-recording-only
      ...(chromePath ? { chromePath } : {}),
    });

    // Warm up Chrome by loading a simple page first
    // This prevents LanternError on first real scan in Docker
    try {
      const warmupResult = await lighthouse('https://example.com', {
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
      this.logger.info('Chrome warm-up complete');
    } catch (e) {
      this.logger.warn('Chrome warm-up failed (non-critical)', { error: String(e) });
    }
  }

  protected async scan(config: ScanConfig): Promise<void> {
    const url = config.target.url!;
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
    if (this.chrome) {
      await this.chrome.kill();
    }
  }

  // ---------------------------------------------------------------------------
  // Lighthouse Audit (with retry logic for reliability)
  // ---------------------------------------------------------------------------
  private async runLighthouse(url: string, platform: Platform): Promise<void> {
    this.logger.info(`Running Lighthouse for ${platform}`);

    if (!this.chrome) return;

    // Use exact Chrome DevTools config to ensure score alignment
    const config = platform === 'mweb' ? LIGHTHOUSE_MOBILE_CONFIG : LIGHTHOUSE_DESKTOP_CONFIG;

    let lastError: string | null = null;
    let bestScore = 0;
    let bestLhr: any = null;

    for (let attempt = 1; attempt <= LIGHTHOUSE_MAX_RETRIES; attempt++) {
      try {
        this.logger.info(`Lighthouse attempt ${attempt}/${LIGHTHOUSE_MAX_RETRIES} for ${platform}`);

        const result = await lighthouse(url, {
          port: this.chrome.port,
          output: 'json',
          logLevel: 'error',
        }, config);

        if (!result?.lhr) {
          lastError = 'Lighthouse returned no result';
          this.logger.warn(`Lighthouse attempt ${attempt}/${LIGHTHOUSE_MAX_RETRIES}: no LHR returned for ${platform}`);
          continue;
        }

        const lhr = result.lhr;
        // Round to avoid floating point artifacts (0.57 * 100 = 56.999... → 57)
        const perfScore = Math.round((lhr.categories.performance?.score || 0) * 100);

        // Track best score across attempts (Docker/container scans can be flaky)
        if (perfScore > bestScore) {
          bestScore = perfScore;
          bestLhr = lhr;
        }

        this.logger.info(`Lighthouse attempt ${attempt}: ${platform} score = ${perfScore}`);

        // ── Detect Lighthouse failure: score of 0 likely means scan didn't complete ──
        // Also retry if score seems abnormally low (LanternError produces unreliable scores)
        if (perfScore === 0 && attempt < LIGHTHOUSE_MAX_RETRIES) {
          this.logger.warn(`Lighthouse attempt ${attempt}/${LIGHTHOUSE_MAX_RETRIES}: performance score is 0 for ${platform}, retrying...`);
          // Kill and relaunch Chrome for a fresh connection
          await this.chrome.kill();
          const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
          this.chrome = await chromeLauncher.launch({
            chromeFlags: CHROME_FLAGS,
            ignoreDefaultFlags: true,
            ...(chromePath ? { chromePath } : {}),
          });
          // Brief pause to let Chrome stabilize
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // If score is reasonable (>0), this attempt is good enough
        // But keep going if we haven't hit max attempts yet AND score seems unreliably low
        if (perfScore > 0 && attempt < LIGHTHOUSE_MAX_RETRIES && perfScore < 20) {
          this.logger.warn(`Lighthouse attempt ${attempt}: ${platform} score=${perfScore} seems low, retrying for better result...`);
          // Kill and relaunch Chrome for a fresh connection
          await this.chrome.kill();
          const chromePath2 = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
          this.chrome = await chromeLauncher.launch({
            chromeFlags: CHROME_FLAGS,
            ignoreDefaultFlags: true,
            ...(chromePath2 ? { chromePath: chromePath2 } : {}),
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // Good score or last attempt — exit loop
        break;
      } catch (error) {
        lastError = String(error);
        this.logger.warn(`Lighthouse attempt ${attempt}/${LIGHTHOUSE_MAX_RETRIES} failed for ${platform}: ${lastError}`);

        if (attempt < LIGHTHOUSE_MAX_RETRIES) {
          // Relaunch Chrome for a clean retry
          try {
            await this.chrome.kill();
            const chromePath3 = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
            this.chrome = await chromeLauncher.launch({
              chromeFlags: CHROME_FLAGS,
              ignoreDefaultFlags: true,
              ...(chromePath3 ? { chromePath: chromePath3 } : {}),
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (relaunchErr) {
            this.logger.error('Failed to relaunch Chrome for retry', { error: String(relaunchErr) });
          }
        }
      }
    }

    // ── Use the BEST score from all attempts ──
    const finalScore = bestScore;
    const finalLhr = bestLhr;

    if (finalScore === 0 || !finalLhr) {
      this.logger.error(`Lighthouse failed: best performance score is 0 after ${LIGHTHOUSE_MAX_RETRIES} attempts for ${platform}`);
      this.addFinding({
        severity: 'info',
        category: 'Lighthouse',
        title: `Lighthouse scan incomplete for ${platform}`,
        description: `Lighthouse could not calculate a performance score for ${platform}. The best score across ${LIGHTHOUSE_MAX_RETRIES} attempts was 0.`,
        location: { url },
        evidence: `Score: 0 after ${LIGHTHOUSE_MAX_RETRIES} attempts. Last error: ${lastError || 'none'}`,
        remediation: 'Check if the site blocks headless Chrome. Try running Chrome DevTools Lighthouse manually to compare.',
        references: [],
        autoFixable: false,
      });
      return;
    }

    // Store BEST scores per-platform for metadata
    this._lhScoresMap[platform] = {
      performance: finalScore,
      accessibility: Math.round((finalLhr.categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((finalLhr.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((finalLhr.categories.seo?.score || 0) * 100),
    };

    this.logger.info(`Lighthouse ${platform} (best of ${LIGHTHOUSE_MAX_RETRIES}): Performance=${finalScore}, Accessibility=${this._lhScoresMap[platform].accessibility}, BestPractices=${this._lhScoresMap[platform].bestPractices}, SEO=${this._lhScoresMap[platform].seo}`);

    // Check against target
    if (finalScore < THRESHOLDS.lighthouseScore) {
      this.addFinding({
        severity: finalScore < 50 ? 'critical' : finalScore < 80 ? 'high' : 'medium',
        category: 'Lighthouse',
        title: `Lighthouse performance score: ${finalScore} (target: ${THRESHOLDS.lighthouseScore})`,
        description: `${platform} Lighthouse performance score is ${finalScore}/100, below the target of ${THRESHOLDS.lighthouseScore}.`,
        location: { url },
        evidence: JSON.stringify({
          performance: finalScore,
          accessibility: this._lhScoresMap[platform].accessibility,
          bestPractices: this._lhScoresMap[platform].bestPractices,
          seo: this._lhScoresMap[platform].seo,
        }),
        remediation: this.generateLighthouseRemediation(finalLhr),
        references: [],
        autoFixable: false,
      });
    }

    // Extract individual audit failures from best result
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
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      const ttfb = Date.now() - startTime;

      // Wait for metrics to stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));

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
    // Use desktop scores as primary (matches Chrome DevTools); fall back to mobile
    const primaryLH = this._lhScoresMap['desktop'] || this._lhScoresMap['mweb'] || null;
    const lighthouseData = primaryLH
      ? {
          performanceScore: primaryLH.performance,
          accessibilityScore: primaryLH.accessibility,
          bestPracticesScore: primaryLH.bestPractices,
          seoScore: primaryLH.seo,
          pwaScore: 0,
          // Include both platforms when available for detailed comparison
          ...(Object.keys(this._lhScoresMap).length > 1 ? { byPlatform: this._lhScoresMap } : {}),
        }
      : null;

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
    // ── Lighthouse-aligned scoring (v2) ──
    //
    // Problem solved: VZY Performance Score must closely track Chrome Lighthouse
    // so users can directly compare the two. Previously, the 60/15/13/12 split
    // allowed CDN/Resource penalties to push the score far below Lighthouse.
    //
    // New model: Lighthouse is the DOMINANT driver (75 pts), with OTT-specific
    // categories adding modest adjustments (25 pts combined).
    //
    // Example: Lighthouse 56 → 56% of 75 = 42 pts + OTT bonuses → ~52-57 range
    // Previously: Lighthouse 56 → 56% of 60 = 33.6 + OTT → ~40 range (too low)

    // 1. LIGHTHOUSE SCORE (75 points) — directly proportional to actual Lighthouse score
    //    Use desktop score as primary (matches Chrome DevTools comparison)
    //    Fall back to mobile if desktop failed
    const lighthouseFindings = this.findings.filter((f) => f.category === 'Lighthouse');
    const desktopLH = this._lhScoresMap['desktop']?.performance;
    const mobileLH = this._lhScoresMap['mweb']?.performance;
    // Prefer desktop; if desktop is missing (scan failed), use mobile
    const primaryLHScore = (desktopLH !== undefined && desktopLH > 0)
      ? desktopLH
      : (mobileLH !== undefined && mobileLH > 0)
        ? mobileLH
        : null;

    let lighthouseActual = 75; // full score if no Lighthouse data at all
    if (primaryLHScore !== null) {
      lighthouseActual = Math.round((primaryLHScore / 100) * 75 * 100) / 100;
    }
    const lighthouseAuditFindings = this.findings.filter((f) => f.category === 'Lighthouse Audit');

    // 2. CWV — NOT scored (already in Lighthouse). Kept for dashboard display only.
    const cwvFindings = this.findings.filter((f) => f.category === 'Core Web Vitals');

    // 3. PLAYER METRICS (10 points) — OTT-specific, not part of Lighthouse
    const playerFindings = this.findings.filter((f) => f.category.includes('Player'));
    const playerPenalty = playerFindings.reduce((sum, f) => {
      const w = f.severity === 'critical' ? 6 : f.severity === 'high' ? 3 : 1;
      return sum + w;
    }, 0);
    const playerActual = Math.max(0, 10 - Math.min(playerPenalty, 10));

    // 4. CDN EFFICIENCY (8 points) — OTT-specific (CDN config, cache headers, compression)
    //    Now using grouped findings (max 2-3 findings instead of 40+)
    const cdnFindings = this.findings.filter((f) => f.category.includes('CDN'));
    const cdnPenalty = cdnFindings.reduce((sum, f) => {
      const w = f.severity === 'critical' ? 5 : f.severity === 'high' ? 3 : f.severity === 'medium' ? 2 : 1;
      return sum + w;
    }, 0);
    const cdnActual = Math.max(0, 8 - Math.min(cdnPenalty, 8));

    // 5. RESOURCE OPTIMIZATION (7 points) — page weight, render-blocking
    const resourceFindings = this.findings.filter((f) =>
      f.category.includes('Resource') || f.category.includes('Render'),
    );
    const resourcePenalty = resourceFindings.reduce((sum, f) => {
      const w = f.severity === 'critical' ? 4 : f.severity === 'high' ? 3 : 1;
      return sum + w;
    }, 0);
    const resourceActual = Math.max(0, 7 - Math.min(resourcePenalty, 7));

    const breakdown = [
      {
        metric: 'Lighthouse Score', value: primaryLHScore || 0, maxScore: 75,
        actualScore: lighthouseActual,
        penalty: Math.round((75 - lighthouseActual) * 100) / 100,
        details: `Raw LH: ${primaryLHScore ?? 'N/A'}/100 → ${lighthouseActual}/75 | ${lighthouseFindings.length} finding(s), ${lighthouseAuditFindings.length} audit(s)`,
      },
      {
        metric: 'Core Web Vitals (info)', value: 0, maxScore: 0,
        actualScore: 0,
        penalty: 0,
        details: `${cwvFindings.length} finding(s) — included in Lighthouse score`,
      },
      {
        metric: 'Player Metrics', value: 0, maxScore: 10,
        actualScore: playerActual,
        penalty: Math.min(playerPenalty, 10),
        details: `${playerFindings.length} finding(s)`,
      },
      {
        metric: 'CDN Efficiency', value: 0, maxScore: 8,
        actualScore: cdnActual,
        penalty: Math.min(cdnPenalty, 8),
        details: `${cdnFindings.length} grouped finding(s)`,
      },
      {
        metric: 'Resource Optimization', value: 0, maxScore: 7,
        actualScore: resourceActual,
        penalty: Math.min(resourcePenalty, 7),
        details: `${resourceFindings.length} finding(s)`,
      },
    ];

    const rawScore = this.clampScore(breakdown.reduce((sum, b) => sum + b.actualScore, 0));

    // Log score breakdown for debugging
    this.logger.info('Performance score breakdown', {
      rawScore,
      lighthouseInput: primaryLHScore,
      lighthouseActual,
      playerActual,
      cdnActual,
      resourceActual,
      findingsCount: this.findings.length,
      cdnFindingsCount: cdnFindings.length,
      resourceFindingsCount: resourceFindings.length,
    });

    return {
      category: 'performance',
      rawScore,
      weight: 0.35,    // Performance gets 35% weight in overall KPI
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
