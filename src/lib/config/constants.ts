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

// Bucket labels
export const BUCKET_LABELS: Record<number, string> = {
  1: 'Market Beta',
  2: 'Sector / Factor Rotation',
  3: 'Sentiment / Positioning',
  4: 'Fundamental Change',
};

export const BUCKET_COLORS: Record<number, string> = {
  1: 'bucket1',
  2: 'bucket2',
  3: 'bucket3',
  4: 'bucket4',
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

// Claude model
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
