# Portfolio Monitor — Technical Implementation Plan

## For use with Claude Code

**Date:** March 29, 2026
**Companion document:** portfolio-monitor-product-spec.md (read this first for full product context)
**Status:** Ready for V1 build

---

## 1. Resolved Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Financial data API | Financial Modeling Prep (FMP) | Broadest endpoint coverage: company profiles with sector/industry, financials, earnings calendar, stock peers, sector performance, historical prices. Free tier: 250 requests/day. Paid: $14/month for 300 req/min. |
| Database | SQLite (via better-sqlite3) | Local-first, zero-config, no server. Matches open source philosophy. Migrate to PostgreSQL for hosted version in V2. |
| ORM | Drizzle | Lightweight, excellent SQLite support, SQL-close, fast runtime. Better for open source contributors than Portfolio Monitora's magic. |
| AI engine | Hybrid: Claude Code for prompt dev, Claude API (Sonnet) for production | Iterate prompts conversationally, deploy finalized prompts as API calls. No API cost during experimentation. Production cost: ~$3-10/month for typical usage. |
| Prompt architecture | Pipeline (multiple focused calls per stock) | More token-efficient, easier to cache per-step, easier to debug, allows different refresh frequencies per analysis type. |
| Frontend | Next.js App Router, server components + server actions | Simplest architecture, fewest moving parts. No separate API layer needed for V1. |
| Styling | Tailwind CSS | Utility-first, fast iteration, consistent with open source norms. Clean, calm aesthetic per design principles. |
| Charts | Recharts | React-native, well-documented, covers all chart types needed (line, bar, scatter, heatmap). |

---

## 2. Project Structure

```
portfolio-monitor/
├── src/
│   ├── app/                      # Next.js App Router pages
│   │   ├── layout.tsx            # Root layout (nav, regime indicator)
│   │   ├── page.tsx              # Portfolio dashboard (default landing)
│   │   ├── company/
│   │   │   └── [ticker]/
│   │   │       └── page.tsx      # Company detail page
│   │   ├── settings/
│   │   │   └── page.tsx          # API keys, preferences
│   │   └── api/                  # API routes (for scan triggers)
│   │       ├── scan/
│   │       │   └── route.ts      # Trigger full/delta scan
│   │       └── refresh/
│   │           └── route.ts      # Refresh specific stock
│   ├── components/
│   │   ├── dashboard/            # Portfolio-level components
│   │   │   ├── RegimeIndicator.tsx
│   │   │   ├── AnomalyFlags.tsx
│   │   │   ├── CorrelationHeatmap.tsx
│   │   │   ├── BetaSummary.tsx
│   │   │   ├── BucketDistribution.tsx
│   │   │   ├── CatalystCalendar.tsx
│   │   │   └── HoldingsList.tsx
│   │   ├── company/              # Company detail components
│   │   │   ├── FiveMetrics.tsx       # "5 Numbers That Matter" surface view
│   │   │   ├── FullFinancials.tsx    # Expandable deep dive
│   │   │   ├── SectorRelative.tsx    # Sector-relative valuation + charts
│   │   │   ├── BusinessIntel.tsx
│   │   │   ├── SentimentLayer.tsx
│   │   │   ├── BucketAnalysis.tsx
│   │   │   ├── ThesisTracker.tsx
│   │   │   └── EventCalendar.tsx
│   │   ├── charts/               # Reusable chart components
│   │   │   ├── RelativePerformance.tsx
│   │   │   ├── MetricTrend.tsx
│   │   │   └── ValuationComparison.tsx
│   │   └── ui/                   # Generic UI primitives
│   │       ├── Card.tsx
│   │       ├── Badge.tsx
│   │       ├── ExpandableSection.tsx
│   │       └── LoadingState.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts         # Drizzle schema definitions
│   │   │   ├── index.ts          # DB connection
│   │   │   └── migrations/       # Schema migrations
│   │   ├── fmp/
│   │   │   ├── client.ts         # FMP API client
│   │   │   ├── fundamentals.ts   # Company profile, financials, metrics
│   │   │   ├── prices.ts         # Historical prices, beta
│   │   │   ├── sector.ts         # Sector classification, ETF mapping
│   │   │   └── calendar.ts       # Earnings dates, dividends
│   │   ├── claude/
│   │   │   ├── client.ts         # Claude API client wrapper
│   │   │   ├── prompts/
│   │   │   │   ├── news-sentiment.ts     # Step 1: News + sentiment scan
│   │   │   │   ├── fundamental-analysis.ts # Step 2: Interpret FMP data
│   │   │   │   ├── bucket-assignment.ts   # Step 3: Four-bucket classification
│   │   │   │   ├── thesis-check.ts        # Step 4: Thesis confirmation/challenge
│   │   │   │   ├── catalyst-scan.ts       # Step 5: Forward event calendar
│   │   │   │   └── regime-check.ts        # Portfolio-level regime indicator
│   │   │   └── pipeline.ts       # Orchestrates the multi-step analysis
│   │   ├── analysis/
│   │   │   ├── correlation.ts    # Correlation matrix calculation
│   │   │   ├── beta.ts           # Portfolio beta calculation
│   │   │   ├── anomaly.ts        # Regime divergence detection
│   │   │   └── sector-relative.ts # Sector-relative valuation
│   │   └── config/
│   │       ├── sector-etf-map.ts # GICS sector to ETF ticker mapping
│   │       └── constants.ts      # Thresholds, defaults
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   └── utils/
│       ├── format.ts             # Number/date formatting
│       └── cache.ts              # Cache invalidation logic
├── drizzle.config.ts             # Drizzle configuration
├── next.config.ts                # Next.js configuration
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example            # Template for API keys
└── README.md
```

