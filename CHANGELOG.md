# CHANGELOG — Portfolio Monitor

> Last updated: 2026-04-06
> Purpose: Session context for continuing development. Documents what's built, what changed post-sprint, and what's next.

---

## Sprint Status

| Sprint | Status | Summary |
|--------|--------|---------|
| 0 | Complete | Project scaffolding, DB schema, nav shell, config |
| 1 | Complete | Holdings CRUD, CSV import, FMP profiles, react-grid-layout panels, column toggles, dark theme |
| 2 | Complete | FMP financials (income/cashflow/balance sheet), 24h SQLite cache, Sankey diagram, Fundamentals panel, peer comparison, quote normalization |
| 3 | Complete | 252-day price history, 30/90-day rolling correlation, correlation heatmap, sector-relative charts, P/E percentile, portfolio P&L, SPY tracking |
| 4 | Complete | Full Claude AI pipeline — all 8 prompt steps, SSE scan orchestration, regime snapshots, anomaly flags |
| 5 | Not started | Caching, history, delta scans |
| 6 | Not started | Polish and edge cases |
| 7 | Not started | Docs + open source prep |

---

## Sprint 4 — Claude AI Pipeline (Implemented)

### Per-stock analysis (steps 1–6, run sequentially per ticker)
1. **News & Sentiment** — web-search-enabled, returns structured sentiment scores per channel (overall, Twitter, Reddit, media, analysts)
2. **Fundamental Interpretation** — analyzes FMP data, generates forward outlook text for each of the 5 Metrics That Matter cards
3. **Sector-Relative Context** — uses normalized performance + peer data
4. **Bucket Assignment** — classifies into primary/secondary bucket (1–4) with confidence score + driver analysis (past/today/forward)
5. **Thesis Check** — validates user thesis against current signals, returns status (confirmed/pressure/challenged) with evidence
6. **Catalyst Scan** — web-search-enabled, returns upcoming events categorized by type

### Portfolio-level analysis (steps 7–8, run once after all stocks)
7. **Regime Check** — determines market regime (risk_on/risk_off/rotation/dislocation) with web search
8. **Anomaly Detection** — flags divergences (regime, sector, thesis challenge)

### Key files
- `src/lib/claude/pipeline.ts` — per-stock orchestrator (`analyzeStock()`)
- `src/lib/claude/portfolio-scan.ts` — portfolio-level orchestrator (`analyzePortfolio()`)
- `src/lib/claude/prompts/` — 8 prompt builders (one per step)
- `src/lib/claude/client.ts` — Claude API wrapper with retry (3 attempts, exponential backoff), JSON extraction, web search tool support
- `src/app/api/scan/route.ts` — POST endpoint, SSE progress streaming

---

## Post-Sprint Fixes & Layout Changes

These changes were made after Sprint 4 implementation, during UI integration sessions.

### Scan Progress System
- Created `ScanContext.tsx` — React Context for shared scan state between command strip and dashboard
- Created `CommandStripScanButton.tsx` — client wrapper to place ScanButton in the server-rendered command strip
- Moved "Run Full Scan" button from dashboard grid into the top command strip bar
- Dashboard shows a full-width progress bar during scan with ticker count and current step
- Holdings table rows show spinner on active ticker, green checkmark on completed tickers

### Holdings Table Improvements
- Wired scan data into holdings columns: buckets, thesis status, next catalyst, driver rationale now display real AI data
- Simplified bucket/driver indicator: single colored dot + full driver name (was 4 dots)
- Removed "Next Catalyst" from default visible columns (still available as optional toggle)
- Updated ThesisIndicator to show colored dot (green/amber/red) + status label from scan data
- Bumped localStorage keys to v3 (`pm:columns-v3`, `pm:col-order-v3`) to force fresh defaults

### Thesis Tracker Panel (Dashboard)
- Rewrote to show per-stock thesis status with clickable ticker links to `/company/[ticker]`
- Added `extractThesisSummary()` — parses `thesisAnalysis` JSON to extract `today.explanation` (was showing raw JSON)
- Sorted by severity: challenged → pressure → confirmed → unset

### Thesis Bi-directional Sync
- Company detail page (`CompanyGrid.tsx`) now calls `router.refresh()` after thesis save
- Both dashboard and company detail share the same PATCH endpoint + `force-dynamic`, so navigation always gets fresh DB data

