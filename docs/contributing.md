# Contributing

Portfolio Monitor is a personal-scale tool that happens to be open source.
Contributions are welcome, particularly in the areas listed at the bottom.

---

## Getting set up

```bash
git clone https://github.com/kyledavidoff1-stack/portfolio-monitor.git
cd portfolio-monitor
npm install
npm run db:push        # create ./data/portfolio.db from the schema
npm run seed:demo      # optional: realistic demo data, no API keys needed
npm run dev
```

`npm run seed:demo` is the fastest way to see the whole app working. It writes a
five-holding demo portfolio with price history, financials, scan results, and
anomaly flags, so every panel renders without an FMP or Claude key. The numbers
are invented — it is a fixture, not research.

To work against real data, copy `.env.local.example` to `.env.local` and add your
keys. Read [architecture.md](./architecture.md) first; it explains the data flow,
the panel system, and the caching rules.

---

## Checks before opening a PR

```bash
npm test           # step-selection tests
npx tsc --noEmit   # typecheck
npm run build      # production build
```

There is no automated end-to-end suite yet. If you touch the UI, run the app
against seeded data and check both pages actually render — several past bugs
were invisible to the typechecker (a panel whose height chain collapsed, a
column that parsed as JSON in one place and prose in another).

## House style

Match the surrounding code. A few conventions that are easy to violate
accidentally:

- **Never build Tailwind class names dynamically.** The JIT scanner reads source
  text, so `` `text-${color}` `` compiles to nothing. Write complete literals, or
  put whole class strings in a lookup table.
- **Never edit `tailwind.config.ts` or `globals.css`** without a specific reason;
  they are load-bearing and the content globs must stay as they are.
- **Bump the `localStorage` version suffix** when you change a default layout or
  column set, or returning users will keep their stale saved state.
- **Parse scan rows through `deserializeScan()`**, never `JSON.parse` at the call
  site.
- **Comments explain constraints, not narration.** Say why a guard exists, not
  what the next line does.

## Commit messages

Explain the behavior change and why, not just the files touched. If you fixed a
bug, say what was broken and what caused it — that context is what makes the log
useful a year later.

---

## Where help is most useful

- **Sector ETF mappings** (`src/lib/config/sector-etf-map.ts`) — industry-level
  sub-sector ETFs beyond the eleven GICS sectors.
- **Prompt quality** (`src/lib/claude/prompts/`) — more reliable structured
  output, better plain-language summaries. `/settings/prompt-test` runs a single
  prompt against a real holding for fast iteration.
- **Ticker coverage** — graceful handling for symbols FMP covers poorly (ADRs,
  recent listings, non-US lines).
- **Tests** — the delta scan logic has coverage; almost nothing else does.

## Things to discuss before building

Open an issue first for changes to the database schema, the four-bucket
taxonomy, or anything that adds a hosted/cloud dependency. Local-first is a
design constraint, not an implementation detail.
