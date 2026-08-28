import type {
  AnalysisScan,
  NewsSentiment,
  Catalyst,
  FiveMetrics,
  SectorRelativeData,
  DriverAnalysis,
  Bucket,
  BucketConfidence,
  ThesisCheck,
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
  stepTimestamps?: string | null;
  stepErrors?: string | null;
  scannedAt: string;
}

function tryParse<T>(json: string | null): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

/** Parse the stored thesis check. Very old scans stored plain prose instead of
 *  JSON — wrap those in a minimal ThesisCheck so consumers get one shape. */
function parseThesisAnalysis(raw: string | null, status: string | null): ThesisCheck | null {
  if (!raw) return null;
  const parsed = tryParse<ThesisCheck>(raw);
  if (parsed && typeof parsed === 'object' && parsed.today?.explanation !== undefined) return parsed;
  return {
    status: (status as ThesisCheck['status']) ?? 'neutral',
    past: { summary: '', evidence: [] },
    today: { explanation: typeof parsed === 'string' ? parsed : raw },
    forward: { outlook: '', keyEvents: [] },
  };
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
    thesisAnalysis: parseThesisAnalysis(row.thesisAnalysis, row.thesisStatus),
    catalysts: tryParse<Catalyst[]>(row.catalysts),
    fiveMetrics: tryParse<FiveMetrics>(row.fiveMetrics),
    sectorRelative: tryParse<SectorRelativeData>(row.sectorRelative),
    driverAnalysis: tryParse<DriverAnalysis>(row.driverAnalysis),
    fullAnalysis: tryParse<Record<string, unknown>>(row.fullAnalysis),
    stepTimestamps: tryParse<Record<string, string>>(row.stepTimestamps ?? null),
    stepErrors: tryParse<Record<string, string>>(row.stepErrors ?? null),
    scannedAt: row.scannedAt,
  };
}
