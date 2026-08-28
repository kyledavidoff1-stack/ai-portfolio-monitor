// Analysis thresholds (can be overridden via .env.local)
export const ANOMALY_THRESHOLD =
  parseFloat(process.env.SCAN_ANOMALY_THRESHOLD ?? '0.02');

export const PRICE_SPIKE_THRESHOLD =
  parseFloat(process.env.SCAN_PRICE_SPIKE_THRESHOLD ?? '0.02');

// Cache durations in hours
export const CACHE_NEWS_HOURS =
  parseInt(process.env.CACHE_NEWS_HOURS ?? '4', 10);

export const CACHE_FUNDAMENTALS_HOURS =
  parseInt(process.env.CACHE_FUNDAMENTALS_HOURS ?? '24', 10);

export const CACHE_CATALYSTS_HOURS =
  parseInt(process.env.CACHE_CATALYSTS_HOURS ?? '12', 10);

// Per-pipeline-step cache TTLs (hours). A delta scan only re-runs steps whose
// TTL has expired. Bucket assignment (0) is always recalculated — it depends
// on today's price action. Sector-relative and thesis share the fundamentals
// TTL; the regime check shares the news TTL (both are market-hours signals).
export const STEP_TTL_HOURS: Record<string, number> = {
  news: CACHE_NEWS_HOURS,
  fundamentals: CACHE_FUNDAMENTALS_HOURS,
  sector: CACHE_FUNDAMENTALS_HOURS,
  bucket: 0,
  thesis: CACHE_FUNDAMENTALS_HOURS,
  catalysts: CACHE_CATALYSTS_HOURS,
};

export const REGIME_TTL_HOURS = CACHE_NEWS_HOURS;

// Bucket labels
export const BUCKET_LABELS: Record<number, string> = {
  1: 'Market Beta',
  2: 'Sector / Factor Rotation',
  3: 'Sentiment / Positioning',
  4: 'Fundamental Change',
};

export const BUCKET_COLORS: Record<number, string> = {
  1: 'bg-indigo-400',
  2: 'bg-blue-500',
  3: 'bg-amber-500',
  4: 'bg-emerald-500',
};

// Regime labels
export const REGIME_LABELS: Record<string, string> = {
  risk_on: 'Risk-On',
  risk_off: 'Risk-Off',
  rotation: 'Sector Rotation',
  dislocation: 'Dislocation',
};

// Minimum price history days required for correlation/beta
export const MIN_PRICE_HISTORY_DAYS = 90;

// Model choice now lives in lib/config/settings.ts so it can be changed from the
// Settings page at runtime. Import getAiModel() from there rather than reading
// an env var directly.
