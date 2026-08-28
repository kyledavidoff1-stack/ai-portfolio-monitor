# Portfolio Monitor — Portfolio Intelligence Platform

## Product Specification v0.1

**Date:** March 28, 2026
**Status:** Draft, actively iterating
**Target:** Open source project, local-first architecture
**Build tool:** Claude Code

---

## 1. What This Is

Portfolio Monitor is a personal portfolio intelligence platform that answers two questions for every stock you hold:

1. **Why is this moving right now?** (categorized into four driver buckets)
2. **What should I be watching over the next 90 days?**

It combines deep company-level intelligence with portfolio-level analytics, powered by AI synthesis. Think of it as a mini Bloomberg terminal for individual investors, built on Claude API + structured financial data APIs, designed to make portfolio monitoring digestible without requiring a $24k/year terminal.

The long-term vision is an open source tool anyone can run locally with their own API keys.

---

## 2. The Four-Bucket Framework

Every signal that moves a stock gets categorized into one of four buckets. This is the core analytical lens of the entire platform.

### Bucket 1: Market Beta
The stock is moving because the market is moving. No company-specific driver. High correlation to SPY on the day. This is the default state for most stocks on most days.

**Data inputs:** Daily correlation to SPY, current beta, index futures direction, VIX level.

### Bucket 2: Sector / Factor Rotation
The stock is moving because its sector or factor cohort is moving. Peers are behaving similarly. Driven by macro news that impacts the sector (tariffs on semis, oil price spike for energy, rate expectations for growth vs. value).

**Data inputs:** Sector ETF performance (XLK, XLE, XLF, etc.), peer group price action, sector-specific news headlines, factor rotation signals (growth vs. value, long duration vs. short duration).

### Bucket 3: Sentiment / Positioning / Virality
The stock is moving on narrative momentum, retail flow, analyst opinion shifts, or positioning dynamics. No fundamental change to the business, but the market's perception or positioning has shifted. This bucket covers a wide range of non-fundamental, stock-specific drivers: from viral social media narratives and analyst rating changes to mechanical moves like index rebalances, short squeezes, gamma exposure effects, and large block trades. The AI rationale always specifies which sub-type is driving the move, since "retail sentiment turned bearish" and "quarterly index rebalancing created selling pressure" are both Bucket 3 but warrant different responses. Bucket 3 moves can be transient or can sustain for weeks or months. Sentiment has driven some of the largest stock moves in recent years and should never be dismissed as noise.

**Data inputs:** Social media mention velocity (Twitter/X, Reddit/WSB, fintwit), analyst upgrades/downgrades, unusual options activity, short interest changes, meme stock indicators, influencer/podcast mentions, index rebalance calendars, options expiration dates, known large positioning events.

### Bucket 4: Fundamental Change
Something actually changed about the business. Earnings, guidance, product launch, partnership, executive change, regulatory development, contract win/loss, margin shift. Over long time horizons, this bucket tends to be the dominant driver of stock performance, but all four buckets can create or destroy significant value.

**Data inputs:** Earnings reports, SEC filings, press releases, management commentary, insider transactions, patent filings, product announcements, regulatory actions.

### Bucket Assignment Logic
The AI layer reviews all available signals and assigns a **primary bucket** to each stock based on what is most explanatory of recent price action. Secondary buckets can also be flagged. The assignment should include a one-line rationale (e.g., "Primary: Bucket 2 — semiconductor sector down 3% on new China export controls, TSM moving in lockstep with peers").

---

## 3. Architecture: Two-Layer Structure

### Layer 1: Company Intelligence Profile (per ticker)

A deep, comprehensive, standalone page for each company. This layer has standalone value even for someone tracking a single stock. It is the foundation of the platform.

#### 3.1 Company Fundamentals & Financial Metrics

This section follows the progressive disclosure principle. The surface view is a plain-language snapshot. The deep dive is available on expansion.

**Surface view — "The 5 Numbers That Matter" (always visible):**

Each metric presented as a number + plain-language context + trend arrow (improving/stable/deteriorating):

1. **Revenue & growth:** TTM revenue + YoY growth rate. One-line context on what's driving growth or deceleration.
2. **Profitability:** Operating margin with trend direction. One line: "margins expanding because of X" or "margins compressing due to Y."
3. **Cash generation:** Free cash flow (positive or negative) and trend. One line: "generating $X per quarter in cash" or "burning $X/quarter, Y months runway."
4. **Valuation:** Forward P/E relative to growth (PEG concept expressed simply). One line: "trading at a premium/discount to its growth rate" or "expensive relative to peers."
5. **Financial health:** One composite signal. "Strong balance sheet, $X net cash" or "leveraged, $X net debt, manageable/concerning."