---

## 3. Database Schema

```typescript
// src/lib/db/schema.ts

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
```

---

## 4. FMP API Integration

### 4.1 Endpoints We Use

| Purpose | FMP Endpoint | Refresh Frequency |
|---|---|---|
| Company profile (sector, industry, beta, description) | /v3/profile/{ticker} | On ticker add, then weekly |
| Income statement | /v3/income-statement/{ticker}?period=quarter | Daily (cached, only changes quarterly) |
| Balance sheet | /v3/balance-sheet-statement/{ticker}?period=quarter | Daily (cached) |
| Cash flow statement | /v3/cash-flow-statement/{ticker}?period=quarter | Daily (cached) |
| Key metrics TTM | /v3/key-metrics-ttm/{ticker} | Daily |
| Ratios TTM | /v3/ratios-ttm/{ticker} | Daily |
| Historical daily prices | /v3/historical-price-full/{ticker} | Daily (append new day) |
| Stock peers | /v4/stock_peers?symbol={ticker} | Weekly |
| Earnings calendar | /v3/earning_calendar | Daily |
| Sector performance | /v3/sector-performance | Each scan |
| Sector historical performance | /v3/historical-sectors-performance | Each scan |

### 4.2 Rate Limit Strategy

FMP free tier: 250 requests/day. A full scan of 10 stocks touches ~8 endpoints per stock = 80 requests, plus ~10 portfolio-level requests = ~90 total per full scan. This leaves room for ~1.5 full scans per day on the free tier, which is tight.

**Recommendation:** Start on free tier during development. For production use, the $14/month Starter plan (300 requests/minute) removes all rate concerns. Document this clearly in the README so users know the free tier works but is limited.

### 4.3 Sector ETF Mapping

