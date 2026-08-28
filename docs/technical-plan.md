# Portfolio Monitor — Technical Implementation Plan v2

## For use with Claude Code

**Date:** March 31, 2026
**Companion document:** product-spec.md (read this first for full product context)
**Status:** Sprints 0-2 complete. Significant layout work done beyond original plan. Revised sprint plan below.

---

## 1. Resolved Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Financial data API | Financial Modeling Prep (FMP) | Broadest endpoint coverage: company profiles with sector/industry, financials, earnings calendar, stock peers, sector performance, historical prices. Paid plan: $29/month for high request limits. |
| Database | SQLite (via better-sqlite3) | Local-first, zero-config, no server. Matches open source philosophy. Migrate to PostgreSQL for hosted version in V2. |
| ORM | Drizzle | Lightweight, excellent SQLite support, SQL-close, fast runtime. Better for open source contributors than Prisma's magic. |
| AI engine | Hybrid: Claude Code for prompt dev, Claude API (Sonnet) for production | Iterate prompts conversationally, deploy finalized prompts as API calls. No API cost during experimentation. Production cost: ~$3-10/month for typical usage. |
| Prompt architecture | Pipeline (multiple focused calls per stock) | More token-efficient, easier to cache per-step, easier to debug, allows different refresh frequencies per analysis type. |
| Frontend | Next.js App Router, server components + server actions | Simplest architecture, fewest moving parts. No separate API layer needed for V1. |
| Styling | Tailwind CSS | Dark theme. Utility-first, fast iteration. All text must have high contrast against dark backgrounds. |
| Charts | Recharts + D3.js | Recharts for standard charts (sparklines, line, bar). D3.js with d3-sankey plugin for the Revenue Flow Sankey diagram. |
| Layout system | react-grid-layout | All panels on both pages are draggable and resizable. Users can rearrange and resize from any edge or corner. Layout preferences persist in localStorage. |

---

## 2. Current Architecture

### Key Dependencies (added beyond original plan)
- **react-grid-layout**: Dashboard panel system for both portfolio and company pages
- **d3** + **d3-sankey**: Revenue Flow Sankey diagram
- **recharts**: Sparklines, trend charts, relative performance charts

### Page Structure

**Portfolio Dashboard (/ route):**
Top to bottom default layout:
1. Top bar: Regime indicator, SPY today (price + daily change), Portfolio Beta, Positions count, Portfolio Value, Flagged count, Last Scan time, Run Full Scan button
2. Portfolio Drivers panel (left ~45%) + Thesis Tracker panel (right ~55%) — side by side
3. Upcoming Catalysts panel (full width) — horizontal timeline + bucket-categorized events
4. Holdings table (left ~55%) + Correlation Heatmap (right ~45%) — side by side

Holdings table features:
- Columns: Ticker, Company/Price, Change, Mkt Val, Beta, Drivers (4 bucket dots), Thesis status, Next Event
- Column visibility toggle (gear icon) with localStorage persistence
- Drag-and-drop column reordering with localStorage persistence
- Inline edit for shares, cost basis via pencil icon
- Per-stock anomaly flag indicator
- Optional columns available via toggle: Sector, Industry, Sector ETF, Cost Basis, P&L %

All panels are draggable/resizable via react-grid-layout.

**Company Detail Page (/company/[ticker] route):**
Top to bottom default layout:
1. Header: Ticker + Company Name + Driver summary banner + Refresh button (all one line)
2. Metrics strip: Daily Gain, Current Price, Cost Basis, Market Value, Beta
3. Left column (~40%): Sentiment panel, Driver Analysis panel
4. Right column (~60%): Thesis panel, Sector Relative panel
5. Upcoming Catalysts panel (full width) — horizontal timeline with Thesis/Macro/Sector/Sentiment/Fundamental categories
6. Metrics That Matter panel (left ~40%) + Revenue Flow Sankey panel (right ~60%)
7. Fundamentals panel (full width)

Key panel structures:

**Driver Analysis panel** — three time horizons:
- Past 30-60 days: what drove the stock recently, bucket evolution timeline
- Today: current session bucket assignment with 4 indicator dots + AI rationale
- Next 30-60 days: expected dominant driver based on catalysts and macro

**Thesis panel** — three time horizons:
- Past 30-60 days: validation/challenge history with evidence timeline
- Today: current thesis status (green/yellow/red) + AI explanation
- Next 30-60 days: upcoming events that could validate or challenge thesis
- Editable thesis text field at top