The AI layer generates these five lines per company. They should read like a smart friend summarizing the stock over coffee, not like a financial terminal printout.

**Deep dive — full metrics (expandable):**

All of the below is available when the user wants to go deeper. Organized into sub-sections:

*Core financials:*
- Revenue (TTM and quarterly trend)
- Revenue growth (YoY and QoQ)
- Gross margin, operating margin, net margin (with trend direction: expanding, stable, contracting)
- Free cash flow and FCF margin
- EPS (reported and forward estimates)
- Forward P/E, PEG ratio
- Debt/equity ratio, net debt, cash position
- ROIC, ROE

*Profitability:*
- Gross profit, operating profit (EBIT), net income (absolute and per share)
- Profit margins by segment where available
- Earnings quality (gap between GAAP and non-GAAP, one-time items, stock-based compensation as % of revenue)
- Operating leverage (revenue growth vs. operating income growth)

*Cash flows:*
- Operating cash flow (TTM and quarterly trend)
- Free cash flow (OCF minus CapEx) and FCF yield
- Cash flow from investing (CapEx, acquisitions, asset sales)
- Cash flow from financing (buybacks, debt issuance/repayment, dividends)
- Cash conversion ratio (FCF / net income) — flags earnings quality issues when this diverges
- Runway / burn rate for pre-profitability companies

*Revenue segmentation:*
- By business unit / product line (e.g., AWS vs. retail vs. advertising for Amazon)
- By geography (critical for tariff exposure, FX risk, geopolitical sensitivity)
- Revenue concentration (top customer dependency where available)

*Growth metrics:*
- Revenue growth trajectory (accelerating, stable, decelerating)
- Margin expansion or contraction by segment
- R&D spend as % of revenue with trend
- CapEx trajectory and capital allocation priorities

**Data source:** Structured financial API (Financial Modeling Prep or Alpha Vantage) for hard numbers. Claude web search for qualitative context and forward-looking estimates.

#### 3.2 Sector-Relative Analysis

Each stock's sector and industry classification is pulled automatically from the financial data API (e.g., Financial Modeling Prep returns sector and industry fields in the company profile endpoint). The 11 GICS sectors map to SPDR sector ETFs via a simple lookup (Technology → XLK, Energy → XLE, Financials → XLF, Healthcare → XLV, Consumer Discretionary → XLY, Consumer Staples → XLP, Industrials → XLI, Materials → XLB, Real Estate → XLRE, Utilities → XLU, Communication Services → XLC). For more precise industry-level comparison, sub-sector ETFs can also be mapped (e.g., Semiconductors → SOXX, Biotech → XBI). This requires no manual maintenance; sector classification comes from the API, ETF mapping is a static 11-row lookup plus optional industry-level overrides.

**Sector-relative valuation:**
Key multiples (forward P/E, EV/EBITDA, P/S, FCF yield) shown alongside the sector median and the stock's percentile rank within its peer group. Example display: "AMZN trades at 32x forward earnings vs. consumer discretionary median of 18x (78th percentile)." Trend indicator showing whether the premium/discount to sector is expanding or compressing over 3, 6, and 12 months. Premium compression is a signal: either the market is souring on the name relative to peers, or the sector is re-rating while the stock stays flat. Both are worth flagging.

**Sector-relative price correlation:**
Rolling correlation coefficient between the stock and its sector ETF (30-day and 90-day). High correlation means the stock is behaving like a sector bet (supports Bucket 2 assignment in the four-bucket framework). Low or declining correlation means the stock is decoupling on its own merits (points toward Bucket 3 or 4). Trend in correlation over time is as informative as the current level.

**Relative performance charts:**
Normalized overlay of the stock vs. its sector ETF vs. SPY, indexed to 100 at a user-selected start date. This surfaces hidden underperformance or outperformance. Example: if NVDA is up 25% over 6 months but SOXX is up 30%, the stock is actually lagging its sector despite going up in absolute terms. This is invisible without the relative view.

**Data source:** Sector classification from financial data API company profile (automated, no manual input). ETF price data and valuation multiples from the same API. Sector-to-ETF mapping is a static 11-row table for GICS sectors, with optional industry-level sub-sector ETF mappings. Manual override available for edge cases (e.g., GLXY could map to crypto index or financials depending on user preference).

#### 3.3 Business Intelligence

**Product pipeline:**
- Current product lineup and how each is performing
- Announced upcoming products, features, or services
- R&D direction and patent activity where relevant
- Competitive positioning of key products

