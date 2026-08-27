# CHANGELOG — Portfolio Monitor

> Last updated: 2026-08-08
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
| 5 | Complete | Background scan singleton, per-step manual refresh, per-step TTL caching, delta scans, scan history browsing. Dashboard time-range filtering deferred (see Deferred below) |
| 6 | Partial | Shipped: centralized bucket colors, empty states, typography pass, graceful degradation without a paid FMP plan. Remaining: responsive checks, performance pass |
| 7 | Complete | README with screenshots, docs/architecture.md, docs/contributing.md, MIT LICENSE, demo seed script |

---

## 2026-08-08 — Bug fixes, delta scans, demo mode, docs

### Bug fixes
- **Revenue Flow Sankey rendered blank on every company page.** The panel body had
  height but the chart wrapper collapsed to 0px, so the ResizeObserver never measured
  a drawable size and no SVG was produced. Cause: the scroll container introduced by
  the 2026-05-05 panel refactor (`d598e40`) was a plain block, breaking the flex chain
  the `h-full` chart relied on. Fixed with a flex column plus a min height.
- **Sankey edge cases:** negative gross profit and operating losses produced orphan
  nodes and non-positive link values that broke the d3-sankey layout. The builder now
  terminates the flow at the last meaningful node and floors link widths.
- **`thesisAnalysis` JSON-string trap:** `deserializeScan()` now parses it into a
  `ThesisCheck` (wrapping legacy prose rows in a minimal object), and the duplicated
  ad-hoc parsing in `DraggableDashboard` and `CompanyGrid` is gone.

### Delta scans (completes Sprint 5)
- `analysis_scans.step_timestamps` records when each pipeline step last actually ran.
- `src/lib/scan/delta.ts` — pure, dependency-free step-selection logic: per-step TTLs
  (news 4h, catalysts 12h, fundamentals/sector/thesis 24h, bucket never cached), plus
  invalidation on price spikes, edited thesis text, and missing stored output.
- `analyzeStock()` accepts `stepsToRun` / `previous` and carries skipped steps' output
  *and* timestamps forward, so each row stays a complete snapshot without a skipped
  step appearing newer than it is. Rows are written as `scanType: 'delta'`.
- The regime check reuses a snapshot inside its TTL instead of re-running.
- `POST /api/scan` takes `{ mode: 'auto' | 'full' }`. The dashboard shows **Run Scan**
  (delta) with an explicit **Full** rescan, and progress reports cached-step counts.
- `tests/delta.test.ts` — 14 cases, run with `npm test`.

### Scan history
- Company pages accept `?scan=<id>` and show a timestamp picker of past scans (marking
  delta runs and the latest), with a banner clarifying that only the AI analysis is
  historical while prices and financials stay current.

### Running without a paid FMP plan
- `getQuotes()` falls back to the last two cached daily closes when live quotes are
  unavailable, so prices, market values, and P&L render instead of dashes. Quotes carry
  `source`/`asOf`; the dashboard labels the strip "SPY at Close" for end-of-day data.
- All quote call sites (dashboard, company page, scan manager, per-step refresh) use it.

### Demo mode + docs
- `npm run seed:demo` (`scripts/seed-demo.cjs`) seeds five holdings, ~130 days of
  deterministic price history, financials, two rounds of scans, a regime snapshot, and
  anomaly flags — dates derived from the current date so it never looks stale. The whole
  app is explorable with no API keys.
- `docs/architecture.md`, `docs/contributing.md`, MIT `LICENSE`, README rewrite with
  screenshots, demo-mode quickstart, and scanning docs.

### Deferred
- **Dashboard time-range filtering** ("today" vs "this week" vs "since last scan").
  Scan history browsing covers the underlying need on the company page; a dashboard-wide
  time filter needs a clearer product decision about what each range should show.
- **Sprint 6 responsive + performance passes** remain open.

---