```typescript
// src/lib/config/sector-etf-map.ts

export const SECTOR_ETF_MAP: Record<string, { broad: string; name: string }> = {
  'Technology':              { broad: 'XLK', name: 'Technology Select Sector' },
  'Healthcare':              { broad: 'XLV', name: 'Health Care Select Sector' },
  'Financial Services':      { broad: 'XLF', name: 'Financial Select Sector' },
  'Consumer Cyclical':       { broad: 'XLY', name: 'Consumer Discretionary Select Sector' },
  'Consumer Defensive':      { broad: 'XLP', name: 'Consumer Staples Select Sector' },
  'Energy':                  { broad: 'XLE', name: 'Energy Select Sector' },
  'Industrials':             { broad: 'XLI', name: 'Industrial Select Sector' },
  'Basic Materials':         { broad: 'XLB', name: 'Materials Select Sector' },
  'Real Estate':             { broad: 'XLRE', name: 'Real Estate Select Sector' },
  'Utilities':               { broad: 'XLU', name: 'Utilities Select Sector' },
  'Communication Services':  { broad: 'XLC', name: 'Communication Services Select Sector' },
};

// Optional sub-sector ETFs for more precise comparison
export const INDUSTRY_ETF_MAP: Record<string, string> = {
  'Semiconductors':          'SOXX',
  'Biotechnology':           'XBI',
  'Software - Infrastructure': 'IGV',
  'Banks - Regional':        'KRE',
  'Oil & Gas E&P':           'XOP',
  'Homebuilders':            'XHB',
  'Retail':                  'XRT',
  // Expand as needed
};
```

---

## 5. Claude API Prompt Pipeline

### 5.1 Pipeline Architecture

Each stock runs through a multi-step analysis pipeline. Each step is a focused Claude API call. Steps can be cached and refreshed independently.

```
Step 1: News & Sentiment Scan (web search enabled)
   ↓ outputs: news_summary, sentiment_scores, social_buzz
Step 2: Fundamental Interpretation (uses FMP data as input, no web search)
   ↓ outputs: five_metrics, growth_assessment, margin_analysis
Step 3: Sector-Relative Context (uses FMP data + sector ETF data)
   ↓ outputs: valuation_vs_sector, premium_trend, correlation_note
Step 4: Bucket Assignment (uses outputs from steps 1-3)
   ↓ outputs: primary_bucket, secondary_bucket, rationale, confidence
   Note: Bucket 3 (Sentiment/Positioning/Virality) covers both narrative-driven moves
   AND mechanical/positioning moves (index rebalances, short squeezes, gamma effects).
   The rationale text must always specify which sub-type is driving the move.
Step 5: Thesis Check (uses step 1-3 outputs + user thesis)
   ↓ outputs: thesis_status, thesis_analysis
Step 6: Catalyst Scan (web search enabled)
   ↓ outputs: events_near_term, events_mid_term, events_long_term

Portfolio-level (runs once per scan, not per stock):
Step 7: Regime Check (uses SPY data, VIX, sector performance)
   ↓ outputs: regime, rationale
Step 8: Anomaly Detection (uses per-stock returns vs. regime + sector)
   ↓ outputs: anomaly_flags[]
```

### 5.2 Caching Rules

| Step | Cache Duration | Invalidation Trigger |
|---|---|---|
| News & Sentiment | 2-4 hours | Manual refresh, price spike (>2%) |
| Fundamental Interpretation | 24 hours | New quarterly filing detected |
| Sector-Relative Context | 24 hours | Same as fundamentals |
| Bucket Assignment | Recalculated each scan | Always fresh (uses cached step inputs) |
| Thesis Check | 24 hours | News & Sentiment cache invalidated |
| Catalyst Scan | 12 hours | Manual refresh |
| Regime Check | 2-4 hours | Market hours only |
| Anomaly Detection | Recalculated each scan | Always fresh |

### 5.3 Prompt Design Principles

Every prompt sent to Claude Sonnet follows these rules:

1. **Structured output.** Every prompt ends with explicit JSON schema instructions. Claude returns parseable JSON, not prose. The dashboard never shows raw AI text on the surface view (prose is in the expandable deep dive only).

2. **Context injection.** FMP data is injected directly into the prompt as structured data, not described narratively. Example: "Here is the financial data for NVDA: {revenue_ttm: 130.5B, revenue_growth_yoy: 0.94, operating_margin: 0.62, ...}. Analyze this data and return..."

