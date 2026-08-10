# Architecture

How Portfolio Monitor is put together: the data flow, the panel system, the
prompt pipeline, and the caching rules that keep scans affordable.

---

## Overview

```
Browser
  │
  ├── Next.js App Router (server components render pages with data already in hand)
  │     ├── /                    portfolio dashboard
  │     ├── /company/[ticker]    company detail
  │     └── /settings/…          holdings management, prompt lab
  │
  ├── API routes (client-triggered work)
  │     ├── POST /api/scan       start a portfolio scan  → scan-manager singleton
  │     ├── GET  /api/scan       SSE progress stream
  │     ├── POST /api/scan/step  re-run one pipeline step for one ticker
  │     └── /api/holdings        holdings CRUD
  │
  └── SQLite (better-sqlite3 + Drizzle), local file at ./data/portfolio.db
        ▲                            ▲
        │                            │
  Financial Modeling Prep      Claude API (with web search)
  (prices, financials, peers)  (the analysis pipeline)
```

Everything is local-first. The database is a file on disk; no data leaves the
machine except the API calls to FMP and Anthropic.

Pages are server components with `export const dynamic = 'force-dynamic'`, so
each navigation reads current data straight from SQLite. There is no client-side
data-fetching layer to keep in sync.

---

## Data model

Six tables (`src/lib/db/schema.ts`):

| Table | Holds | Notes |
|---|---|---|
| `holdings` | Your positions | ticker, shares, cost basis, sector, sector ETF, beta, thesis text |
| `fundamentals` | FMP financials per ticker | One JSON blob per ticker, 24h TTL |
| `price_history` | Daily closes | Unique on (ticker, date); appended incrementally |
| `analysis_scans` | AI output | One row per scan per ticker; JSON columns per pipeline step |
| `regime_snapshots` | Market regime | Appended each time step 7 runs |
| `anomaly_flags` | Divergence flags | Resolved flags are kept for history |

`analysis_scans` is append-only, which is what makes scan history browsing work:
the company page reads the newest row by default, or a specific row via
`?scan=<id>`.

**JSON columns.** Most columns hold serialized JSON. Never `JSON.parse` these at
the call site — `deserializeScan()` (`src/utils/deserialize-scan.ts`) is the one
place that turns a raw row into a typed `AnalysisScan`, including tolerating old
rows whose `thesis_analysis` held plain prose rather than JSON.

---

## The panel system

Both pages are grids of draggable, resizable panels built on `react-grid-layout`.

- `DashboardGridLoader` / `CompanyGridLoader` are thin client wrappers that
  defer loading the grid until the container width is known, avoiding a
  layout flash.
- Layout and per-panel collapse state persist in `localStorage` under versioned
  keys (`pm:company-layout-v7`, `pm:columns-v3`, …). **Bump the version suffix
  whenever you change default layouts**, otherwise returning users keep their
  stale saved layout and never see the new arrangement.
- Panels size to their container. A panel whose content must fill the available
  height (the Sankey diagram, for instance) needs an unbroken flex chain from
  the panel body down to the chart — a plain block wrapper in that chain
  collapses the child to zero height and the chart silently disappears.

---

## The analysis pipeline

Per stock, six sequential Claude calls (`src/lib/claude/pipeline.ts`), each
feeding the next:

| # | Step | Web search | Produces |
|---|---|---|---|
| 1 | News & sentiment | yes | tone, per-channel scores, headlines, analyst actions |
| 2 | Fundamental interpretation | no | forward outlook for each of the five metric cards |
| 3 | Sector-relative context | no | premium trend, forward relative outlook |
| 4 | Bucket assignment | no | primary/secondary driver bucket + past/today/forward |
| 5 | Thesis check | no | confirmed / pressure / challenged + evidence |
| 6 | Catalyst scan | yes | upcoming events, categorized and thesis-tagged |

Then, once per scan (`src/lib/claude/portfolio-scan.ts`):

| # | Step | Web search | Produces |
|---|---|---|---|
| 7 | Regime check | yes | risk-on / risk-off / rotation / dislocation |
| 8 | Anomaly detection | no | per-ticker divergence flags |

**The four buckets.** Every move is classified as (1) Market Beta, (2) Sector /
Factor Rotation, (3) Sentiment / Positioning, or (4) Fundamental Change. Bucket 3
covers both narrative-driven moves and mechanical ones (index rebalances, short
squeezes, gamma) — the rationale is expected to say which.

