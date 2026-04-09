# Portfolio Monitor — Portfolio Intelligence Platform

A personal portfolio intelligence platform that answers two questions for every stock you hold:
1. **Why is this moving right now?** (categorized into four driver buckets)
2. **What should I be watching over the next 90 days?**

Powered by Claude AI + Financial Modeling Prep. Local-first. Open source.

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

---

## Setup

### Requirements
- Node.js 18+
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
FMP_API_KEY=your_fmp_api_key_here       # https://financialmodelingprep.com/developer
CLAUDE_API_KEY=your_claude_api_key_here  # https://console.anthropic.com
```

**FMP API:** Free tier (250 req/day) works for development. For active use, the $14/month Starter plan (300 req/min) removes rate limits.

**Claude API:** Typical cost is $10–30/month with caching for a portfolio of 8–12 stocks. See the technical plan for full cost breakdown.

### 3. Initialize the database

```bash
npm run db:generate
npm run db:migrate
```

This creates a local SQLite database at `./data/portfolio.db`. No cloud dependency. Your data never leaves your machine.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

See [docs/architecture.md](docs/architecture.md) for details.

---

## Build Roadmap

| Sprint | Status | Goal |
|--------|--------|------|
| Sprint 0 | ✅ Done | Project scaffolding |
| Sprint 1 | Pending | Holdings management + FMP integration |
| Sprint 2 | Pending | Fundamental data layer |
| Sprint 3 | Pending | Sector-relative analysis |
| Sprint 4 | Pending | Claude AI pipeline |
| Sprint 5 | Pending | Thesis tracking |
| Sprint 6 | Pending | Portfolio dashboard |
| Sprint 7 | Pending | Caching, history, polish |
| Sprint 8 | Pending | Documentation + open source prep |

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15, App Router, TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Database | SQLite (better-sqlite3) |
| ORM | Drizzle |
| AI | Anthropic Claude API (Sonnet) |
| Financial data | Financial Modeling Prep |

---

## Contributing

Contributions welcome. See [docs/contributing.md](docs/contributing.md) (coming in Sprint 8).

Key areas for community contribution:
- Sector ETF mappings (add more industry-level sub-sector ETFs)
- Prompt improvements (better structured outputs)
- Brokerage connectors (V2: Plaid integration planned)

---

## License

MIT (TBD — to be finalized in Sprint 8)

---

*Built with Claude Code. Companion spec: portfolio-monitor-product-spec.md*
