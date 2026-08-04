# CLAUDE.md — Project Notes for Claude Code

Portfolio Monitor is a **local-first Next.js 15 portfolio intelligence app**. For every stock a
user holds it answers two questions: *why is this moving right now?* (classified into four driver
buckets) and *what should I watch over the next 90 days?* Data comes from Financial Modeling Prep
(FMP); the analysis comes from an 8-step Claude pipeline. Everything persists to a local SQLite
file — nothing leaves the machine except API calls.

---

## Commands

```bash
npm run dev          # clears .next cache, then starts on :3000
npm run build        # production build — also the only type-check gate (see below)
npm start            # serve a production build

npm run db:generate  # drizzle-kit: emit SQL migration from schema.ts
npm run db:migrate   # apply migrations to ./data/portfolio.db
npm run db:push      # push schema directly (dev shortcut, skips migration files)
```

**There is no test runner and no lint script.** `npm run build` runs Next's TypeScript check
(`strict: true`), so that is the check to run after code changes. Scattered
`// eslint-disable-next-line` comments are vestigial — ESLint is not installed.

If the dev server can't bind :3000, kill the old process first: `kill $(lsof -ti:3000)`.

Requires Node 18+. Copy `.env.local.example` → `.env.local` and set `FMP_API_KEY` and
`CLAUDE_API_KEY` before anything works; both clients throw on a missing key.

---

## Layout

```
src/
├── app/                      # Next.js App Router
│   ├── page.tsx              # dashboard (server component, force-dynamic)
│   ├── layout.tsx            # nav shell + globals.css
│   ├── company/[ticker]/     # company detail (server component, ~520 lines of data prep)
│   ├── settings/             # settings + /settings/prompt-test ("Prompt Lab")
│   └── api/                  # route handlers (see API surface below)
├── components/
│   ├── dashboard/            # HoldingsList, DraggableDashboard, CorrelationHeatmap, ScanButton…
│   ├── company/              # CompanyGrid, FiveNumbers, SankeyChart, SectorRelativeChart…
│   └── ui/                   # Card, Badge, ExpandableSection, LoadingState
├── lib/
│   ├── db/                   # Drizzle client + schema.ts + migrations/
│   ├── fmp/                  # FMP client, quotes, prices, financials, fundamentals cache
│   ├── claude/               # client.ts, pipeline.ts, portfolio-scan.ts, prompts/
│   ├── scan/scan-manager.ts  # singleton background-scan orchestrator
│   ├── analysis/             # correlation, beta, anomaly math (pure functions)
│   └── config/               # constants.ts, sector-etf-map.ts
├── types/index.ts            # all shared domain types
└── utils/                    # format, cache TTLs, deserialize-scan
```

Path alias: `@/*` → `./src/*`. Use it — relative `../../` imports are not the house style.

---

## Core data flow

**Page render (read path).** Pages are server components with `export const dynamic = 'force-dynamic'`.
They query SQLite directly via Drizzle, call FMP for live quotes, then pass plain props into client
components. Every external call is wrapped in try/catch that **degrades gracefully** — a failed quote
fetch renders `—`, it never throws the page. Preserve that pattern.

**Scan (write path).** `POST /api/scan` calls `startScan()` on the module-scope singleton in
`lib/scan/scan-manager.ts` and returns immediately. The scan keeps running across client disconnects
and page navigations; `GET /api/scan` is a reconnectable SSE stream that replays progress events from
the manager's buffer. Never move scan execution back into the route handler.

Per ticker the manager: fetches quotes → `getFundamentals()` → ensures 252d price history → computes
relative performance + P/E percentile → calls `analyzeStock()`. After all tickers it calls
`analyzePortfolio()` once.

---

## The Claude pipeline

Eight steps. Steps 1–6 run per stock in `lib/claude/pipeline.ts` (`analyzeStock`); steps 7–8 run once
per scan in `lib/claude/portfolio-scan.ts` (`analyzePortfolio`).

| # | Step | Module | Web search |
|---|------|--------|-----------|
| 1 | News & sentiment | `prompts/news-sentiment.ts` | yes |
| 2 | Fundamental interpretation | `prompts/fundamental-analysis.ts` | no |
| 3 | Sector-relative context | `prompts/sector-relative.ts` | no |
| 4 | Bucket assignment + driver analysis | `prompts/bucket-assignment.ts` | no |
| 5 | Thesis check | `prompts/thesis-check.ts` | no |
| 6 | Catalyst scan | `prompts/catalyst-scan.ts` | yes |
| 7 | Regime check | `prompts/regime-check.ts` | yes |
| 8 | Anomaly detection | `prompts/anomaly-detection.ts` | no |