**Sentiment panel:**
- Overall tone indicator (bullish/bearish/neutral)
- Per-source breakdown: Twitter/X, Reddit, Media, Analysts
- Placeholder bars for each source until AI layer populates

**Sector Relative panel** — three time horizons:
- Past 30-60 days: relative performance chart (stock vs. sector ETF vs. SPY normalized)
- Today: peer comparison table (Ticker, Rev Growth, Op Margin, FCF Margin, P/E) with stock highlighted and sector benchmark row
- Next 30-60 days: forward relative outlook

**Upcoming Catalysts panel:**
- Horizontal timeline spanning 60 days with color-coded dots
- Events categorized: Thesis, Macro, Sector, Sentiment, Fundamental
- Each catalyst shows event name, date/days until, bucket tag, thesis relevance flag

**Metrics That Matter panel:**
- Five structured cards: Revenue & Growth, Profitability, Cash Generation, Valuation, Financial Health
- Each card: current number, key ratio, sparkline (8 quarters), forward outlook text
- Data populated from FMP quarterly financials

**Revenue Flow Sankey panel:**
- D3 Sankey diagram showing revenue segments → total revenue → gross profit / cost of sales → operating costs → operating profit → tax → net income
- Each node shows dollar amount and YoY growth
- Revenue segments populated from FMP segmentation endpoint where available; single-node fallback otherwise

**Fundamentals panel:**
- Quarterly table: Revenue, Gross Profit, Operating Income, Net Income, Free Cash Flow
- 8 quarters of data with QoQ percentage change next to each number (green/red)
- Expandable sections for full income statement, balance sheet, cash flow

All panels are draggable/resizable via react-grid-layout.

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
  shares: real('shares'),
  costBasis: real('cost_basis'),
  sector: text('sector'),
  industry: text('industry'),
  sectorEtf: text('sector_etf'),
  thesis: text('thesis'),
  addedAt: text('added_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Cached FMP fundamental data per company
export const fundamentals = sqliteTable('fundamentals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull().unique(),
  data: text('data').notNull(),              // JSON blob: financials, metrics, peers
  fetchedAt: text('fetched_at').notNull(),
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
  bucketConfidence: text('bucket_confidence'),
  newsSentiment: text('news_sentiment'),      // JSON
  thesisStatus: text('thesis_status'),        // 'confirmed', 'challenged', 'neutral'
  thesisAnalysis: text('thesis_analysis'),
  catalysts: text('catalysts'),              // JSON: array of events with bucket tags + thesis relevance
  fiveMetrics: text('five_metrics'),         // JSON: AI-generated forward outlook per metric
  sectorRelative: text('sector_relative'),   // JSON
  driverAnalysis: text('driver_analysis'),   // JSON: past/today/forward driver assessment
  fullAnalysis: text('full_analysis'),       // JSON: complete AI output
  scannedAt: text('scanned_at').notNull(),
});

// Portfolio-level regime snapshots
export const regimeSnapshots = sqliteTable('regime_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  regime: text('regime').notNull(),
  rationale: text('rationale').notNull(),
  spyChange: real('spy_change'),
  vix: real('vix'),
  snappedAt: text('snapped_at').notNull(),
});

// Anomaly flags
export const anomalyFlags = sqliteTable('anomaly_flags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticker: text('ticker').notNull(),
  flagType: text('flag_type').notNull(),
  description: text('description').notNull(),
  severity: text('severity').notNull(),
  resolved: integer('resolved').default(0),
  flaggedAt: text('flagged_at').notNull(),
});
```

---

## 4. FMP API Integration

### 4.1 Endpoints in Use

| Purpose | FMP Endpoint | Refresh Frequency |
|---|---|---|
| Company profile (sector, industry, beta) | /v3/profile/{ticker} | On ticker add, then weekly |
| Income statement | /v3/income-statement/{ticker}?period=quarter&limit=9 | Daily (cached 24h) |
| Balance sheet | /v3/balance-sheet-statement/{ticker}?period=quarter&limit=8 | Daily (cached 24h) |
| Cash flow statement | /v3/cash-flow-statement/{ticker}?period=quarter&limit=9 | Daily (cached 24h) |
| Key metrics | /v3/key-metrics/{ticker}?period=quarter&limit=8 | Daily (cached 24h) |
| Ratios TTM | /v3/ratios-ttm/{ticker} | Daily |
| Historical daily prices | /v3/historical-price-full/{ticker} | Daily (append) |
| Stock peers | /v4/stock_peers?symbol={ticker} | Weekly |
| Revenue segmentation | /v4/revenue-product-segmentation?symbol={ticker} | Weekly |
| Earnings calendar | /v3/earning_calendar | Daily |
| Sector performance | /v3/sector-performance | Each scan |
| Quote (current price) | /v3/quote/{ticker} | Each page load |

### 4.2 Rate Limit Handling
FMP paid plan ($29/month) provides high request limits. The app includes:
- Detection of FMP's JSON-body rate limit responses (HTTP 200 with error message)
- Cache read guard: don't serve cached entries with empty data
- Cache write guard: don't cache empty/error results
- 24-hour TTL for financial data cache

### 4.3 Sector ETF Mapping
Static 11-row lookup in src/lib/config/sector-etf-map.ts mapping GICS sectors to SPDR ETFs. Optional industry-level sub-sector ETF mappings (e.g., Semiconductors → SOXX). Sector classification pulled automatically from FMP company profile.

---

## 5. Claude API Prompt Pipeline

### 5.1 Pipeline Architecture

Each stock runs through a multi-step analysis pipeline. Steps can be cached and refreshed independently.

```
Step 1: News & Sentiment Scan (web search enabled)
   ↓ outputs: news_summary, sentiment_scores (overall, twitter, reddit, media, analysts), social_buzz

