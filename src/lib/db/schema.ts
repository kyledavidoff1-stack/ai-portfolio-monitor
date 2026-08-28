import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

// User's holdings
export const holdings = sqliteTable('holdings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull(),
  companyName: text('company_name'),
  shares: real('shares'),                    // Optional in V1 (needed for weighted beta)
  costBasis: real('cost_basis'),             // Optional, for P&L tracking
  sector: text('sector'),                    // From FMP, auto-populated
  industry: text('industry'),               // From FMP, auto-populated
  sectorEtf: text('sector_etf'),            // Mapped from sector
  beta: real('beta'),                        // From FMP profile, auto-populated
  thesis: text('thesis'),                    // User-defined investment thesis
  addedAt: text('added_at').notNull(),       // ISO timestamp
  updatedAt: text('updated_at').notNull(),
});

// Cached FMP fundamental data per company
export const fundamentals = sqliteTable('fundamentals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull().unique(),  // Unique so upserts work
  data: text('data').notNull(),              // JSON blob: revenue, margins, FCF, EPS, etc.
  fetchedAt: text('fetched_at').notNull(),   // For cache invalidation
});

// Historical price data for correlation and beta
export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull(),
  date: text('date').notNull(),
  close: real('close').notNull(),
  volume: integer('volume'),
}, (table) => ({
  tickerDateIdx: uniqueIndex('price_history_ticker_date_idx').on(table.ticker, table.date),
}));

// AI analysis results (the core intelligence)
export const analysisScans = sqliteTable('analysis_scans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull(),
  scanType: text('scan_type').notNull(),     // 'full' or 'delta'
  bucketPrimary: integer('bucket_primary'),  // 1-4
  bucketSecondary: integer('bucket_secondary'),
  bucketRationale: text('bucket_rationale'),
  bucketConfidence: text('bucket_confidence'), // 'high', 'medium', 'low'
  newsSentiment: text('news_sentiment'),      // JSON: news summary, sentiment scores
  thesisStatus: text('thesis_status'),        // 'confirmed', 'challenged', 'neutral'
  thesisAnalysis: text('thesis_analysis'),    // AI explanation
  catalysts: text('catalysts'),              // JSON: array of upcoming events with impact
  fiveMetrics: text('five_metrics'),         // JSON: the "5 Numbers That Matter" AI summary
  sectorRelative: text('sector_relative'),   // JSON: valuation vs sector, premium/discount
  driverAnalysis: text('driver_analysis'),   // JSON: past/today/forward driver assessment
  fullAnalysis: text('full_analysis'),       // JSON: complete AI output for deep dive
  stepTimestamps: text('step_timestamps'),   // JSON: per-step freshness, e.g. {"news":"2026-08-08T11:00:00Z"}
  stepErrors: text('step_errors'),           // JSON: per-step failure message, e.g. {"catalysts":"FMP_RATE_LIMIT: ..."}
  scannedAt: text('scanned_at').notNull(),
});

// Portfolio-level regime snapshots
export const regimeSnapshots = sqliteTable('regime_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  regime: text('regime').notNull(),          // 'risk_on', 'risk_off', 'rotation', 'dislocation'
  rationale: text('rationale').notNull(),
  spyChange: real('spy_change'),             // SPY daily % change
  vix: real('vix'),
  snappedAt: text('snapped_at').notNull(),
});

// Anomaly flags
export const anomalyFlags = sqliteTable('anomaly_flags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull(),
  flagType: text('flag_type').notNull(),     // 'regime_divergence', 'sector_divergence', 'thesis_challenge'
  description: text('description').notNull(),
  severity: text('severity').notNull(),      // 'high', 'medium', 'low'
  resolved: integer('resolved').default(0),  // 0 or 1
  flaggedAt: text('flagged_at').notNull(),
});

// Local app settings (API keys, model choice). Key/value so new settings do not
// need a migration. Values live in this user's own SQLite file — the same trust
// boundary as .env.local — and are never sent anywhere except the provider the
// setting names.
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