**Steps pass outputs forward** (step 4 consumes 1–3; step 5 consumes 1–3), so reordering them breaks
context. Each step is individually wrapped in try/catch: a failed step logs a warning, leaves its
field `null`, and the pipeline continues. A scan that half-fails still writes a row.

### Prompt module contract

Every file in `lib/claude/prompts/` exports one `build<Name>Prompt(params)` returning
`{ system, userMessage, webSearch?, maxSearches? }`, built from exactly these two locals:

```ts
const system = `...`;
const userMessage = `...`;
```

**Keep those two variable names and the template-literal form.** The Prompt Lab
(`/api/prompt-source`) locates them by regex (`const system = \``) and rewrites the file in place —
renaming the locals or switching to string concatenation silently breaks in-app prompt editing.
System prompts declare the exact JSON shape they expect back.

### `callClaude<T>()` (`lib/claude/client.ts`)

The single entry point for pipeline calls. It prepends `GLOBAL_SYSTEM_PREFIX` (a brevity instruction)
to every system prompt, retries 3× with 1s/4s/16s backoff on rate-limit and overload errors, extracts
JSON from the response (code fence first, then bracket matching), and on a parse failure asks Claude
once to repair its own JSON. New Claude calls in the pipeline should go through it rather than the
raw SDK. Model comes from `CLAUDE_MODEL` (default `claude-sonnet-4-6`) in `lib/config/constants.ts`.

Note: `/api/prompt-test` deliberately calls the SDK directly — no brevity prefix, no retry — so Prompt
Lab shows the *raw* prompt's behavior. That divergence is intentional.

---

## Database

SQLite via better-sqlite3 + Drizzle at `./data/portfolio.db` (WAL mode, so reads work during a
background scan). Six tables in `lib/db/schema.ts`:

| Table | Holds |
|-------|-------|
| `holdings` | ticker, name, shares, costBasis, sector, industry, sectorEtf, beta, thesis |
| `fundamentals` | one JSON blob per ticker (unique) + `fetchedAt` for the 24h TTL |
| `priceHistory` | daily closes, unique index on `(ticker, date)` |
| `analysisScans` | append-only AI results; "latest" = newest `scannedAt` per ticker |
| `regimeSnapshots` | append-only regime history |
| `anomalyFlags` | flags with a `resolved` 0/1 column |

**JSON-in-TEXT is the convention.** Composite fields (`newsSentiment`, `catalysts`, `fiveMetrics`,
`sectorRelative`, `driverAnalysis`) are `JSON.stringify`'d on write and parsed by
`utils/deserialize-scan.ts` on read. **Always read scan rows through `deserializeScan()`** rather than
using the raw Drizzle row.

Schema changes: edit `schema.ts` → `npm run db:generate` → `npm run db:migrate`, and commit the
generated files under `src/lib/db/migrations/`.

---

## FMP layer

`fmpFetch()` in `lib/fmp/client.ts` is the only place that touches the network for market data. FMP
returns **HTTP 200 on failures**, so the client sniffs the body and throws prefixed errors that
callers match on:

- `FMP_PREMIUM:` — endpoint/ticker needs a paid plan. `fetchQuote` catches this and returns a
  `{ unavailable: true }` placeholder quote instead of null, so the UI can show "no data" rather than
  disappearing the row.
- `FMP_RATE_LIMIT:` — daily/minute quota hit.

Other conventions:
- FMP's `changesPercentage` is normalized to `changePercentage` in `quotes.ts`. Use the singular form.
- Quotes are fetched one ticker at a time (batch quote is a premium endpoint) — a scan is O(holdings)
  requests before any Claude call. Be mindful on the 250 req/day free tier.
- `getFundamentals()` is the only correct way to read fundamentals: it checks the 24h SQLite cache,
  refuses to serve empty/legacy-shaped blobs, refetches, and upserts. Never call the `financials.ts`
  fetchers straight from a page.
- `ensurePriceHistory()` only fetches the gaps around what's already cached (backfill + forward fill).
- Sector ETF for a holding comes from `getSectorEtf(sector, industry)` in `config/sector-etf-map.ts`,
  falling back to `SPY`.

---

## API surface

| Route | Purpose |
|-------|---------|
| `GET/POST /api/holdings` | list / add a ticker (auto-populates profile, sector ETF, beta from FMP) |
| `PATCH/DELETE /api/holdings/[ticker]` | edit thesis/shares/costBasis, remove holding |
| `POST /api/holdings/csv` | bulk import `ticker[,shares][,cost_basis]` |
| `POST /api/scan` | start the background scan — 202 on start, 409 + current state if one is running |
| `GET /api/scan` | SSE progress stream; emits `idle` when nothing is running |
| `POST /api/scan/step` | re-run one step (`news`/`bucket`/`thesis`/`catalysts`) and patch the latest row |
| `POST /api/refresh` | full re-analysis of a single ticker, SSE progress |
| `POST /api/prompt-test` | Prompt Lab: `mode: 'preview' \| 'run'` against a real holding |
| `GET/POST /api/prompt-source` | read/write the prompt template literals on disk |