Step 2: Fundamental Interpretation (uses FMP data, no web search)
   ↓ outputs: five_metrics forward outlook text for each of the 5 cards

Step 3: Sector-Relative Context (uses FMP data + sector ETF data)
   ↓ outputs: past_60d_relative_performance, forward_relative_outlook

Step 4: Bucket Assignment (uses outputs from steps 1-3)
   ↓ outputs: primary_bucket, secondary_bucket, rationale, confidence
   ↓ outputs: past_30_60_driver_summary, today_driver, forward_30_60_driver_outlook
   Note: Bucket 3 (Sentiment/Positioning/Virality) covers narrative-driven moves
   AND mechanical/positioning moves (index rebalances, short squeezes, gamma effects).
   The rationale must always specify which sub-type is driving the move.

Step 5: Thesis Check (uses step 1-3 outputs + user thesis)
   ↓ outputs: thesis_status, thesis_analysis
   ↓ outputs: past_30_60_validation_history, today_status, forward_30_60_thesis_outlook

Step 6: Catalyst Scan (web search enabled)
   ↓ outputs: events categorized by Thesis/Macro/Sector/Sentiment/Fundamental
   ↓ each event: name, date, bucket_tag, thesis_relevance, impact_hypothesis
   ↓ includes macro and sector events relevant to this specific stock, not just company events

Portfolio-level (runs once per scan, not per stock):
Step 7: Regime Check (uses SPY data, VIX, sector performance)
   ↓ outputs: regime (risk_on/risk_off/rotation/dislocation), rationale

Step 8: Anomaly Detection (uses per-stock returns vs. regime + sector)
   ↓ outputs: anomaly_flags[] per stock
