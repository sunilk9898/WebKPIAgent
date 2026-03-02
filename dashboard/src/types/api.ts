// ============================================================================
// Dashboard Type Definitions - Mirrors backend types for frontend consumption
// ============================================================================

export type AgentType = "security" | "performance" | "code-quality" | "report-generator";
export type ScanMode = "url" | "repo";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ScanStatus = "queued" | "running" | "completed" | "failed" | "partial";
export type Platform = "desktop" | "mweb" | "both";
export type UserRole = "admin" | "devops" | "developer" | "executive";

// -- KPI Score --
export interface KPIScore {
  scanId: string;
  timestamp: string;
  platform: Platform;
  overallScore: number;
  grades: {
    security: WeightedScore;
    performance: WeightedScore;
    codeQuality: WeightedScore;
  };
  trend: TrendData;
  regressions: Regression[];
  passesThreshold: boolean;
}

export interface WeightedScore {
  category: AgentType;
  rawScore: number;
  weight: number;
  weightedScore: number;
  breakdown: ScoreBreakdown[];
}

export interface ScoreBreakdown {
  metric: string;
  value: number;
  maxScore: number;
  actualScore: number;
  penalty: number;
  details: string;
}

export interface TrendData {
  direction: "improving" | "declining" | "stable";
  delta: number;
  history: { date: string; score: number }[];
}

export interface Regression {
  metric: string;
  previousValue: number;
  currentValue: number;
  delta: number;
  severity: Severity;
  agent: AgentType;
}

// -- Findings --
export interface Finding {
  id: string;
  agent: AgentType;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  location?: {
    file?: string;
    line?: number;
    column?: number;
    url?: string;
    endpoint?: string;
    selector?: string;
  };
  evidence?: string;
  remediation: string;
  references: string[];
  cweId?: string;
  cvssScore?: number;
  autoFixable: boolean;
  jiraTicketId?: string;
}

// -- Agent Results --
export interface AgentResult {
  agentType: AgentType;
  scanId: string;
  status: ScanStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  findings: Finding[];
  score: WeightedScore;
  metadata: Record<string, any>;
  errors: { code: string; message: string; recoverable: boolean; timestamp: string }[];
}

// -- Full Report --
export interface ScanReport {
  id: string;
  scanId: string;
  generatedAt: string;
  target: { mode: ScanMode; url?: string; repoPath?: string };
  platform: Platform;
  kpiScore: KPIScore;
  agentResults: AgentResult[];
  executiveSummary: string;
  criticalFindings: Finding[];
  recommendations: Recommendation[];
  enhancedRecommendations?: EnhancedRecommendation[];
  comparisonWithPrevious?: ScanComparison;
}

export interface Recommendation {
  priority: number;
  title: string;
  description: string;
  impact: string;
  effort: "low" | "medium" | "high";
  category: AgentType;
}

export interface EnhancedRecommendation extends Recommendation {
  impactScore: number;
  riskScore: number;
  easeScore: number;
  projectedScoreGain: number;
  confidence: number;
  quickWin: boolean;
  affectedMetric: string;
  currentValue?: string;
  targetValue?: string;
}

export interface ScanComparison {
  previousScanId: string;
  scoreDelta: number;
  newFindings: Finding[];
  resolvedFindings: Finding[];
  regressions: Regression[];
}

// -- Security-specific metadata --
export interface SecurityMetadata {
  owaspFindings: { category: string; name: string; risk: Severity; details: string; affected: string[] }[];
  headerAnalysis: { score: number; missing: string[]; misconfigured: { header: string; issue: string }[]; present: string[] };
  sslAnalysis: { grade: string; protocol: string; certExpiry: string; issues: string[]; hsts: boolean };
  corsAnalysis: { allowOrigin: string; allowCredentials: boolean; issues: string[]; wildcardDetected: boolean };
  drmAnalysis: { widevineDetected: boolean; fairplayDetected: boolean; licenseUrlExposed: boolean; keyRotation: boolean; issues: string[] };
  apiExposure: { endpoint: string; method: string; authenticated: boolean; sensitiveData: boolean; rateLimit: boolean; issues: string[] }[];
  dependencyVulns: { package: string; version: string; vulnerability: string; severity: Severity; cveId: string; fixVersion?: string }[];
  tokenLeaks: { type: string; location: string; partial: string; severity: Severity }[];
}