### Company Detail Layout
- Swapped Driver Analysis and Sentiment panel positions (Driver now top-left, Sentiment below)
- Improved CatalystTimelineReal: bigger dots (w-4 h-4), thicker line, taller container, hover tooltips
- Bumped layout storage key to v7 (`pm:company-layout-v7`)

### Market Beta Color Update
- Changed Bucket 1 (Market Beta) color from gray to indigo across the entire platform
- Updated 8 locations across 5 files: `tailwind.config.ts`, `Badge.tsx`, `HoldingsList.tsx`, `DraggableDashboard.tsx`, `CompanyGrid.tsx`
- Tailwind config: `bucket1: '#818CF8'` (Indigo-400)
- Badge variant: `bg-indigo-950 text-indigo-300`

### Prompt Testing Interface
- Added `/settings/prompt-test` page for testing Claude prompts against holdings

---

## What's Working

- **Holdings management** — add/edit/delete tickers, CSV import, inline editing (shares, cost basis, thesis)
- **FMP financial data** — income, cashflow, balance sheet, key metrics, peers, quotes, all cached 24h in SQLite
- **Price history & correlation** — 252-day daily closes, 30/90-day rolling correlation matrix, heatmap visualization
- **Sector-relative analysis** — normalized performance chart (stock vs sector ETF vs SPY), P/E percentile ranking
- **Portfolio dashboard** — 5-panel draggable grid (holdings, correlation, drivers, thesis tracker, catalysts), command strip with regime/SPY/beta/P&L
- **Company detail** — 7-panel draggable grid (driver, thesis, sentiment, sector-relative, catalysts, 5 metrics + Sankey, fundamentals)
- **Claude AI pipeline** — all 8 steps operational, results stored in DB and displayed in UI panels
- **Scan orchestration** — full portfolio scan with real-time SSE progress, per-row status indicators
- **Data persistence** — all analysis results in `analysisScans`, regime in `regimeSnapshots`, anomalies in `anomalyFlags`

---

## Known Issues

1. **Tailwind CSS intermittent styling loss** — user reports occasional "no formatting" on page load. CSS file is generated and served correctly (46KB, contains expected classes). Likely a browser caching issue — hard refresh (`Cmd+Shift+R`) resolves it. The dev script already runs `rm -rf .next` to clear server-side cache.

2. **thesisAnalysis stored as JSON string** — `pipeline.ts` stores `JSON.stringify(thesisCheck)` but `deserializeScan()` does NOT parse it (unlike other JSON fields). The `extractThesisSummary()` helper handles this in the dashboard, but any new consumers of `scan.thesisAnalysis` must parse it manually.

3. **FMP premium endpoints** — `/key-metrics?period=quarter` returns 402 (premium-only). Workaround uses `/ratios-ttm` instead. Some tickers (GLXY, NBIS, Q) have limited FMP coverage.

4. **Sankey chart edge cases** — normalization may break for very small or negative revenue values.

5. **Fundamentals table footnotes** — not fully implemented in CompanyGrid.

---

## Database Schema (6 tables)

```
holdings          — ticker, companyName, shares, costBasis, sector, industry, sectorEtf, beta, thesis
fundamentals      — ticker (unique), data (JSON blob), cachedAt (24h TTL)
priceHistory      — ticker, date (unique index), close, volume
analysisScans     — ticker, scanType, bucketPrimary/Secondary, bucketRationale, bucketConfidence,
                    newsSentiment (JSON), thesisStatus, thesisAnalysis (JSON string),
                    catalysts (JSON), fiveMetrics (JSON), sectorRelative (JSON),
                    driverAnalysis (JSON), fullAnalysis (JSON), scannedAt
regimeSnapshots   — regime, rationale, spyChange, vix, snappedAt
anomalyFlags      — ticker, flagType, description, severity, resolved, flaggedAt
```

---

## Next Steps

### Sprint 5: Caching, History, Delta Scans
- Per-step cache invalidation with variable TTLs (news = 4h, fundamentals = 24h, etc.)
- Delta scan path — only re-run expired steps instead of full 8-step pipeline
- Historical scan browsing — view past analyses with timestamp selector
- Time-range filtering on dashboard ("today" vs "this week" vs "since last scan")

### Sprint 6: Polish & Edge Cases
- Graceful fallbacks for tickers with limited FMP data (GLXY, NBIS, Q)
- Responsive layout checks
- Typography and spacing consistency audit
- Performance optimization (sub-3s page loads)
- Error handling improvements for Claude API / FMP failures

### Sprint 7: Docs & Open Source Prep
- README with screenshots
- `.env.local.example` with comments
- Architecture documentation
- License file