## Sprint 5 commit (2026-04-13) — Background Scan & Per-Step Refresh

Note: this commit shipped a different subset than the planned Sprint 5 (caching/delta/history remain open — see table above).

- Background scan singleton (`src/lib/scan/scan-manager.ts`) — scans survive page navigation/refresh via server-side scan manager with reconnectable SSE progress stream
- Per-panel refresh: re-run individual pipeline steps (news, bucket, thesis, catalysts) from company detail page (`src/app/api/scan/step/route.ts`, `StepRefreshButton.tsx`)
- Anomaly flag column: pulsing red dot indicator with hover tooltip
- Global Claude brevity instruction prepended to all pipeline prompts
- Quarterly estimates derived from annual when FMP premium unavailable
- Catalysts panel: flat date-sorted list; minimum 12px font size enforced

## Layout fixes (2026-05-05)

- Persist panel collapse state per ticker; default expanded; smooth grid-rows collapse animation
- Restored panel scrolling and per-company portfolio drivers list
- Restored bucket distribution bars; added catalyst timeline to dashboard

## Sprint 6 commit (2026-05-07) — Partial polish

- Centralized bucket colors in `src/lib/config/constants.ts` (indigo/blue/amber/emerald); fixed sentiment category color (cyan → amber)
- SankeyChart: dimmed placeholder with label instead of misleading sample data when financials unavailable
- Ghost timeline label sizing consistency (12px)

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

## 2026-08-27 — Publishing pass: self-serve setup, first-run fixes

Refocus: the project is now packaged for someone to clone from GitHub and run against
their own positions with their own FMP and Anthropic keys. Hosting concerns
(auth, Postgres, secret management) are explicitly out of scope.

### Bug fixes

- **Relative-performance chart defaulted to a range it could not draw.**
  `SectorRelativeChart` initialised to `1D`, but the 1D and 5D ranges require an
  intraday feed that is unavailable without a paid FMP plan. The button was correctly
  disabled while the state still said `1D`, so `chartData` fell through to
  `data.slice(-1)` — a single point, rendered as a flat line with one dot, on every
  company page. Range selection now picks the first range that can actually draw, and
  the availability predicate is shared between the initial state and the buttons.
- **Company panels opened pre-scrolled with text sliced mid-line.** Default panel
  heights were measured against the seeded demo portfolio: Driver Analysis, Sentiment,
  Thesis, Sector-Relative, Catalysts, Metrics, and Fundamentals were all shorter than
  their content. Heights raised so a first-run page shows its content, columns still
  ending level so no dead-space gaps open between rows. Layout key bumped
  `pm:company-layout-v8` → `pm:company-layout-v9`.
- **Stray resize marks along panel edges.** The company grid enabled all eight resize
  handles; the `n`/`w`/`nw`/`ne`/`sw` handles rendered as floating marks against the
  page background. Restricted to `s`/`e`/`se`.
- **Duplicated "Holdings" heading** — the panel chrome and `HoldingsList` both rendered
  the title. The inner one is now a position count.
- **Demo estimates were internally inconsistent.** `seed-demo.cjs` derived estimated
  net income from a flat 25% margin regardless of the company, so Amazon's FY27E net
  income printed as +212% against a FY26 actual struck at ~9%. Estimates now use each
  company's own net margin from its spec.
- **Catalyst timeline dead space** — `mt-10` above the track left a visible gap under
  the panel header; tightened to `mt-5`.

### Layout

- Dashboard: Holdings and the Correlation Heatmap now sit above Upcoming Catalysts.

### Documentation

- README rewritten for a self-serve audience: problem framing up front, keyless demo
  before setup, a nine-step "use it with your own portfolio" walkthrough, and a new
  **How to read the output** section explaining the four drivers, thesis statuses,
  regime, and anomaly flags — none of which were documented anywhere.