All of these set `export const dynamic = 'force-dynamic'`.

⚠️ **`/api/prompt-source` writes to `src/lib/claude/prompts/*.ts` at runtime.** If prompt files show
unexpected diffs, someone edited them through the Prompt Lab UI — treat those as real source changes
to review and commit, not as corruption.

---

## Frontend conventions

**Tailwind config and `globals.css` are critical — never modify these files.**
Content paths must stay `['./src/**/*.{js,ts,jsx,tsx,mdx}']`.

**Never construct Tailwind class names dynamically** (e.g. `` `text-${color}` ``). Always write full
class strings as literals so the JIT scanner can find them. Lookup tables like `{ width: 'w-28' }`
are fine — the string literals are still visible to the scanner.

**Stale cache fix:** the `dev` script runs `rm -rf .next && next dev` to clear the Next.js webpack
cache before every start, preventing stale production-build CSS from being served instead of a fresh
Tailwind compilation. Do not remove the `rm -rf .next` prefix.

Other UI rules:
- Dark theme only — `bg-gray-950` base, `bg-gray-900` panels, `border-gray-800`. There is no light mode;
  a few older settings-page inputs still carry light-theme classes and look wrong.
- **Bucket colors live in `lib/config/constants.ts`** (`BUCKET_COLORS`, `BUCKET_LABELS`) and in
  `tailwind.config.ts`. Import them; don't re-hardcode indigo/blue/amber/emerald per component.
  1 = Market Beta (indigo), 2 = Sector/Factor Rotation (blue), 3 = Sentiment/Positioning (amber),
  4 = Fundamental Change (emerald).
- Minimum readable font size is 12px (`text-xs`/`text-[13px]`). Numbers render in `font-mono`.
- Grids are `react-grid-layout`; layouts and panel collapse state persist to localStorage under
  versioned `pm:` keys (`pm:columns-v4`, `pm:col-order-v4`, `pm:company-layout-v8`,
  `pm:panel-collapse:*`, `pm:dash-collapse:*`). **When you change a default layout or column set,
  bump the key version** — otherwise existing users keep stale saved state and won't see the change.
  All reads/writes are wrapped in try/catch.
- Scan progress is shared between the command strip and the dashboard through `ScanContext`, not props.
- Server components do the data prep and math; client components (`'use client'`) handle interaction
  and charts. `CompanyGrid.tsx` (~1600 lines) and `HoldingsList.tsx` (~1100 lines) are the big ones.
- After mutating a holding from a client component, call `router.refresh()` — pages are
  `force-dynamic`, so that re-pulls fresh server data.

---

## Known gotchas

1. **`thesisAnalysis` is stored as a JSON string but `deserializeScan()` leaves it a string** (unlike
   the sibling JSON fields). Any new consumer must `JSON.parse` it itself — see `extractThesisSummary()`
   in the dashboard for the existing workaround.
2. **`CACHE_NEWS_HOURS` / `CACHE_CATALYSTS_HOURS` are defined but unused.** Only fundamentals consults
   `isCacheStale()`. Every scan re-runs all Claude steps, so scan cost scales linearly with holdings.
   Delta scans are still unimplemented.
3. **Tailwind styling occasionally drops out on load in dev** — hard refresh (`Cmd+Shift+R`). The
   server-side cache is already handled by the `dev` script.
4. **Limited FMP coverage** on some tickers (GLXY, NBIS, Q) and premium-only endpoints
   (`/key-metrics?period=quarter` → the code uses `/ratios-ttm` instead). Handle `unavailable` blobs.
5. **Regime check has a non-AI fallback**: if Claude fails, regime is classified from SPY's daily
   change alone and still written to the DB with a rationale saying so.
6. `SankeyChart` normalization can misbehave on very small or negative revenue values.

---

## Repo docs

- `README.md` — user-facing setup and feature overview.
- `CHANGELOG.md` — the richest history of *why* things are the way they are, but its sprint table is
  stale: it lists sprints 5–7 as "not started" while sprints 5 and 6 are committed (background scan
  singleton, per-step refresh, anomaly display, centralized bucket colors, typography pass). Trust
  `git log` over the table.
- `portfolio-monitor-product-spec.md`, `portfolio-monitor-technical-plan.md` — original design intent.

If you make a substantial change, update `CHANGELOG.md` in the same commit — it's the handoff document
between sessions.