3. **Role specificity.** Each prompt has a focused role. The news scanner doesn't analyze fundamentals. The bucket assigner doesn't search the web. Separation of concerns.

4. **Plain language output.** Per the design principles, AI-generated text should read like a smart friend explaining over coffee. No jargon unless the user is in the deep dive. Prompts explicitly instruct: "Write for someone who is interested in investing but may not work in finance."

### 5.4 Estimated API Cost Per Scan

Per stock (6 steps):
- Steps with web search (1, 6): ~$0.015 each = $0.03
- Steps without web search (2, 3, 4, 5): ~$0.005 each = $0.02
- Total per stock: ~$0.05

Portfolio-level (steps 7, 8): ~$0.02

Full scan of 10 stocks: ~$0.52
Delta check (only steps 1, 4, 7, 8): ~$0.20

Daily usage (1 full scan + 3 delta checks): ~$1.12
Monthly: ~$34

With aggressive caching (skip unchanged fundamentals, skip sentiment if no new headlines): realistically $10-20/month.

---

## 6. Key Calculations (Non-AI)

These are computed locally, no API calls needed.

### 6.1 Portfolio Beta

```typescript
// Weighted average beta
function portfolioBeta(holdings: { beta: number; marketValue: number }[]): number {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  return holdings.reduce((sum, h) => sum + (h.beta * h.marketValue / totalValue), 0);
}
```

### 6.2 Correlation Matrix

```typescript
// Pearson correlation between two return series
function correlation(returnsA: number[], returnsB: number[]): number {
  const n = returnsA.length;
  const meanA = returnsA.reduce((s, v) => s + v, 0) / n;
  const meanB = returnsB.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dA = returnsA[i] - meanA;
    const dB = returnsB[i] - meanB;
    cov += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }
  return cov / Math.sqrt(varA * varB);
}

// Daily returns from price history
function dailyReturns(prices: number[]): number[] {
  return prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
}
```

### 6.3 Anomaly Detection

```typescript
// Flag if stock's daily return diverges from expected (beta-adjusted market return)
function detectAnomaly(
  stockReturn: number,
  marketReturn: number,
  stockBeta: number,
  threshold: number = 0.02  // 2% divergence
): { isAnomaly: boolean; divergence: number } {
  const expectedReturn = stockBeta * marketReturn;
  const divergence = stockReturn - expectedReturn;
  return {
    isAnomaly: Math.abs(divergence) > threshold,
    divergence,
  };
}
```

---

## 7. Build Sequence (Sprint Plan)

Each sprint is a discrete, reviewable unit. Feed one sprint at a time to Claude Code. Review output before proceeding to the next.

### Sprint 0: Project Scaffolding
**Goal:** Empty project that runs.
- Initialize Next.js 14+ with App Router, TypeScript, Tailwind
- Set up Drizzle with SQLite
- Create database schema and run initial migration
- Create .env.local.example with FMP_API_KEY and CLAUDE_API_KEY placeholders
- Create basic layout with navigation shell
- README with setup instructions
**Acceptance:** `npm run dev` shows a blank dashboard page with nav. Database file created.

### Sprint 1: Holdings Management + FMP Integration
**Goal:** User can add tickers and see basic company data.
- Build ticker input form (text field, add button)
- Build CSV upload parser (extract tickers and optional share counts)
- Integrate FMP company profile endpoint (auto-populate sector, industry, beta, company name)
- Build holdings list component on dashboard
- Build settings page for API key input (stored in .env.local, not in DB)
- Sector ETF mapping lookup
**Acceptance:** User adds NVDA, sees company name, sector (Technology), industry (Semiconductors), beta, and mapped sector ETF (XLK/SOXX).