```

### 5.2 Caching Rules

| Step | Cache Duration | Invalidation Trigger |
|---|---|---|
| News & Sentiment | 2-4 hours | Manual refresh, price spike (>2%) |
| Fundamental Interpretation | 24 hours | New quarterly filing detected |
| Sector-Relative Context | 24 hours | Same as fundamentals |
| Bucket Assignment | Recalculated each scan | Always fresh |
| Thesis Check | 24 hours | News cache invalidated or thesis text changed |
| Catalyst Scan | 12 hours | Manual refresh |
| Regime Check | 2-4 hours | Market hours only |
| Anomaly Detection | Recalculated each scan | Always fresh |

### 5.3 Prompt Design Principles

1. **Structured output.** Every prompt returns parseable JSON. The dashboard renders structured data, not raw AI prose.
2. **Context injection.** FMP data injected as structured data, not described narratively.
3. **Role specificity.** Each prompt has a focused role. Separation of concerns.
4. **Plain language output.** AI text reads like a smart friend explaining over coffee. No jargon on surface views.
5. **Time-horizon awareness.** Driver analysis, thesis checks, and sector-relative context all use the past/today/forward structure.
6. **Thesis-aware catalysts.** Catalyst scan must evaluate each event for thesis relevance and flag accordingly.

### 5.4 Estimated API Cost Per Scan

Per stock (6 steps): ~$0.05
Portfolio-level (steps 7, 8): ~$0.02
Full scan of 10 stocks: ~$0.52
Delta check (only steps 1, 4, 7, 8): ~$0.20
Monthly with caching: ~$10-20

---

## 6. Key Calculations (Non-AI)

### 6.1 Portfolio Beta
```typescript
function portfolioBeta(holdings: { beta: number; marketValue: number }[]): number {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  return holdings.reduce((sum, h) => sum + (h.beta * h.marketValue / totalValue), 0);
}
```

### 6.2 Correlation Matrix
```typescript
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
```

### 6.3 Anomaly Detection
```typescript
function detectAnomaly(
  stockReturn: number,
  marketReturn: number,
  stockBeta: number,
  threshold: number = 0.02
): { isAnomaly: boolean; divergence: number } {
  const expectedReturn = stockBeta * marketReturn;
  const divergence = stockReturn - expectedReturn;
  return { isAnomaly: Math.abs(divergence) > threshold, divergence };
}
```

---

## 7. Revised Sprint Plan

### Completed Sprints

**Sprint 0: Project Scaffolding** — DONE
Next.js App Router, TypeScript, Tailwind, Drizzle + SQLite, basic layout.

**Sprint 1: Holdings Management + FMP Integration + Layout** — DONE
Ticker input, CSV upload, FMP company profiles, sector ETF mapping, react-grid-layout panel system, draggable/resizable panels on both pages, column visibility and reorder toggles, dark theme, holdings editing (shares, cost basis).

**Sprint 2: Fundamental Data Layer** — DONE
FMP financial statement integration (income, balance sheet, cash flow, key metrics), Metrics That Matter cards with sparklines, Fundamentals panel with quarterly data, Revenue Flow Sankey with real data, peer comparison table, FMP caching layer with rate limit handling.

### Remaining Sprints

### Sprint 3: Sector-Relative Analysis + Correlation
**Goal:** Complete the quantitative analysis layer with real calculated data.
- Pull historical daily prices for all holdings, their sector ETFs, and SPY from FMP
- Calculate rolling 30-day and 90-day correlation coefficients between all holdings (for the correlation heatmap)
- Calculate rolling correlation between each stock and its sector ETF
- Build the correlation heatmap visualization with real data (portfolio dashboard)
- Populate the Sector Relative panel "Past 30-60 days" section with a real normalized performance chart (stock vs. sector ETF vs. SPY)
- Calculate sector-relative valuation percentiles (stock's P/E vs. sector median, etc.)
- Populate SPY daily change in the portfolio dashboard top bar
- Calculate portfolio daily P&L for holdings with cost basis entered
**Acceptance:** Correlation heatmap shows real correlations. Sector Relative panel shows real relative performance chart. SPY change appears in the top bar.

### Sprint 4: Claude AI Analysis Pipeline
**Goal:** The core intelligence layer. This is where Portfolio Monitor becomes a product, not just a data display.
- Build Claude API client wrapper (auth, retries, rate limits, structured JSON parsing)
- Implement all 8 prompt templates (6 per-stock steps + 2 portfolio-level)
- Implement pipeline orchestrator that runs steps in sequence, passes outputs forward
- Wire pipeline outputs to every panel that currently shows placeholders:
  - Driver Analysis panel: past/today/forward bucket assignments with rationales
  - Thesis panel: past/today/forward thesis validation with evidence
  - Sentiment panel: per-source sentiment scores and AI synthesis
  - Upcoming Catalysts: real events categorized by Thesis/Macro/Sector/Sentiment/Fundamental with thesis relevance flags
  - Metrics That Matter: forward outlook text for each of the 5 cards
  - Sector Relative: forward relative outlook text
  - Regime indicator on portfolio dashboard
  - Anomaly flags per stock on portfolio dashboard
  - Bucket distribution chart with AI summary on portfolio dashboard
  - Thesis Tracker scorecard on portfolio dashboard
  - Portfolio-level upcoming catalysts
- Build scan trigger: "Run Full Scan" button triggers the full pipeline for all holdings
- Build per-stock refresh: "Refresh" button on company page runs pipeline for that stock only
- Store all results in analysis_scans table with timestamps
**Acceptance:** Hit "Run Full Scan", wait 3-5 minutes, every placeholder on both the portfolio dashboard and company detail pages is populated with real AI-generated intelligence. Each stock has a bucket assignment, thesis check, sentiment summary, and catalyst list. The portfolio dashboard shows the regime, anomaly flags, and thesis scorecard.

### Sprint 5: Caching, History, and Delta Scans
**Goal:** Production-quality refresh behavior and historical tracking.
- Implement per-step cache invalidation logic (different TTLs per pipeline step)
- Implement delta scan: only re-run steps whose cache has expired (news every 2-4h, fundamentals every 24h, catalysts every 12h)
- Implement historical scan storage: all past scan results queryable by date
- Build historical timeline on company detail page showing past driver/thesis changes
- Time-range filtering on dashboard: "today" vs. "this week" vs. "since last scan"
- Loading states and progress indicators during scans (show which stock is being analyzed)
- Error handling: graceful fallbacks when Claude API or FMP calls fail
**Acceptance:** Second scan of the day completes in under 60 seconds (delta). User can browse historical scans. Loading states show progress.

### Sprint 6: Polish and Edge Cases
**Goal:** Everything works smoothly, looks professional, handles edge cases.
- Fix any remaining data issues for tickers with limited FMP coverage (GLXY, NBIS, Q)
- Ensure all panels auto-size to content height by default
- Responsive checks: nothing breaks on smaller desktop screens or tablets
- Consistent typography and spacing pass across all pages
- Bucket color coding consistency across all components (same colors for Market Beta, Sector, Sentiment, Fundamental everywhere)
- Test with portfolios of different sizes (1 stock, 5 stocks, 15 stocks) to ensure layouts hold
- Performance: ensure page loads stay under 3 seconds with cached data
**Acceptance:** Everything looks clean and professional. No visual bugs. Edge cases handled gracefully.

### Sprint 7: Documentation and Open Source Prep
**Goal:** Ready for other users.
- Comprehensive README: what it is, screenshots, setup instructions (Node.js, FMP key, Claude API key, first scan)
- .env.local.example with clear comments
- Architecture overview in docs/ folder explaining the panel system, prompt pipeline, and data flow
- Contribution guide (how to add features, how prompts work, how to add panels)
- License file (MIT or Apache 2.0, TBD)
- Clean up any hardcoded values, ensure all thresholds are configurable
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
SCAN_ANOMALY_THRESHOLD=0.02
SCAN_PRICE_SPIKE_THRESHOLD=0.02
CACHE_NEWS_HOURS=4
CACHE_FUNDAMENTALS_HOURS=24
CACHE_CATALYSTS_HOURS=12
```