Each step's prompt lives in `src/lib/claude/prompts/` and returns strict JSON.
`callClaude()` (`src/lib/claude/client.ts`) wraps the API with retries,
exponential backoff, and JSON extraction. Individual steps fail soft: a failed
step logs a warning and leaves its column null rather than aborting the scan.

### Scan orchestration

`src/lib/scan/scan-manager.ts` owns scan execution in module scope, so a scan
survives the browser navigating away or reloading. Clients observe progress over
SSE (`GET /api/scan`) and can reconnect to a run already in flight. Only one scan
runs at a time; a second `POST` returns 409 with the current state.

### Delta scans and caching

A full scan re-runs all eight steps. A **delta scan** (the default, `mode:
'auto'`) re-runs only what has gone stale, which is what makes a second scan of
the day cheap.

`src/lib/scan/delta.ts` holds this decision logic and is deliberately pure — no
database, no network — so it can be tested directly (`tests/delta.test.ts`).

| Step | TTL | Also re-runs when |
|---|---|---|
| News & sentiment | `CACHE_NEWS_HOURS` (4h) | price moved ≥ `SCAN_PRICE_SPIKE_THRESHOLD` |
| Fundamentals | `CACHE_FUNDAMENTALS_HOURS` (24h) | — |
| Sector-relative | 24h | — |
| Bucket assignment | never cached | always — it reads today's tape |
| Thesis check | 24h | news re-ran, or the thesis text was edited |
| Catalyst scan | `CACHE_CATALYSTS_HOURS` (12h) | — |
| Regime check | 4h | — |
| Anomaly detection | never cached | always |

Any step whose stored output is missing re-runs regardless of its timestamp.

Freshness is tracked per step in `analysis_scans.step_timestamps`. When a step is
skipped, its previous output is carried forward into the new row, so every row
stays a complete snapshot — and its timestamp is carried forward too, so skipping
a step never makes it look newer than it is. Rows written before this column
existed fall back to `scanned_at`.

---

## FMP integration and degradation

`src/lib/fmp/` wraps Financial Modeling Prep. Two quirks drive the design: FMP
returns HTTP 200 with a plaintext body for premium-gated tickers, and HTTP 200
with `{"Error Message": …}` when rate-limited. `fmpFetch()` detects both and
throws typed errors rather than letting bad data reach the cache.

The app is built to stay useful as coverage degrades:

- **Fundamentals** are cached 24h in SQLite. Empty results are never written to
  cache, so a rate-limited call doesn't poison it.
- **Quotes** fall back to the last two cached daily closes when the live quote
  endpoint is unavailable (`getQuotes()` in `src/lib/fmp/quotes.ts`). Prices and
  P&L still render; the UI labels them as end-of-day.
- **Panels with no data** show an explicit empty state rather than a misleading
  placeholder.

This means the app degrades from *live* → *end-of-day* → *empty state* rather
than breaking, and `npm run seed:demo` gives a fully populated app with no keys
at all.

---

## Adding things

**A new panel.** Add the component under `src/components/dashboard/` or
`src/components/company/`, register it in the grid's layout array with a unique
key, and bump the layout `localStorage` version so existing users get the new
default. Panels receive already-fetched data as props — do not fetch inside a
panel.

**A new pipeline step.** Add a prompt builder in `src/lib/claude/prompts/`, call
it from `pipeline.ts` guarded by `shouldRun(step)`, add the step name to
`ALL_STEPS` in `src/lib/scan/delta.ts`, give it a TTL in `STEP_TTL_HOURS`, and
add a column (or reuse `full_analysis`) for its output. Add a case to
`tests/delta.test.ts` covering when it should re-run.

**A new sector ETF mapping.** `src/lib/config/sector-etf-map.ts` maps GICS
sectors to SPDR ETFs, with optional industry-level overrides.

---

## Conventions worth knowing

- **Tailwind class names must be complete string literals.** The JIT scanner
  reads source text, so `` `text-${color}` `` produces no CSS. Lookup tables
  holding whole class strings are fine.
- **Bucket colors are centralized** in `src/lib/config/constants.ts`. Import
  `BUCKET_COLORS` rather than hardcoding, so the four buckets stay consistent
  across every view.
- **`npm run dev` clears `.next` first.** This is deliberate — a stale
  production build in the webpack cache can otherwise be served instead of a
  fresh Tailwind compilation.
- **Thresholds are configurable.** Anything tunable lives in `constants.ts`,
  reading from environment variables with sensible defaults.