// -- Performance-specific metadata --
export interface PerformanceMetadata {
  lighthouse: { performanceScore: number; accessibilityScore: number; bestPracticesScore: number; seoScore: number; pwaScore: number };
  coreWebVitals: Record<string, { value: number; rating: "good" | "needs-improvement" | "poor" }>;
  playerMetrics: { startupDelay: number; bufferRatio: number; abrSwitchCount: number; abrSwitchLatency: number; rebufferEvents: number; playbackFailures: number; drmLicenseTime: number; timeToFirstFrame: number };
  cdnMetrics: { hitRatio: number; avgLatency: number; p95Latency: number; edgeLocations: string[]; cacheHeaders: boolean; compressionEnabled: boolean };
  resourceMetrics: { totalSize: number; jsSize: number; cssSize: number; imageSize: number; fontSize: number; thirdPartySize: number; requestCount: number; uncompressedAssets: string[]; renderBlockingResources: string[] };
}

// -- Code-quality-specific metadata --
export interface CodeQualityMetadata {
  deadCode: { type: string; file: string; line: number; code: string; confidence: number }[];
  memoryLeaks: { type: string; file: string; line: number; description: string; severity: Severity }[];
  asyncIssues: { type: string; file: string; line: number; description: string; severity: Severity }[];
  antiPatterns: { pattern: string; file: string; line: number; description: string; suggestion: string; severity: Severity }[];
  unhandledExceptions: { type: string; file: string; line: number; description: string }[];
  lintResults: { errors: number; warnings: number; fixable: number; rules: { rule: string; count: number; severity: string }[] };
  complexity: { avgCyclomaticComplexity: number; maxCyclomaticComplexity: number; avgCognitiveComplexity: number; maxCognitiveComplexity: number; duplicateBlocks: number; technicalDebt: string };
}

// -- Auth --
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// -- WebSocket Events --
export interface WSScanProgress {
  scanId: string;
  agent: AgentType;
  progress: number;       // 0-100
  status: ScanStatus;
}

export interface WSScanComplete {
  scanId: string;
  score: number;
  status: "pass" | "fail";
}

export interface WSScanError {
  scanId: string;
  error: string;
}

// -- Competition Analysis --
export interface ComparisonSiteData {
  url: string;
  scanId: string;
  scannedAt: string;
  overallScore: number;
  securityScore: number;
  performanceScore: number;
  codeQualityScore: number;
  sslGrade: string;
  headerScore: number;
  missingHeaders: string[];
  corsIssues: string[];
  tokenLeakCount: number;
  dependencyVulnCount: number;
  drmStatus: {
    widevineDetected: boolean;
    fairplayDetected: boolean;
    licenseUrlExposed: boolean;
  };
  owaspSummary: { category: string; risk: Severity; count: number }[];
  lighthouseScores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  coreWebVitals: Record<string, { value: number; rating: string }>;
  criticalFindingsCount: number;
  highFindingsCount: number;
  totalFindingsCount: number;
}

export interface AIComparisonAnalysis {
  competitiveGapScore: number;
  verdict: string;
  leader: string;
  primaryStrengths: string[];
  primaryWeaknesses: string[];
  competitorInsights: { url: string; strengths: string[]; weaknesses: string[] }[];
  improvementRoadmap: {
    timeframe: "30-day" | "60-day" | "90-day";
    actions: string[];
  }[];
  strategicSuggestions: string[];
  successMatrix: {
    metric: string;
    primary: number;
    competitors: { url: string; value: number }[];
    leader: string;
    gap: number;
  }[];
  riskRating: "low" | "medium" | "high" | "critical";
  businessImpactScore: number;
}

export interface ComparisonResult {
  primary: ComparisonSiteData;
  competitors: ComparisonSiteData[];
  aiAnalysis: AIComparisonAnalysis;
  generatedAt: string;
}
