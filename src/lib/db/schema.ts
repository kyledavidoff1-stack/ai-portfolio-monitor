import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

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
  thesis: text('thesis'),                    // User-defined investment thesis
  addedAt: text('added_at').notNull(),       // ISO timestamp
  updatedAt: text('updated_at').notNull(),
});

// Cached FMP fundamental data per company
export const fundamentals = sqliteTable('fundamentals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull(),
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
});

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
  fullAnalysis: text('full_analysis'),       // JSON: complete AI output for deep dive
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