**Workforce and operations:**
- Where employees are based (geographic footprint)
- Recent hiring or layoff signals
- Key executive roster and any recent changes
- Glassdoor/employee sentiment trends if available

**Competitive landscape:**
- Key competitors and their relative positioning
- Market share data where available
- Competitive moat assessment (network effects, switching costs, scale, IP, regulatory)

**Data source:** Claude web search and synthesis.

#### 3.4 Sentiment Layer

Each source tracked separately so divergence between retail and institutional sentiment is visible.

**Twitter/X:** Mention velocity, tone (bullish/bearish/neutral), key influencer takes, trending narratives.

**Reddit:** WallStreetBets activity, sector-specific subreddit discussion, sentiment polarity.

**Mainstream financial media:** Major outlet coverage (WSJ, Bloomberg, CNBC, FT), tone of recent coverage, key narratives being pushed.

**Analyst consensus:** Recent upgrades/downgrades, price target changes, consensus estimate revisions, buy/hold/sell distribution shifts.

**Data source (V1):** Claude web search across all sources. Direct API integrations (Twitter/X API, Reddit API) deferred to V2+ due to cost and rate limits.

#### 3.5 Four-Bucket Driver Analysis

The synthesis layer. Given all the data above, what is actually moving this stock right now?

- Primary bucket assignment with rationale
- Secondary bucket if applicable
- Confidence level (high/medium/low)
- Key supporting evidence

#### 3.6 Thesis Tracking

**User-defined investment thesis field.** The user writes their original rationale for holding the position (e.g., "Long AMZN because AWS is the dominant cloud platform with expanding margins, advertising business is high-margin and underpenetrated, and logistics moat is widening").

**Thesis confirmation/challenge alerts.** The AI layer compares incoming signals against the stated thesis and flags when new information either supports or contradicts it. Example output: "Your thesis centers on AWS margin expansion, but three analyst reports this week flagged margin compression from AI infrastructure CapEx. Thesis under pressure."

This is a V1 feature.

#### 3.7 Event Calendar with Impact Context

Not a raw calendar. Every event includes an impact hypothesis.

**Event types:**
- Earnings dates with consensus expectations, implied move from options market, and key variables to watch
- Ex-dividend dates
- Index rebalance dates (S&P, Russell, MSCI)
- Lockup expirations
- SEC filing deadlines
- Sector conferences and investor days
- CEO/executive media appearances (podcasts, CNBC, conference keynotes) with key takeaway summaries after the fact
- Product launch dates
- Regulatory decision dates
- Macro events that specifically impact this stock (Fed meetings for rate-sensitive names, trade policy deadlines for names with China exposure, etc.)

**Time horizons:**
- Near-term: next 30 days
- Mid-term: 30 to 90 days
- Long-term: 90+ days (known scheduled events)

**Data source:** Hybrid. Structured API for earnings dates and ex-dividend dates. Claude web search for everything else.

### Layer 2: Portfolio Dashboard (aggregate view)

This layer aggregates across all holdings and provides portfolio-level intelligence.

#### 3.8 Regime Indicator

A top-of-dashboard signal showing the current market environment:

- **Risk-on:** Broad market up, VIX low/declining, credit spreads tight, growth outperforming
- **Risk-off:** Broad market down, VIX spiking, flight to safety, defensives outperforming
- **Sector rotation:** Market roughly flat but leadership rotating between sectors
- **Dislocation:** Unusual cross-asset behavior, correlation breakdown, liquidity stress

The regime tag sets context for interpreting everything below it. A stock down 3% in a risk-off session is completely different from the same drop on a green day.

#### 3.9 Anomaly Detection

For each stock, compare its daily behavior against the regime and sector. Flag divergences.

**Example flags:**
- "NVDA down 2.4% while XLK up 0.8% and SPY up 1.1% — decoupled from market and sector. Investigate."
- "GLXY up 6% on a flat market day with no crypto sector catalyst — check for company-specific news."

When a divergence is detected, the AI layer immediately searches for the driver and surfaces it with a bucket tag. This is the "should I be paying attention right now?" feature.

#### 3.10 Correlation Heatmap

Visual matrix showing how each holding correlates with every other holding and with SPY.

**Purpose:** Surface hidden concentration risk. If NVDA, TSM, and AMZN are all 0.85+ correlated, you're not diversified, you're triple-leveraged on the same trade.

**Data:** Rolling 30-day and 90-day correlation coefficients.

#### 3.11 Portfolio Beta

**Per-position beta:** Each stock displays its beta to SPY (pulled directly from the financial data API; no custom calculation needed). This tells you how much each holding amplifies or dampens market moves. A beta of 1.6 means the stock moves roughly 60% more than the S&P on any given day.

