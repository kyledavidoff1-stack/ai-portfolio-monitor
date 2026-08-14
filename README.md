# Portfolio Monitor — Portfolio Intelligence Platform

A personal portfolio intelligence platform that answers two questions for every stock you hold:
1. **Why is this moving right now?** (categorized into four driver buckets)
2. **What should I be watching over the next 90 days?**

Powered by Claude AI + Financial Modeling Prep. Local-first. Open source.

![Portfolio dashboard](docs/images/dashboard.png)

---

## What It Does

Portfolio Monitor combines deep company-level intelligence with portfolio-level analytics:

- **Four-Bucket Driver Analysis** — every signal gets classified as Market Beta, Sector Rotation, Sentiment/Positioning, or Fundamental Change
- **AI Intelligence Reports** — plain-language summaries of what's happening and why, not just raw numbers
- **Thesis Tracking** — write your investment rationale, get AI alerts when new data confirms or challenges it
- **Forward Catalyst Calendar** — upcoming earnings, events, and macro catalysts with impact context
- **Regime Indicator** — risk-on / risk-off / rotation / dislocation at the top of every session
- **Anomaly Detection** — flags when a stock diverges from the market regime (the thing you actually want to know)
- **Correlation Heatmap** — surface hidden concentration risk across your portfolio
- **Scan History** — browse how the analysis of a holding changed over time

Company detail view — driver analysis, thesis tracking, sentiment, peers, catalysts, and a revenue flow diagram:

![Company detail](docs/images/company.png)

---

## Try It Without API Keys

The fastest way to see the whole thing working:

```bash
npm install
npm run db:push      # create the local database
npm run seed:demo    # load a realistic demo portfolio
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Every panel renders with a
five-holding demo portfolio — scan results, theses, catalysts, correlations, and
financials — with no FMP or Claude key required.

> **`seed:demo` replaces the contents of your database.** If you already track a
> real portfolio, point it at a separate file instead so your holdings and theses
> are untouched:
>
> ```bash
> DATABASE_URL=./data/demo.db npm run db:push
> DATABASE_URL=./data/demo.db npm run seed:demo
> DATABASE_URL=./data/demo.db npm run dev
> ```

The demo numbers are invented — including headlines and analyst actions attributed
to real publications and firms. It's a fixture for exploring the interface, not
investment research, and not something to share as though it were real.

### The example portfolio

The seeded holdings live in **[`examples/holdings.csv`](examples/holdings.csv)** —
readable right here on GitHub, and the source of truth for what `seed:demo` loads.
Edit it and re-seed to change the demo portfolio, or point the seeder at your own
export:

```bash
HOLDINGS_CSV=./my-holdings.csv npm run seed:demo
```

Tickers beyond the five shipped examples get price history generated for them;
they simply have no pre-baked financials or AI scan results, which the app renders
as empty states.

---

## Setup

### Requirements
- Node.js 22+ (the test runner uses native TypeScript support)
- npm

### 1. Clone and install

```bash
git clone https://github.com/kyledavidoff1-stack/portfolio-monitor.git
cd portfolio-monitor
npm install
```

### 2. Configure API keys

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your keys:

```bash
FMP_API_KEY=your_fmp_api_key_here        # https://financialmodelingprep.com/developer
CLAUDE_API_KEY=your_claude_api_key_here  # https://console.anthropic.com
```

**FMP API:** the free tier (250 requests/day) covers development. The $14/month
Starter plan removes the rate limits that otherwise show up as missing panels.

**Claude API:** roughly $10–30/month for a portfolio of 8–12 stocks with delta
scans enabled. A full scan of 10 stocks costs about $0.50; subsequent same-day
scans cost a fraction of that because only expired steps re-run.

**Running without a paid FMP plan.** The app degrades rather than breaking: when
live quotes are unavailable it falls back to the most recent cached daily closes
and labels them as end-of-day, and panels with no data show explicit empty states.
You can add holdings, write theses, and run AI scans on a free key.

### 3. Initialize the database

```bash
npm run db:generate
npm run db:migrate
```

This creates a local SQLite database at `./data/portfolio.db`. No cloud
dependency. Your data never leaves your machine.

### 4. Run

```bash
npm run dev
```

---

## Scanning

The dashboard has two scan buttons:

- **Run Scan** — a delta scan. Re-runs only the analysis steps whose cached data
  has expired (news after 4h, catalysts after 12h, fundamentals after 24h), plus
  anything invalidated by a price spike or an edited thesis. Bucket assignment
  and anomaly detection always re-run. This is what you want day to day.
- **Full** — forces every step for every holding, ignoring cache.

Individual panels on the company page have their own refresh buttons for
re-running a single step. Scans run server-side and survive navigating away or
reloading the page.

---

## Backing up your holdings

Your portfolio lives only in `data/portfolio.db` on your machine — it is
gitignored and never leaves your computer. To keep a portable copy, use
**Export CSV** in the Holdings panel (or `GET /api/holdings/csv`).

The export includes shares, cost basis, sector data, and your thesis text, and
restores through **Add ticker › Upload CSV**. Restoring works without an FMP key,
since values in the file are used directly and FMP is only consulted to fill gaps.

The importer also accepts plain broker exports and bare ticker lists — a header
row is matched by column name when present, otherwise `ticker,shares,cost_basis`
is assumed.

---

## Architecture

```
Portfolio Monitor
├── Next.js App Router (frontend + API routes)
├── SQLite via Drizzle ORM (local data store)
├── Financial Modeling Prep API (structured financial data)
└── Claude API with web search (AI analysis pipeline)
```

**The analysis pipeline (per stock):**
1. News & Sentiment Scan (Claude + web search)
2. Fundamental Interpretation (Claude + FMP data)
3. Sector-Relative Context (FMP sector/ETF data)
4. Bucket Assignment (primary driver classification)
5. Thesis Check (confirmation or challenge)
6. Catalyst Scan (forward event calendar)

Portfolio-level:
7. Regime Check
8. Anomaly Detection

See [docs/architecture.md](docs/architecture.md) for the data model, the panel
system, the caching rules, and how to add a panel or a pipeline step.

---

## Development

```bash
npm run dev         # clears .next cache, then starts on :3000
npm run build       # production build
npm test            # delta scan step-selection tests
npm run seed:demo   # reload demo data
```

If the server can't bind to :3000, kill the old process first:
`kill $(lsof -ti:3000)`

---

## Build Roadmap

| Sprint | Status | Goal |
|--------|--------|------|
| Sprint 0 | ✅ Done | Project scaffolding |
| Sprint 1 | ✅ Done | Holdings management + FMP integration |
| Sprint 2 | ✅ Done | Fundamental data layer |
| Sprint 3 | ✅ Done | Sector-relative analysis + correlation |
| Sprint 4 | ✅ Done | Claude AI pipeline (all 8 steps) + thesis tracking |
| Sprint 5 | ✅ Done | Background scans, per-step TTL caching, delta scans, scan history |
| Sprint 6 | 🔶 Partial | Bucket colors, empty states, typography, no-FMP degradation done; responsive + performance passes open |
| Sprint 7 | ✅ Done | Documentation, license, demo mode |

See `CHANGELOG.md` for detail on what's built and what's still open.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15, App Router, TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts + D3 (Sankey) |
| Database | SQLite (better-sqlite3) |
| ORM | Drizzle |
| AI | Anthropic Claude API |
| Financial data | Financial Modeling Prep |

---

## Contributing

Contributions welcome — see [docs/contributing.md](docs/contributing.md).

Key areas for community contribution:
- Sector ETF mappings (add more industry-level sub-sector ETFs)
- Prompt improvements (better structured outputs)
- Ticker coverage for symbols FMP handles poorly
- Brokerage connectors (V2: Plaid integration planned)

---

## Disclaimer

Portfolio Monitor is a research and monitoring tool, not investment advice. AI
output can be wrong or out of date, and market data may be delayed or incomplete.
Verify anything you plan to act on.

---

## License

[MIT](LICENSE)

---

*Built with Claude Code. Companion spec: portfolio-monitor-product-spec.md*