### Sprint 2: Fundamental Data Layer
**Goal:** Full financial data pulled and cached for each holding.
- Integrate FMP financial statement endpoints (income, balance sheet, cash flow)
- Integrate FMP key metrics and ratios endpoints
- Build cache layer (store in SQLite, check freshness before re-fetching)
- Build the "5 Numbers That Matter" display component (surface view)
- Build expandable full financials component (deep dive)
- Build per-company metric trend charts (revenue, margins, FCF, EPS over time)
**Acceptance:** Click into NVDA, see 5-metric summary in plain language plus expandable full financials with trend charts.

### Sprint 3: Sector-Relative Analysis
**Goal:** Each stock shows valuation and performance relative to its sector.
- Pull sector ETF price history from FMP
- Calculate sector-relative valuation (stock multiples vs. sector median)
- Calculate sector-relative price correlation (rolling 30/90 day)
- Build relative performance chart component (stock vs. sector ETF vs. SPY, normalized)
- Build sector-relative valuation display (percentile rank, premium/discount trend)
**Acceptance:** NVDA company page shows forward P/E vs. semiconductor sector median, correlation to SOXX, and normalized performance overlay chart.

### Sprint 4: Claude AI Analysis Pipeline
**Goal:** Core intelligence layer operational.
- Build Claude API client wrapper (handles auth, retries, rate limits)
- Implement prompt templates for all 6 per-stock steps
- Implement pipeline orchestrator (runs steps in sequence, passes outputs forward)
- Implement structured JSON parsing for all step outputs
- Store analysis results in analysis_scans table
- Build scan trigger API route (full scan and delta scan)
- Build "Refresh" button on dashboard that triggers scan
**Acceptance:** Hit refresh, wait 2-3 minutes, each stock shows bucket assignment with rationale, news summary, sentiment assessment, and catalyst list.

### Sprint 5: Thesis Tracking
**Goal:** Users can set a thesis and see AI confirmation/challenge.
- Add thesis text field to holdings (editable per stock)
- Implement thesis check prompt (Step 5 in pipeline)
- Build thesis tracker component (shows thesis text, status badge: confirmed/challenged/neutral, AI explanation)
- Thesis status appears on both company detail page and as a badge on the portfolio holdings list
**Acceptance:** User writes "Long AMZN: AWS margin expansion + advertising growth" as thesis. After scan, sees "Thesis under pressure: three analyst reports this week flag AWS margin compression from AI CapEx."

### Sprint 6: Portfolio Dashboard
**Goal:** Full portfolio-level intelligence view.
- Implement regime check prompt (Step 7)
- Build regime indicator component (top of dashboard)
- Implement anomaly detection (Step 8 + local calculation)
- Build anomaly flags component (prominent, top of dashboard below regime)
- Build correlation heatmap (local calculation + Recharts)
- Build portfolio beta display (per-stock beta + weighted portfolio beta)
- Build bucket distribution summary
- Build cross-portfolio catalyst calendar (aggregate events from all holdings)
**Acceptance:** Dashboard shows regime (e.g., "Risk-on"), anomaly flags (e.g., "NVDA decoupled from sector"), correlation heatmap, portfolio beta of 1.35, bucket distribution, and merged catalyst calendar for next 30 days.

### Sprint 7: Caching, History, and Polish
**Goal:** Production-quality refresh behavior and historical tracking.
- Implement cache invalidation logic per pipeline step
- Implement delta scan (only re-run steps whose cache has expired)
- Implement historical scan storage (all past scans queryable by date)
- Build historical timeline on company detail page ("What was driving this stock 2 weeks ago?")
- Loading states and error handling across all components
- Mobile-aware responsive checks (don't break, but don't optimize)
- Polish UI: consistent spacing, typography, color coding for buckets, clean expand/collapse animations
**Acceptance:** Second scan of the day completes in under 60 seconds (delta). User can browse historical scans. Everything looks clean and professional.