**Weighted portfolio beta:** The weighted average of all position betas, where each weight is the position's share of total portfolio value. This is a single number that tells you your overall market sensitivity. Example: if your portfolio beta is 1.35, a 2% market drop means you should expect roughly a 2.7% portfolio decline. Anything significantly beyond that signals something idiosyncratic is happening (feeds into anomaly detection).

**Display:** Per-position beta shown on each stock card in the portfolio view. Weighted portfolio beta displayed prominently at the top of the dashboard alongside the regime indicator. Both are context-setters for interpreting everything else.

**Data:** Beta from financial data API (typically calculated on 1-year daily returns or 5-year monthly returns). Portfolio weights derived from position sizing (requires share count and current price, available via CSV upload or manual entry in V1, Plaid in V2).

#### 3.12 Portfolio-Level Bucket Distribution

Aggregate view showing how much of the portfolio (by number of positions, not dollar-weighted) is currently being driven by each bucket.

Two views available:

By position count: "6 of 10 positions primarily driven by Bucket 1 (market beta) today. Your portfolio is riding the index, not making idiosyncratic bets."

By dollar value: "78% of your portfolio value is in Bucket 1 positions today, because your three largest holdings (NVDA, AMZN, TSM) are all moving with the market."

The dollar-weighted view is often more insightful because it reflects actual capital exposure. Both views are shown.

#### 3.13 Cross-Portfolio Catalyst Calendar

A single timeline view across all holdings. All upcoming events from every company's individual calendar, merged into one view. Filterable by time horizon, event type, and expected impact magnitude.

---

## 4. Data Architecture

### 4.1 Data Sources (V1)

**Structured financial APIs (for hard numbers):**
- Financial Modeling Prep or Alpha Vantage for fundamentals, price data, financial statements
- These provide: revenue, margins, EPS, P/E, beta, price history, earnings dates, ex-dividend dates

**Claude API with web search (for everything qualitative):**
- Company news, product announcements, executive appearances
- Social sentiment (Twitter/X, Reddit, mainstream media)
- Analyst commentary and rating changes
- Competitive landscape updates
- Sector and macro context
- Thesis confirmation/challenge analysis
- Bucket assignment and rationale

### 4.2 Data Freshness & Refresh Model

**Morning deep scan (scheduled or manual trigger):**
Full scan of all holdings across all four buckets. This is the comprehensive daily briefing. Expected runtime: 2 to 5 minutes for a portfolio of 8 to 12 stocks.

**Intraday delta checks (on-demand, multiple times per day):**
Lightweight refresh that only re-scans when something meaningful changed:
- Price moved beyond a threshold (e.g., +/- 2% intraday)
- New headline detected for a holding
- Regime shifted since last scan
- A flagged catalyst event occurred

Results from the morning scan are cached. Delta checks layer on top without re-running the full analysis. This keeps API costs manageable and response times fast.

### 4.3 Historical Tracking

All scan results are stored with timestamps. Users can look back and see what was driving any stock on any previous date. This creates a decision journal over time, especially powerful when paired with thesis tracking.

**Storage:** Local SQLite database.

### 4.4 Caching Strategy