---

## 9. Development Workflow

1. **Prompt development:** Use Claude Code (or Claude chat) to prototype and refine each prompt template. Test with real tickers. Iterate until the structured JSON output is reliable and the plain-language summaries read well.

2. **Sprint execution:** Feed one sprint description to Claude Code at a time. Start each new Claude Code session with: "This is the Portfolio Monitor project. Read product-spec.md and technical-plan.md for full context."

3. **Review cycle:** After each sprint, review the output. Run the app. Check acceptance criteria. Note issues before proceeding.

4. **FMP rate management:** Paid plan provides high limits but still be mindful during heavy development. Cache aggressively. Don't clear the cache unnecessarily.

5. **Testing:** Manual testing for V1. Automated tests in V2.

---

## 10. Risk Register

| Risk | Mitigation |
|---|---|
| FMP rate limits during heavy development | Paid plan ($29/month). Cache layer prevents redundant calls. Don't clear cache unless necessary. |
| FMP doesn't cover certain tickers (GLXY, NBIS, Q) | Graceful "Data unavailable" fallback. Investigate alternate symbols or supplementary data sources. |
| Claude API returns inconsistent JSON | Strict JSON schema in prompts. Validation + retry layer (max 2 retries). |
| Sector ETF mapping misses edge cases | Manual override field in holdings table. |
| SQLite concurrent writes during scans | Sequential scan execution. WAL mode for read concurrency. |
| Prompt quality varies by stock coverage | Test across large-cap, mid-cap, and international ADRs in Sprint 4. |
| react-grid-layout performance with many panels | Monitor render performance. Panels are relatively few (7-8 max) so this should not be an issue. |

---

## 11. Post-V1 Technical Considerations

- **Plaid integration (V2):** Server-side auth flow. Schema extensible for access tokens and linked accounts.
- **PostgreSQL migration (V2):** Drizzle abstracts the DB layer. Migration is a config change.
- **Comparative charting (V2):** Data already in price_history and fundamentals tables. V2 adds selection UI.
- **Chat interface (V3):** Conversation history table + streaming Claude API. Pipeline steps invokable on demand.
- **Background scheduled scans (V2/V3):** Job queue (node-cron or BullMQ). Scan trigger API route is the foundation.
- **Multi-agent debate (V3):** Bull vs. bear agents arguing each position. Uses same pipeline data as input.
- **Tax awareness (V3):** Tax-loss harvesting flags, wash sale prevention, cost basis tracking.
- **Mobile-optimized view (V3):** Focused on most-used features identified from desktop usage data.

---

*Feed this document to Claude Code one sprint at a time. Always provide the product spec as companion context. Review after each sprint before proceeding.*