### Sprint 8: Documentation and Open Source Prep
**Goal:** Ready for other users.
- Comprehensive README: what it is, setup instructions (Node.js, API keys, first scan), screenshots
- .env.local.example with clear comments
- Architecture overview in docs/ folder
- Contribution guide (how to add features, how prompts work, how to add sector ETF mappings)
- License file (MIT or Apache 2.0, TBD)
- Clean up any hardcoded values, ensure all thresholds are configurable in constants.ts
**Acceptance:** A new developer can clone the repo, follow the README, and have a working dashboard within 15 minutes.

---

## 8. Environment Variables

```bash
# .env.local.example

# Financial Modeling Prep API key (get one at https://financialmodelingprep.com/developer)
FMP_API_KEY=your_fmp_api_key_here

# Anthropic Claude API key (get one at https://console.anthropic.com)
CLAUDE_API_KEY=your_claude_api_key_here

# Claude model (default: claude-sonnet-4-20250514)
CLAUDE_MODEL=claude-sonnet-4-20250514

# Analysis settings
SCAN_ANOMALY_THRESHOLD=0.02        # 2% divergence from expected return triggers flag
SCAN_PRICE_SPIKE_THRESHOLD=0.02    # 2% intraday move triggers delta re-scan
CACHE_NEWS_HOURS=4                 # Hours before news/sentiment cache expires
CACHE_FUNDAMENTALS_HOURS=24        # Hours before fundamental data cache expires
CACHE_CATALYSTS_HOURS=12           # Hours before catalyst scan cache expires
```

---

## 9. Development Workflow

1. **Prompt development:** Use Claude Code (or Claude chat) to prototype and refine each prompt template. Test with real tickers. Iterate until the structured JSON output is reliable and the plain-language summaries read well.

2. **Sprint execution:** Feed one sprint description to Claude Code at a time. Include the project structure, relevant schema sections, and any prior sprint output as context.

3. **Review cycle:** After each sprint, review the output. Run the app. Check that acceptance criteria are met. Note any issues or adjustments before proceeding.

4. **Testing:** For V1, manual testing is sufficient. Automated tests can be added in V2. The priority is getting the product working and usable, not test coverage.

---

## 10. Risk Register

| Risk | Mitigation |
|---|---|
| FMP free tier rate limits too restrictive for development | Upgrade to $14/month Starter during active development. Document in README. |
| Claude API returns inconsistent JSON structure | Strict JSON schema instructions in every prompt. Validation layer that retries on parse failure (max 2 retries). |
| Sector ETF mapping misses edge cases | Manual override field in holdings table. User can reassign sector ETF for any stock. |
| SQLite concurrent write issues during background scan | Scans run sequentially, not in parallel. WAL mode enabled for better read concurrency. |
| Prompt quality degrades for less-covered stocks | Test pipeline against small-cap and international ADRs during Sprint 4. Adjust prompts if needed. |
| Historical price data gaps for newer stocks | Graceful fallback: skip correlation/beta for stocks with <90 days of price history. Display "Insufficient data" badge. |

---

## 11. Post-V1 Technical Considerations

These are explicitly out of scope for V1 but worth noting for architectural awareness:

- **Plaid integration (V2):** Will require a server-side auth flow. The SQLite schema should be extensible to store Plaid access tokens and linked account metadata. Do not design V1 schema in a way that precludes this.
- **PostgreSQL migration (V2):** Drizzle supports both SQLite and PostgreSQL. Schema should use Drizzle's abstraction layer so migration is a config change, not a rewrite.
- **Comparative charting (V2):** The price_history and fundamentals tables already store the data needed. V2 adds the UI for selecting stocks and metrics to compare.
- **Chat interface (V3):** Will require a conversation history table and streaming Claude API responses. The pipeline architecture means the chat agent can invoke individual analysis steps on demand.
- **Background scheduled scans (V2/V3):** Will require a job queue (e.g., node-cron or BullMQ). The scan trigger API route built in Sprint 4 serves as the foundation.

---

*Feed this document to Claude Code one sprint at a time. Always provide the product spec as companion context. Review after each sprint before proceeding.*
