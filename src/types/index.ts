// Shared TypeScript types for Portfolio Monitor

export type Bucket = 1 | 2 | 3 | 4;
export type BucketConfidence = 'high' | 'medium' | 'low';
export type Regime = 'risk_on' | 'risk_off' | 'rotation' | 'dislocation';
export type ThesisStatus = 'confirmed' | 'challenged' | 'neutral';
export type ScanType = 'full' | 'delta';
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
  thesis: string | null;
  addedAt: string;
  updatedAt: string;
}

export interface FiveMetrics {
  revenue: { value: string; context: string; trend: 'up' | 'down' | 'flat' };
  profitability: { value: string; context: string; trend: 'up' | 'down' | 'flat' };
  cashGeneration: { value: string; context: string; trend: 'up' | 'down' | 'flat' };
  valuation: { value: string; context: string; trend: 'up' | 'down' | 'flat' };
  financialHealth: { value: string; context: string; trend: 'up' | 'down' | 'flat' };
}

export interface NewsSentiment {
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number; // -1 to 1
  keyHeadlines: string[];
  socialBuzz: string;
}

export interface Catalyst {
  date: string;
  type: string;
  description: string;
  impactHypothesis: string;
  horizon: 'near' | 'mid' | 'long';
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
  thesisAnalysis: string | null;
  catalysts: Catalyst[] | null;
  fiveMetrics: FiveMetrics | null;
  sectorRelative: SectorRelativeData | null;
  fullAnalysis: Record<string, unknown> | null;
  scannedAt: string;
}

export interface SectorRelativeData {
  forwardPE: { stock: number; sectorMedian: number; percentile: number };
  premiumTrend: 'expanding' | 'compressing' | 'stable';
  correlationToSector30d: number;
  correlationToSector90d: number;
  relativePerformance: { period: string; stockReturn: number; sectorReturn: number; spyReturn: number }[];
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

export interface PortfolioSummary {
  holdings: Holding[];
  latestScans: Record<string, AnalysisScan>;
  regime: RegimeSnapshot | null;
  anomalies: AnomalyFlag[];
  portfolioBeta: number | null;
}