- Setup no longer tells users to run `db:generate`. That is a maintainer command and
  running it on a fresh clone risks a stray migration file; `db:migrate` alone produces
  the complete schema (verified against a clean database).
- Added "What this is not", costs and limits, and troubleshooting sections.
- Sprint roadmap removed from the README — it lives here.
- Screenshots regenerated from a production build against the seeded demo portfolio.

### Still open

- Pipeline step failures remain silent (logged, field nulled, no UI signal).
- The Settings page is still a non-functional mock with light-theme styling.
- `POST /api/holdings` hard-fails without an FMP key, so a keyless user cannot add a
  ticker by symbol (CSV import still works).
- `CLAUDE_MODEL` defaults to `claude-sonnet-4-6`; the current Sonnet is `claude-sonnet-5`.
- No responsive pass. Layouts assume a desktop viewport.

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

1. **Tailwind CSS intermittent styling loss** — occasional "no formatting" on page load. The CSS file is generated and served correctly (46KB, contains expected classes), so this is most likely browser caching; a hard refresh (`Cmd+Shift+R`) resolves it. The dev script already runs `rm -rf .next` to clear the server-side cache.

2. **FMP premium endpoints** — `/key-metrics?period=quarter` returns 402 (premium-only); the workaround uses `/ratios-ttm`. Some tickers (GLXY, NBIS, Q) have limited FMP coverage. Without a paid plan the app now falls back to cached daily closes for quotes, so pages stay usable, but panels that need statement data will show empty states for thinly covered symbols.

3. **Fundamentals table footnotes** — not fully implemented in `CompanyGrid`.

4. **No responsive/mobile pass** — layouts assume a desktop viewport. Narrow screens are not broken so much as untested.

### Fixed on 2026-08-08
- ~~Revenue Flow Sankey renders blank~~ — height chain repaired; see the dated entry above.
- ~~Sankey edge cases for negative/small values~~ — builder now guards them.
- ~~`thesisAnalysis` stored as an unparsed JSON string~~ — `deserializeScan()` handles it.

---

## Database Schema (6 tables)

```
holdings          — ticker, companyName, shares, costBasis, sector, industry, sectorEtf, beta, thesis
fundamentals      — ticker (unique), data (JSON blob), cachedAt (24h TTL)
priceHistory      — ticker, date (unique index), close, volume
analysisScans     — ticker, scanType ('full'|'delta'|'step'), bucketPrimary/Secondary,
                    bucketRationale, bucketConfidence, newsSentiment (JSON), thesisStatus,
                    thesisAnalysis (JSON), catalysts (JSON), fiveMetrics (JSON),
                    sectorRelative (JSON), driverAnalysis (JSON), fullAnalysis (JSON),
                    stepTimestamps (JSON: per-step freshness), scannedAt
regimeSnapshots   — regime, rationale, spyChange, vix, snappedAt
anomalyFlags      — ticker, flagType, description, severity, resolved, flaggedAt
```

---

## Next Steps

### Remaining Sprint 6 work
- **Responsive pass** — layouts assume a desktop viewport; check tablet and narrow desktop
- **Performance** — verify sub-3s page loads with a 15-holding portfolio and warm cache
- **Scan error surfacing** — pipeline steps currently fail soft into the server log; surface
  per-step failures in the scan progress UI so a silently empty panel is explicable

### Deferred / needs a product decision
- **Dashboard time-range filtering** — what should "this week" show for a panel whose data
  is a point-in-time snapshot? Scan history on the company page covers the concrete need
  for now.

### Verification before real use
The delta-scan and no-FMP paths were verified against seeded demo data and the type
checker; they have **not** been exercised against live Claude and FMP calls. First real
run to sanity-check: run a full scan, then a delta scan an hour later, and confirm the
progress line reports cached steps and the second run is materially faster.

### V2 candidates (from the technical plan)
- Plaid brokerage integration, PostgreSQL for a hosted version, scheduled background
  scans, comparative charting