- Financial fundamentals: refresh daily (these don't change intraday)
- Price and correlation data: refresh on each dashboard load
- News and sentiment: cache for 2 to 4 hours, refresh on manual trigger or anomaly detection
- Bucket assignments: recalculated on each refresh based on latest data

---

## 5. User Experience

### 5.1 Holdings Input (V1)

**Primary method:** Manual ticker input. User enters their tickers. Simple, no auth complexity.

**Secondary method:** CSV upload from brokerage export. User exports holdings from E*TRADE, Schwab, etc. and uploads the file. Parser extracts tickers and share counts.

### 5.2 Holdings Input (V2)

**Brokerage API integration.** Modular plugin architecture so each brokerage is a separate connector:
- E*TRADE / Morgan Stanley (OAuth)
- Schwab (OAuth)
- Interactive Brokers (TWS API or Client Portal API)
- Robinhood (unofficial, community-contributed)
- Alpaca (REST API, easiest to implement first)

Designed as plugins so the open source community can contribute new connectors.

### 5.3 Dashboard Layout

**Top bar:** Regime indicator (risk-on / risk-off / rotation / dislocation) with one-line rationale.

**Portfolio view (default landing page):**
- Anomaly flags (stocks behaving unexpectedly given the regime) — this is the first thing you see
- Cross-portfolio catalyst calendar (next 7 and 30 days)
- Correlation heatmap
- Bucket distribution summary
- Holdings list with each stock's primary bucket tag, one-line driver summary, and any active alerts

**Company detail view (click into any ticker):**
- Full company intelligence profile (sections 3.1 through 3.7)
- Organized into tabs or collapsible sections: Fundamentals, Business Intel, Sentiment, Driver Analysis, Thesis, Events
- Historical scan timeline

### 5.4 Charts & Comparative Visualization

**Per-company charts (V1):**
Each company profile includes trend charts for core financial metrics: revenue, gross/operating/net margins, FCF, EPS, and cash position over time. These give immediate visual context for whether the business is improving or deteriorating.

**Cross-portfolio comparative charts (V2):**
A dedicated charting view where the user selects 2+ holdings and a metric to compare. Examples:
- Revenue growth rates: AMZN vs. NVDA vs. TSM on the same axis
- Margin profiles: overlay gross and operating margins across holdings to see who's expanding vs. contracting
- FCF yield comparison: bar chart or scatter plot across the portfolio
- P/E vs. earnings growth (PEG visualization): scatter plot showing which holdings are expensive relative to their growth
- Price performance: normalized to 100 at a user-selected start date so stocks at different price levels are visually comparable
- Beta comparison: visualize which holdings add the most systematic risk

**Charting library:** Recharts (React-native, clean, well-documented) or D3 for more complex custom visualizations.

### 5.5 Chat / Recommendations Interface (V3)

A conversational interface where the user can ask questions about their portfolio and positions.

**V3 features (deferred):**
- Natural language Q&A ("Why is TSM underperforming this week?")
- Strategy recommendations based on stated goals and risk preferences
- Multi-agent debate: bull and bear agents argue both sides of a position, presenting competing theses with supporting evidence
- The user provides their investment goals and strategy preferences upfront, and recommendations are calibrated accordingly

This is explicitly a V3 feature. V1 and V2 focus entirely on the monitoring, intelligence, and categorization layers.

---

## 6. Technical Stack (Recommended)

**Frontend:** React (Next.js) — gives both the UI layer and a lightweight API route layer for Claude calls and caching. Clean component architecture matters for open source adoption.

**AI layer:** Claude API (Sonnet for per-stock analysis, Opus for complex synthesis tasks) with web search tool enabled.

**Financial data:** Financial Modeling Prep API (or Alpha Vantage) for structured fundamentals and price data.

**Database:** SQLite (local-first, no cloud dependency, portable).

**Package manager:** npm

### 6.1 Cost Model & AI Engine Options

The AI analysis layer is the primary cost driver. Three options, structured by phase:

**V1 — Local / Claude Code (zero marginal cost):**
The analysis engine runs via Claude Code or a local script that triggers analysis through the user's existing Claude subscription or a minimal API setup. The dashboard is a UI layer that reads results from a local SQLite database. The user hits "refresh," Claude Code runs the scan, writes results to the DB, and the dashboard displays them. Cost to the user: covered by their existing Claude Pro/Team subscription, or a few dollars/month on pay-as-you-go API if they prefer programmatic access. Cost to you: zero.

**V2+ — BYOK (bring your own key):**
For the hosted version and for open source users who want full automation, users plug in their own Claude API key. The dashboard makes API calls directly using their key. Users pay Anthropic directly for their usage. This is the model used by Cursor, Cline, and most AI-powered dev tools. Typical cost for an active user (10 stocks, full morning scan + 2 to 3 delta checks/day): estimated $1 to $3/day or $30 to $90/month depending on depth of analysis.

**Hosted SaaS (eventual) — dual pricing:**
If/when a hosted version launches, offer two tiers:
- BYOK tier: users bring their own Claude API key, pay a lower monthly platform fee ($10 to $15/month) that covers hosting and financial data APIs. They pay Anthropic separately for AI usage.
- Bundled tier: users pay a higher monthly fee ($40 to $50/month) that includes AI usage. You mark up the API costs and bundle everything into one price. Simpler for the user, better unit economics at scale.

**Auth:** In V1, no auth needed (local-first). In the hosted version, standard email/password or OAuth. Users provide their own Claude API key and financial data API key in settings.

---

## 7. Phased Roadmap

### V1 — Core Intelligence Layer
- Manual ticker input (text field + CSV upload)
- Company intelligence profile for each holding (fundamentals, business intel, sentiment, products, geographic exposure)
- Four-bucket driver analysis with rationale
- Thesis tracking (user-defined thesis + AI confirmation/challenge)
- Event calendar with impact context (near/mid/long-term)
- Regime indicator
- Anomaly detection (stock vs. regime divergence flags)
- Correlation heatmap
- Portfolio-level bucket distribution
- Cross-portfolio catalyst calendar
- Morning deep scan + intraday delta check caching
- Historical scan storage (SQLite)
- Hybrid data: structured API for financials, Claude web search for qualitative
- Per-company charts for key financial metrics (revenue, margins, FCF, EPS) showing trends over time

### V2 — Live Data & Persistence
- Brokerage account aggregation via Plaid (connects to 12,000+ institutions with one integration; handles OAuth, supports E*TRADE, Schwab, Fidelity, IBKR, Robinhood, and others out of the box). Plaid's Investments product returns holdings, securities, and account balances. Pay-as-you-go pricing, no minimum commitment. This replaces the original plan to build individual brokerage API connectors.
- Enhanced historical tracking with trend visualization
- Thesis tracking over time (show how your thesis evolved alongside stock performance)
- Direct Reddit API integration for richer sentiment data
- Watchlist (track stocks you're considering but don't yet hold, same analysis, tagged differently)
- User preferences and settings persistence
- Improved caching with smart invalidation
- Comparative charting: side-by-side and overlay charts to compare key metrics across holdings (e.g., revenue growth for AMZN vs. NVDA vs. TSM, margin profiles across the portfolio, FCF yield comparison, P/E vs. growth scatter plot). User selects which holdings and which metrics to compare. Charts should support normalized views (indexed to 100) for comparing stocks at different scales.

### V3 — Agent Layer
- Chat interface for natural language portfolio Q&A
- Strategy recommendations calibrated to user-stated goals and risk preferences
- Multi-agent debate (bull vs. bear agents arguing each position)
- Automated alert system (push notifications when anomalies detected or thesis challenged)
- Portfolio optimization suggestions
- Tax awareness layer (tax-loss harvesting flags, wash sale prevention across accounts, cost basis tracking). Not a core differentiator for Portfolio Monitor but expected by the target audience based on competitive landscape research.
- Mobile-optimized view: focused, minimal interface built around the features that see the most usage on desktop. Not a native app; responsive web targeting the most valuable mobile workflows.

---

## 8. Distribution Model: Open Source + Hosted Hybrid

### Open Source Core
- **Local-first:** All data stored locally. No cloud dependency. No user portfolio data leaves their machine (except API calls to Claude and financial data providers).
- **BYOK (bring your own keys):** Users provide their own Claude API key and financial data API key. No central billing or accounts.
- **Modular brokerage connectors:** Plugin architecture so community members can contribute connectors for additional brokerages.
- **Clear onboarding:** First-run experience that walks the user through API key setup, initial ticker input, and first scan.
- **MIT or Apache 2.0 license** (TBD).
- **Clean documentation:** README with setup instructions, architecture overview, and contribution guide.

### Hosted Version (Eventual)
- Same product, zero setup. Users sign up, enter tickers, and go.
- Two pricing tiers: BYOK (lower platform fee, user pays their own AI costs) and Bundled (higher fee, all-inclusive).
- Monetization covers hosting, financial data API costs, and margin on bundled AI usage.
- The open source community improves the product, the hosted version monetizes non-technical users.
- Precedent: Supabase, GitLab, PostHog all operate this model successfully.

---

## 9. Known Holdings (Kyle's Portfolio)

Based on prior conversations, confirmed tickers include:

- AMZN (Amazon)
- NVDA (Nvidia)
- TSM (Taiwan Semiconductor)
- GLXY (Galaxy Digital) — previously flagged for potential sale and redeployment into AMZN
- PLTR (Palantir)
- TSLA (Tesla)
- NBIS (Nebius)
- Q (Qnity Electronics)
- AGNCM (AGNC Investment preferred) — previously flagged for sale and redeployment into NVDA/TSM

**Note:** This list is not confirmed as complete. Kyle has not yet uploaded a full E*TRADE CSV export. The dashboard should be built to accept any number of tickers.

---

## 10. Competitive Landscape

### Target User
Portfolio Monitor is built for long-term investors who hold positions for months or years and trade a few times per quarter. They manage their own money across one or more brokerage accounts and want to understand their portfolio deeply without staring at charts all day. This is the majority of individual investors. The competitor is not TradingView (optimized for day traders and technical analysis). The competitor is the holistic portfolio overview tool.

### Direct Competitors

**Mezzi** ($199 to $499/year)
Consolidates accounts via Plaid, strong on tax optimization, fee reduction, and wash sale prevention. Offers AI chat for portfolio questions. Weakness: focused on cost savings, not on understanding what's driving stocks or what's coming next. No driver analysis, no thesis tracking, no forward-looking catalyst view.

**PortfolioPilot** ($20 to $99/month)
Cross-platform AI advisor for self-directed investors. Connects to 12,000+ institutions. Scenario modeling, Monte Carlo simulations, tax-loss harvesting, retirement planning. SEC-registered investment advisor. Weakness: oriented toward allocation optimization and risk scoring, not company-level intelligence. Tells you "your portfolio is overweight tech" but doesn't tell you why NVDA is down today or what's coming in the next 90 days.

**Ziggma** (free to $7.49/month)
Best-in-class quantitative portfolio tracker for long-term investors. Proprietary 0 to 100 stock scoring system based on fundamentals. Portfolio simulator, dividend tracker, smart alerts, consolidated multi-account view. Weakness: purely quantitative. No qualitative synthesis, no news intelligence, no sentiment layer, no "what's on the horizon" view.

**Kubera** ($150 to $250/year)
Tracks diverse asset types including crypto, real estate, alternatives, and traditional holdings. Good at showing what you own and what it's worth across everything. Weakness: it's a tracker, not an intelligence platform. No analysis layer.

**Empower / Personal Capital** (free)
Solid net worth tracking, basic portfolio analysis, fee analyzer. Weakness: basic analytics, pushes toward their advisory services, doesn't go deep on individual companies.

**Portfolio Genius** ($20/month)
AI portfolio analyzer with brokerage integration for Fidelity, Schwab, Vanguard, Robinhood. AI-driven reviews and trade suggestions. Weakness: more robo-advisor wrapper than research tool.

### Where Portfolio Monitor Differentiates

Every competitor answers "what do I own and how is it performing?" None of them answers "why is each stock moving, what's driving it, what's coming in the next 90 days, and does this confirm or challenge my investment thesis?"

The existing tools are trackers (Kubera, Empower), optimizers (PortfolioPilot, Mezzi), or quantitative scorers (Ziggma). None are intelligence platforms that synthesize qualitative and quantitative signals into a digestible narrative.

Portfolio Monitor's differentiation:

1. **Four-bucket driver analysis.** No competitor categorizes what's moving a stock into market beta, sector rotation, sentiment, or fundamental change. This framework is unique.

2. **Thesis tracking with AI challenge/confirmation.** No competitor lets you state your investment thesis and then proactively flags when new information supports or contradicts it.

3. **Forward-looking catalyst calendar with impact context.** Competitors show earnings dates. Portfolio Monitor shows earnings dates plus what consensus expects, what the implied move is, and what variables to watch.

4. **Qualitative + quantitative synthesis.** Competitors show numbers. Portfolio Monitor tells you what the numbers mean in plain language, what the news is saying, what Twitter and Reddit are saying, and what it all adds up to.

5. **Regime-aware anomaly detection.** No competitor flags "this stock is down while the market is up — investigate." That proactive alerting is genuinely new.

6. **Simple-first design philosophy.** Most competitors either overwhelm with data (Ziggma, PortfolioPilot) or are too shallow (Empower, Kubera). Portfolio Monitor leads with insight and progressively discloses depth.

### Competitive Pricing Context
Mezzi: $199 to $499/year. PortfolioPilot: $240 to $1,200/year. Ziggma: $90/year. Kubera: $150 to $250/year. Portfolio Genius: $240/year. Portfolio Monitor's BYOK model means near-zero per-user cost, enabling a generous free tier or significantly lower pricing than any competitor. This is a real adoption advantage, especially for the open source distribution channel.

---

## 11. Key Design Principles

### Core Philosophy
The goal is to replace the 10 tabs an investor opens every morning (brokerage for prices, Google News for headlines, Twitter for sentiment, Seeking Alpha for analysis, earnings calendar, sector performance) with a single dashboard that synthesizes everything. Inspired by World Monitor's approach to global intelligence, but applied to portfolio intelligence.

The density challenge: too minimal and the dashboard feels empty, the user doesn't see immediate value. Too dense and it feels like a Bloomberg terminal, which is exactly what we're trying to avoid. The right answer is a **smart default density** — the landing page should feel substantive and immediately valuable, showing enough that a user thinks "this is useful" within 5 seconds, while keeping deeper analysis one click or one toggle away.

### Principles

1. **Show value immediately.** When a user first loads their portfolio, they should see something useful within seconds, not a blank page waiting for configuration. The default view should be dense enough to feel substantive: each stock shows its bucket tag, a one-line driver summary, price change, beta, and any active anomaly flags. This is denser than a simple list but far less overwhelming than a full analytical dashboard. The user's first reaction should be "oh, this is useful" not "oh, this is a lot."

2. **Togglable information layers.** Inspired by World Monitor's layer system. The company detail page defaults to the "5 Numbers That Matter" and bucket assignment. Additional layers can be toggled on or off: sentiment layer, sector-relative analysis, full financials, catalyst calendar, thesis tracker. Each layer adds a section to the page without cluttering the default view. The user chooses their depth. Some users will toggle everything on and leave it. Others will keep it minimal. Both are valid.

3. **Insight over data.** "Amazon's advertising business grew 24% last quarter and is now their highest-margin segment" is more useful than a row in a spreadsheet showing $14.3B ad revenue and 42% margin. The AI synthesis layer should translate numbers into plain-language, qualitative takeaways. Quantitative depth is available when you want it, but the default mode is storytelling with data, not data with occasional commentary.

4. **Every position gets equal-depth analysis; portfolio views are dollar-weighted.** The four-bucket analysis, thesis tracking, sentiment scan, and catalyst calendar run at full depth for every holding regardless of position size. However, portfolio-level views (portfolio beta, bucket distribution, concentration analysis) are dollar-weighted based on the market value of each position. A user should be able to see both "what percentage of my positions by count are driven by Bucket 1" and "what percentage of my portfolio by dollar value is driven by Bucket 1." The per-stock intelligence is equal; the portfolio-level aggregation reflects actual capital exposure.

5. **Answer "why" before "what."** Don't just show that a stock is down 3%. Tell me why, categorize it, and tell me if I should care given my thesis.

6. **Surface anomalies, don't bury them.** The most valuable output is when the system flags something unexpected. Anomaly detection and thesis challenges should be the most prominent elements on the dashboard. These are the reason the user opened the app.

7. **Time-range filtering.** The user should be able to toggle between "what's driving my portfolio today" and "what happened this week" and "what's changed since my last scan." This applies to both the portfolio dashboard and individual company views. Historical context makes the current state more meaningful.

8. **Zero-friction entry.** No account creation required to try the product. Enter tickers, hit scan, get analysis. Account creation only becomes relevant when the user wants to persist data across sessions. Inspired by World Monitor's "no login required" approach. The fastest path to value wins.

9. **Cache aggressively, refresh intelligently.** Respect API costs and latency. Don't re-scan what hasn't changed. But when something does change, catch it fast.

10. **Desktop-first, mobile-aware.** Design for a full browser window as the primary experience. Ensure nothing breaks on mobile, but don't optimize for mobile until we know which features get the most use. Then build a focused mobile view around just those features. The target user checks a few times a day from a desk, not from their phone.

### Future Tier Structure (Hosted Version)
Inspired by World Monitor's Pro positioning: "The free dashboard shows you the world. Pro tells you what it means." For Portfolio Monitor's eventual hosted version, the equivalent: free tier gives you the data, basic metrics, and portfolio overview. Paid tier gives you the AI-powered bucket analysis, thesis tracking, forward catalyst calendar, and deep company intelligence. Free shows what you own. Paid tells you what's happening and what to watch for.

---

## 12. Open Questions (To Resolve in Future Iterations)

- Exact financial data API selection (Financial Modeling Prep vs. Alpha Vantage vs. other)
- UI/UX design language and component library
- Specific threshold for anomaly detection (what % divergence from regime triggers a flag?)
- How to handle pre-market and after-hours price action
- Crypto holdings (GLXY is crypto-adjacent; does the system need native crypto token tracking?)
- International holdings or ADRs with different data availability
- Community contribution model and governance for open source
- License selection (MIT vs. Apache 2.0)
- Plaid pricing optimization for the hosted version (negotiate volume discounts at scale)

### Resolved Decisions
- **Mobile:** Desktop-first. Mobile-aware but not mobile-optimized until V3. Target user checks from a desk, not a phone.
- **Brokerage integration:** V1 uses manual ticker entry + CSV upload. V2 adds Plaid for automated account sync. Individual brokerage API connectors are not needed; Plaid covers 12,000+ institutions.
- **AI cost model:** V1 runs via Claude Code or user's existing Claude subscription (zero marginal cost). V2+ uses BYOK. Hosted version offers BYOK and bundled tiers.
- **Tax optimization:** Not a V1 or V2 priority. Flagged for V3 as a competitive expectation, not a core differentiator.
- **Target user:** Long-term holders who trade a few times per quarter. Not day traders. Not TradingView's audience.
- **Competitor positioning:** Intelligence platform, not a tracker, optimizer, or scorer. The gap is qualitative + quantitative synthesis with forward-looking catalyst awareness.

---

*This spec is a living document. Kyle and Claude will continue iterating on features, priorities, and design decisions before and during the build.*
