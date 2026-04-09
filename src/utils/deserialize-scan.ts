import type {
  AnalysisScan,
  NewsSentiment,
  Catalyst,
  FiveMetrics,
  SectorRelativeData,
  DriverAnalysis,
  Bucket,
  BucketConfidence,
  ThesisStatus,
  ScanType,
} from '@/types';

/** Raw row shape from Drizzle (JSON fields are strings) */
interface RawScanRow {
  id: number;
  ticker: string;
  scanType: string;
  bucketPrimary: number | null;
  bucketSecondary: number | null;
  bucketRationale: string | null;
  bucketConfidence: string | null;
  newsSentiment: string | null;
  thesisStatus: string | null;
  thesisAnalysis: string | null;
  catalysts: string | null;
  fiveMetrics: string | null;
  sectorRelative: string | null;
  driverAnalysis: string | null;
  fullAnalysis: string | null;
  scannedAt: string;
}

function tryParse<T>(json: string | null): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

export function deserializeScan(row: RawScanRow): AnalysisScan {
  return {
    id: row.id,
    ticker: row.ticker,
    scanType: row.scanType as ScanType,
    bucketPrimary: row.bucketPrimary as Bucket | null,
    bucketSecondary: row.bucketSecondary as Bucket | null,
    bucketRationale: row.bucketRationale,
    bucketConfidence: row.bucketConfidence as BucketConfidence | null,
    newsSentiment: tryParse<NewsSentiment>(row.newsSentiment),
    thesisStatus: row.thesisStatus as ThesisStatus | null,
    thesisAnalysis: row.thesisAnalysis,
    catalysts: tryParse<Catalyst[]>(row.catalysts),
    fiveMetrics: tryParse<FiveMetrics>(row.fiveMetrics),
    sectorRelative: tryParse<SectorRelativeData>(row.sectorRelative),
    driverAnalysis: tryParse<DriverAnalysis>(row.driverAnalysis),
    fullAnalysis: tryParse<Record<string, unknown>>(row.fullAnalysis),
    scannedAt: row.scannedAt,
  };
}
