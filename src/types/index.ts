// Shared TypeScript types for Portfolio Monitor

export type Bucket = 1 | 2 | 3 | 4;
export type BucketConfidence = 'high' | 'medium' | 'low';
export type Regime = 'risk_on' | 'risk_off' | 'rotation' | 'dislocation';
export type ThesisStatus = 'confirmed' | 'challenged' | 'neutral';
export type ScanType = 'full' | 'delta' | 'step';
export type Severity = 'high' | 'medium' | 'low';
export type FlagType = 'regime_divergence' | 'sector_divergence' | 'thesis_challenge';

export interface Holding {
  id: number;
  ticker: string;
  companyName: string | null;
  shares: number | null;
  costBasis: number | null;
  sector: string | null;
  industry: string | null;
  sectorEtf: string | null;
  beta: number | null;
  thesis: string | null;
  addedAt: string;
  updatedAt: string;
}

export interface FiveMetricEntry {
  value: string;
  context: string;
  trend: 'up' | 'down' | 'flat';
  forwardOutlook?: string;
}

export interface FiveMetrics {
  revenue: FiveMetricEntry;
  profitability: FiveMetricEntry;
  cashGeneration: FiveMetricEntry;
  valuation: FiveMetricEntry;
  financialHealth: FiveMetricEntry;
}

export interface SentimentHeadline {
  headline: string;
  source: string;
  date: string;
}

export interface AnalystRating {
  firm: string;
  action: string;       // e.g. "Upgrade", "Downgrade", "Reiterate", "Initiate"
  priceTarget: string;  // e.g. "$220" or "$180 → $220"
}

export interface NewsSentiment {
  // New structured fields
  overall_tone: 'bullish' | 'bearish' | 'neutral';
  today_summary: string;
  institutional_today: string;
  social_today: string;
  key_headlines: SentimentHeadline[];
  analyst_ratings: AnalystRating[];
  context_30_60: string;
  // Legacy score fields (kept for sentiment bars)
  score: number; // -1 to 1
  twitterScore: number | null;
  redditScore: number | null;
  mediaScore: number | null;
  analystScore: number | null;
  // Deprecated — kept for backward compat with old scans
  summary?: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  keyHeadlines?: string[];
  socialBuzz?: string;
}

export type CatalystCategory = 'thesis' | 'macro' | 'sector' | 'sentiment' | 'fundamental';

export interface Catalyst {
  date: string;
  type: string;
  description: string;
  impactHypothesis: string;
  horizon: 'near' | 'mid' | 'long';
  category: CatalystCategory;
  thesisRelevance: boolean;
}

export interface DriverAnalysis {
  past: { summary: string; dominantBucket: Bucket; evolution: string };
  today: { primaryBucket: Bucket; secondaryBucket: Bucket | null; rationale: string; confidence: BucketConfidence };
  forward: { summary: string; expectedBucket: Bucket; keyFactors: string[] };
}

export interface ThesisCheck {
  status: ThesisStatus;
  past: { summary: string; evidence: string[] };
  today: { explanation: string };
  forward: { outlook: string; keyEvents: string[] };
}

export interface AnalysisScan {
  id: number;
  ticker: string;
  scanType: ScanType;
  bucketPrimary: Bucket | null;
  bucketSecondary: Bucket | null;
  bucketRationale: string | null;
  bucketConfidence: BucketConfidence | null;
  newsSentiment: NewsSentiment | null;
  thesisStatus: ThesisStatus | null;
  thesisAnalysis: ThesisCheck | null;
  catalysts: Catalyst[] | null;
  fiveMetrics: FiveMetrics | null;
  sectorRelative: SectorRelativeData | null;
  driverAnalysis: DriverAnalysis | null;
  fullAnalysis: Record<string, unknown> | null;
  /** ISO timestamp per pipeline step, tracking when each was last actually run */
  stepTimestamps: Record<string, string> | null;
  /** Per-step failure messages from the last run, keyed by step name. A step
   *  present here produced no output because the call threw. */
  stepErrors: Record<string, string> | null;
  scannedAt: string;
}

export interface SectorRelativeData {
  forwardPE: { stock: number; sectorMedian: number; percentile: number };
  premiumTrend: 'expanding' | 'compressing' | 'stable';
  correlationToSector30d: number;
  correlationToSector90d: number;
  relativePerformance: { period: string; stockReturn: number; sectorReturn: number; spyReturn: number }[];
  forwardOutlook: string;
}

export interface RegimeSnapshot {
  id: number;
  regime: Regime;
  rationale: string;
  spyChange: number | null;
  vix: number | null;
  snappedAt: string;
}

export interface AnomalyFlag {
  id: number;
  ticker: string;
  flagType: FlagType;
  description: string;
  severity: Severity;
  resolved: number;
  flaggedAt: string;
}

export interface PeerRow {
  ticker: string;
  revGrowthYoY: number | null;    // Decimal, e.g. 0.13 = +13% YoY
  opMargin: number | null;         // Decimal, e.g. 0.10 = 10%
  fcfMargin: number | null;        // Decimal, e.g. 0.15 = 15% FCF margin (TTM FCF / TTM Rev)
  peRatio: number | null;
  forwardPeRatio: number | null;   // Forward P/E from analyst estimates (price / NTM EPS avg)
  isSelf: boolean;                 // true = this is the company being viewed
}

export interface RevenueSegment {
  name: string;
  value: number;               // Dollar amount (most recent fiscal year)
  yoyGrowth: number | null;    // Decimal, e.g. 0.17 = +17%
}

export interface PortfolioSummary {
  holdings: Holding[];
  latestScans: Record<string, AnalysisScan>;
  regime: RegimeSnapshot | null;
  anomalies: AnomalyFlag[];
  portfolioBeta: number | null;
}
