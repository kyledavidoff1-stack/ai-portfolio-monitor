/**
 * Seed a demo portfolio so the app renders fully populated with NO API keys.
 *
 *   npm run seed:demo
 *
 * Writes five holdings with theses, ~130 days of synthetic (but internally
 * consistent) price history, quarterly financials, AI scan results, a regime
 * snapshot, and anomaly flags. Everything is generated from a fixed seed, so
 * repeated runs produce identical data.
 *
 * This REPLACES the contents of the six tables in ./data/portfolio.db. It is a
 * demo/preview fixture — point DATABASE_URL at a scratch file if your real
 * portfolio lives in the default location.
 *
 * The numbers are invented. Do not read them as investment research.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_URL ?? path.join(__dirname, '..', 'data', 'portfolio.db');
if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}.\nRun "npm run db:push" (or db:generate && db:migrate) first.`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Anchor everything to the most recent weekday so the demo always looks current.
const anchor = new Date();
while (anchor.getUTCDay() === 0 || anchor.getUTCDay() === 6) anchor.setUTCDate(anchor.getUTCDate() - 1);
const LAST_TRADING_DAY = anchor.toISOString().slice(0, 10);
const NOW = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // ~90 min ago

// ── Holdings ──────────────────────────────────────────────────────────────────
// Read from a CSV so the demo portfolio is human-readable and editable in the
// repo (examples/holdings.csv) rather than buried in this script. Point
// HOLDINGS_CSV at your own export to seed a different portfolio.

/** Minimal RFC 4180 reader — thesis text contains commas and em dashes. */
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = []; field = '';
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const HOLDINGS_CSV = process.env.HOLDINGS_CSV
  ?? path.join(__dirname, '..', 'examples', 'holdings.csv');

if (!fs.existsSync(HOLDINGS_CSV)) {
  console.error(`No holdings CSV at ${HOLDINGS_CSV}`);
  process.exit(1);
}

const csvRows = readCsv(HOLDINGS_CSV);
const header = csvRows[0].map((h) => h.trim().toLowerCase());
const col = (r, name) => {
  const i = header.indexOf(name);
  const v = i >= 0 ? r[i]?.trim() : '';
  return v === '' ? null : v;
};
const numOr = (v) => (v == null ? null : Number(v));

const HOLDINGS = csvRows.slice(1).map((r) => ({
  ticker: (col(r, 'ticker') ?? '').toUpperCase(),
  companyName: col(r, 'company_name'),
  shares: numOr(col(r, 'shares')),
  costBasis: numOr(col(r, 'cost_basis')),
  sector: col(r, 'sector'),
  industry: col(r, 'industry'),
  sectorEtf: col(r, 'sector_etf'),
  beta: numOr(col(r, 'beta')),
  thesis: col(r, 'thesis'),
})).filter((h) => h.ticker);

if (HOLDINGS.length === 0) {
  console.error(`No holdings parsed from ${HOLDINGS_CSV}`);
  process.exit(1);
}

db.prepare('DELETE FROM holdings').run();
const addedAt = new Date(Date.now() - 120 * 86400_000).toISOString();
const insHolding = db.prepare(`INSERT INTO holdings
  (ticker, company_name, shares, cost_basis, sector, industry, sector_etf, beta, thesis, added_at, updated_at)
  VALUES (@ticker, @companyName, @shares, @costBasis, @sector, @industry, @sectorEtf, @beta, @thesis, @addedAt, @addedAt)`);
for (const h of HOLDINGS) insHolding.run({ ...h, addedAt });

// ── Price history (synthetic random walks, correlated to SPY) ────────────────
// ~130 trading days ending Fri 2026-08-07
function tradingDays(endStr, n) {
  const days = [];
  const d = new Date(endStr + 'T00:00:00Z');
  while (days.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse();
}
const DAYS = tradingDays(LAST_TRADING_DAY, 130);

// Deterministic PRNG
let seed = 42;
function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { return (rand() + rand() + rand() + rand() - 2) / 1.2; }

// SPY market returns
const mktRet = DAYS.map(() => 0.0004 + 0.008 * gauss());

// Benchmarks and sector ETFs are fixed; holdings come from the CSV.
// [ticker, endPrice, beta, idioVol, drift]
const BENCHMARK_SERIES = [
  ['SPY',  652.4, 1.00, 0.000, 0.0000],
  ['SOXX', 248.9, 1.55, 0.010, 0.0006],
  ['XLK',  268.3, 1.20, 0.006, 0.0004],
  ['XLY',  224.1, 1.05, 0.007, 0.0001],
  ['XLE',   96.7, 0.55, 0.009, 0.0000],
  ['XLV',  138.2, 0.50, 0.007, -0.0002],
];

// Closing prices for the shipped example holdings. A ticker added to the CSV
// without an entry here still gets a price series, just an arbitrary level.
const KNOWN_PRICES = { NVDA: 186.3, MSFT: 512.8, AMZN: 228.6, XOM: 114.2, UNH: 271.5 };
const IDIO_VOL = { NVDA: 0.018, MSFT: 0.008, AMZN: 0.012, XOM: 0.010, UNH: 0.014 };
const DRIFT = { NVDA: 0.0009, MSFT: 0.0004, AMZN: 0.0002, XOM: 0.0001, UNH: -0.0006 };

const holdingSeries = HOLDINGS.map((h) => [
  h.ticker,
  KNOWN_PRICES[h.ticker] ?? 100,
  h.beta ?? 1.0,
  IDIO_VOL[h.ticker] ?? 0.012,
  DRIFT[h.ticker] ?? 0.0002,
]);

// Sector ETFs referenced by the CSV but missing from the benchmark list still
// need a series, or the sector-relative panel has nothing to plot against.
const benchmarkTickers = new Set(BENCHMARK_SERIES.map((s) => s[0]));
const extraEtfs = [...new Set(HOLDINGS.map((h) => h.sectorEtf).filter(Boolean))]
  .filter((etf) => !benchmarkTickers.has(etf))
  .map((etf) => [etf, 150, 1.0, 0.007, 0.0002]);

const SERIES = [...BENCHMARK_SERIES, ...holdingSeries, ...extraEtfs];

db.prepare('DELETE FROM price_history').run();
const insPrice = db.prepare('INSERT OR IGNORE INTO price_history (ticker, date, close, volume) VALUES (?, ?, ?, ?)');
const seedTx = db.transaction(() => {
  for (const [tkr, endPrice, beta, idio, drift] of SERIES) {
    const rets = mktRet.map((m) => drift + beta * m + idio * gauss());
    // build backwards from endPrice
    const closes = new Array(DAYS.length);
    closes[DAYS.length - 1] = endPrice;
    for (let i = DAYS.length - 2; i >= 0; i--) closes[i] = closes[i + 1] / (1 + rets[i + 1]);
    for (let i = 0; i < DAYS.length; i++) {
      insPrice.run(tkr, DAYS[i], +closes[i].toFixed(2), Math.round(3e7 + 2e7 * rand()));
    }
  }
});
seedTx();

// ── Fundamentals blobs ────────────────────────────────────────────────────────
// 9 quarters ending 2026-06-30, oldest last (FMP order: most recent first)
function recentQuarterEnds(n) {
  // Most recent completed quarter-end, walking backwards.
  const d = new Date(LAST_TRADING_DAY + 'T00:00:00Z');
  let y = d.getUTCFullYear();
  let q = Math.floor(d.getUTCMonth() / 3); // 0-3; previous quarter index
  if (q === 0) { y -= 1; q = 4; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const endMonth = q * 3;                       // 3,6,9,12
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    out.push(`${y}-${String(endMonth).padStart(2, '0')}-${lastDay}`);
    q -= 1;
    if (q === 0) { q = 4; y -= 1; }
  }
  return out;
}
const QDATES = recentQuarterEnds(9);
function qPeriod(dateStr) { const m = +dateStr.split('-')[1]; return 'Q' + Math.ceil(m / 3); }

function buildQuarters({ revTTM, qGrowth, gm, om, nm, fcfM, eps, cash, debt, assets, equity, pe }) {
  // revenue per quarter walking backwards at qGrowth per quarter
  let q0 = revTTM / (1 + 1/(1+qGrowth) + 1/Math.pow(1+qGrowth,2) + 1/Math.pow(1+qGrowth,3));
  const income = [], cashFlow = [], balanceSheet = [], keyMetrics = [];
  for (let i = 0; i < 9; i++) {
    const rev = q0 / Math.pow(1 + qGrowth, i);
    const wiggle = 1 + 0.02 * gauss();
    const gp = rev * gm * wiggle, oi = rev * om * wiggle, ni = rev * nm * wiggle;
    income.push({
      date: QDATES[i], period: qPeriod(QDATES[i]),
      revenue: Math.round(rev), grossProfit: Math.round(gp), grossProfitRatio: +(gp/rev).toFixed(4),
      operatingIncome: Math.round(oi), operatingIncomeRatio: +(oi/rev).toFixed(4),
      netIncome: Math.round(ni), epsDiluted: +(eps / Math.pow(1 + qGrowth, i)).toFixed(2),
    });
    const ocf = rev * (fcfM + 0.04), capex = -rev * 0.04;
    cashFlow.push({
      date: QDATES[i], period: qPeriod(QDATES[i]),
      operatingCashFlow: Math.round(ocf), capitalExpenditure: Math.round(capex),
      freeCashFlow: Math.round(ocf + capex), dividendsPaid: Math.round(-rev * 0.01), commonStockRepurchased: Math.round(-rev * 0.05),
    });
    if (i < 8) balanceSheet.push({
      date: QDATES[i], period: qPeriod(QDATES[i]),
      cashAndCashEquivalents: Math.round(cash), shortTermInvestments: Math.round(cash * 0.6),
      totalAssets: Math.round(assets), totalLiabilities: Math.round(assets - equity),
      totalStockholdersEquity: Math.round(equity), totalDebt: Math.round(debt), netDebt: Math.round(debt - cash),
    });
    keyMetrics.push({ date: QDATES[i], period: qPeriod(QDATES[i]), peRatio: +(pe * (1 + 0.03*gauss())).toFixed(1), pegRatio: null, priceToFreeCashFlowsRatio: +(pe * 1.1).toFixed(1) });
  }
  return { income, cashFlow, balanceSheet, keyMetrics };
}

const FY_YEAR = Number(QDATES[0].slice(0, 4));

function annualize(income, cashFlow) {
  // two synthetic fiscal years from quarterly data
  const years = [
    [`${FY_YEAR}-01-31`, income.slice(0, 4), cashFlow.slice(0, 4)],
    [`${FY_YEAR - 1}-01-31`, income.slice(4, 8), cashFlow.slice(4, 8)],
  ];
  const annualIncome = years.map(([date, qs]) => ({
    date, period: 'FY',
    revenue: qs.reduce((s,q)=>s+q.revenue,0), grossProfit: qs.reduce((s,q)=>s+q.grossProfit,0),
    grossProfitRatio: +(qs.reduce((s,q)=>s+q.grossProfit,0)/qs.reduce((s,q)=>s+q.revenue,0)).toFixed(4),
    operatingIncome: qs.reduce((s,q)=>s+q.operatingIncome,0),
    operatingIncomeRatio: +(qs.reduce((s,q)=>s+q.operatingIncome,0)/qs.reduce((s,q)=>s+q.revenue,0)).toFixed(4),
    netIncome: qs.reduce((s,q)=>s+q.netIncome,0), epsDiluted: +qs.reduce((s,q)=>s+(q.epsDiluted||0),0).toFixed(2),
  }));
  const annualCashFlow = years.map(([date,, cfs]) => ({
    date, period: 'FY',
    operatingCashFlow: cfs.reduce((s,q)=>s+q.operatingCashFlow,0), capitalExpenditure: cfs.reduce((s,q)=>s+q.capitalExpenditure,0),
    freeCashFlow: cfs.reduce((s,q)=>s+q.freeCashFlow,0), dividendsPaid: cfs.reduce((s,q)=>s+(q.dividendsPaid||0),0), commonStockRepurchased: cfs.reduce((s,q)=>s+(q.commonStockRepurchased||0),0),
  }));
  return { annualIncome, annualCashFlow };
}

function futureQuarterEnds(n) {
  const out = [];
  let [y, m] = QDATES[0].split('-').map(Number);
  for (let i = 0; i < n; i++) {
    m += 3;
    if (m > 12) { m -= 12; y += 1; }
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push(`${y}-${String(m).padStart(2, '0')}-${lastDay}`);
  }
  return out;
}

// netMargin comes from the company's own spec. A flat 25% here used to make
// estimated net income wildly inconsistent with the historical rows — Amazon's
// FY27E printed as +212% against a FY26 actual struck at a ~9% margin.
function estimates(sym, ttmRev, ttmEps, g, netMargin) {
  const ann = [1, 2, 3].map((offset) => `${FY_YEAR + offset}-01-31`).map((date, i) => ({
    symbol: sym, date,
    epsAvg: +(ttmEps * Math.pow(1+g, i+1)).toFixed(2), revenueAvg: Math.round(ttmRev * Math.pow(1+g, i+1)),
    netIncomeAvg: Math.round(ttmRev * Math.pow(1+g, i+1) * netMargin), ebitAvg: null, ebitdaAvg: null,
  }));
  const q = futureQuarterEnds(4).map((date, i) => ({
    symbol: sym, date,
    epsAvg: +((ttmEps/4) * Math.pow(1+g/4, i+1)).toFixed(2), revenueAvg: Math.round((ttmRev/4) * Math.pow(1+g/4, i+1)),
    netIncomeAvg: Math.round((ttmRev/4) * Math.pow(1+g/4, i+1) * netMargin), ebitAvg: null, ebitdaAvg: null,
  }));
  return { ann, q };
}

const B = 1e9;
const FUND_SPECS = {
  NVDA: { fin: { revTTM: 208*B, qGrowth: 0.11, gm: 0.745, om: 0.62, nm: 0.53, fcfM: 0.42, eps: 1.42, cash: 42*B, debt: 10*B, assets: 145*B, equity: 92*B, pe: 46 },
    peers: ['AMD','AVGO','INTC','QCOM'],
    peerRows: [
      { ticker: 'NVDA', revGrowthYoY: 0.54, opMargin: 0.62, fcfMargin: 0.42, peRatio: 46.2, forwardPeRatio: 33.1, isSelf: true },
      { ticker: 'AVGO', revGrowthYoY: 0.21, opMargin: 0.44, fcfMargin: 0.39, peRatio: 38.5, forwardPeRatio: 29.4, isSelf: false },
      { ticker: 'AMD',  revGrowthYoY: 0.18, opMargin: 0.11, fcfMargin: 0.10, peRatio: 41.0, forwardPeRatio: 26.7, isSelf: false },
      { ticker: 'QCOM', revGrowthYoY: 0.09, opMargin: 0.26, fcfMargin: 0.28, peRatio: 16.8, forwardPeRatio: 13.9, isSelf: false },
    ],
    segments: [
      { name: 'Data Center', value: 162*B, yoyGrowth: 0.68 },
      { name: 'Gaming', value: 12.8*B, yoyGrowth: 0.09 },
      { name: 'Professional Visualization', value: 2.2*B, yoyGrowth: 0.14 },
      { name: 'Automotive', value: 2.6*B, yoyGrowth: 0.31 },
    ], g: 0.32 },
  MSFT: { fin: { revTTM: 298*B, qGrowth: 0.035, gm: 0.69, om: 0.45, nm: 0.36, fcfM: 0.28, eps: 3.55, cash: 80*B, debt: 45*B, assets: 560*B, equity: 300*B, pe: 35 },
    peers: ['AAPL','GOOGL','ORCL','CRM'],
    peerRows: [
      { ticker: 'MSFT',  revGrowthYoY: 0.15, opMargin: 0.45, fcfMargin: 0.28, peRatio: 35.4, forwardPeRatio: 29.8, isSelf: true },
      { ticker: 'AAPL',  revGrowthYoY: 0.06, opMargin: 0.31, fcfMargin: 0.26, peRatio: 33.0, forwardPeRatio: 28.9, isSelf: false },
      { ticker: 'GOOGL', revGrowthYoY: 0.13, opMargin: 0.32, fcfMargin: 0.21, peRatio: 24.1, forwardPeRatio: 21.2, isSelf: false },
      { ticker: 'ORCL',  revGrowthYoY: 0.11, opMargin: 0.30, fcfMargin: 0.18, peRatio: 40.7, forwardPeRatio: 30.5, isSelf: false },
    ],
    segments: [
      { name: 'Intelligent Cloud', value: 125*B, yoyGrowth: 0.21 },
      { name: 'Productivity & Business', value: 92*B, yoyGrowth: 0.12 },
      { name: 'More Personal Computing', value: 81*B, yoyGrowth: 0.08 },
    ], g: 0.14 },
  AMZN: { fin: { revTTM: 705*B, qGrowth: 0.028, gm: 0.49, om: 0.115, nm: 0.09, fcfM: 0.075, eps: 1.55, cash: 90*B, debt: 60*B, assets: 640*B, equity: 260*B, pe: 36 },
    peers: ['WMT','GOOGL','BABA','SHOP'],
    peerRows: [
      { ticker: 'AMZN', revGrowthYoY: 0.11, opMargin: 0.115, fcfMargin: 0.075, peRatio: 36.4, forwardPeRatio: 27.3, isSelf: true },
      { ticker: 'WMT',  revGrowthYoY: 0.05, opMargin: 0.043, fcfMargin: 0.021, peRatio: 39.2, forwardPeRatio: 33.5, isSelf: false },
      { ticker: 'GOOGL',revGrowthYoY: 0.13, opMargin: 0.32,  fcfMargin: 0.21,  peRatio: 24.1, forwardPeRatio: 21.2, isSelf: false },
      { ticker: 'SHOP', revGrowthYoY: 0.24, opMargin: 0.13,  fcfMargin: 0.16,  peRatio: 88.0, forwardPeRatio: 62.4, isSelf: false },
    ],
    segments: [
      { name: 'North America', value: 405*B, yoyGrowth: 0.09 },
      { name: 'AWS', value: 122*B, yoyGrowth: 0.19 },
      { name: 'International', value: 148*B, yoyGrowth: 0.08 },
      { name: 'Advertising', value: 62*B, yoyGrowth: 0.22 },
    ], g: 0.12 },
  XOM: { fin: { revTTM: 340*B, qGrowth: 0.005, gm: 0.24, om: 0.135, nm: 0.10, fcfM: 0.085, eps: 1.95, cash: 28*B, debt: 42*B, assets: 460*B, equity: 270*B, pe: 14 },
    peers: ['CVX','COP','SHEL','BP'],
    peerRows: [
      { ticker: 'XOM',  revGrowthYoY: 0.02, opMargin: 0.135, fcfMargin: 0.085, peRatio: 14.3, forwardPeRatio: 13.1, isSelf: true },
      { ticker: 'CVX',  revGrowthYoY: 0.01, opMargin: 0.11,  fcfMargin: 0.07,  peRatio: 15.0, forwardPeRatio: 13.8, isSelf: false },
      { ticker: 'COP',  revGrowthYoY: -0.02,opMargin: 0.22,  fcfMargin: 0.14,  peRatio: 12.1, forwardPeRatio: 11.6, isSelf: false },
      { ticker: 'SHEL', revGrowthYoY: 0.00, opMargin: 0.10,  fcfMargin: 0.09,  peRatio: 9.4,  forwardPeRatio: 8.8,  isSelf: false },
    ],
    segments: [
      { name: 'Upstream', value: 172*B, yoyGrowth: 0.04 },
      { name: 'Energy Products', value: 118*B, yoyGrowth: -0.03 },
      { name: 'Chemical Products', value: 32*B, yoyGrowth: 0.01 },
      { name: 'Specialty Products', value: 18*B, yoyGrowth: 0.02 },
    ], g: 0.03 },
  UNH: { fin: { revTTM: 425*B, qGrowth: 0.018, gm: 0.22, om: 0.072, nm: 0.05, fcfM: 0.055, eps: 5.9, cash: 32*B, debt: 78*B, assets: 300*B, equity: 98*B, pe: 12 },
    peers: ['ELV','CI','HUM','CVS'],
    peerRows: [
      { ticker: 'UNH', revGrowthYoY: 0.075, opMargin: 0.072, fcfMargin: 0.055, peRatio: 11.8, forwardPeRatio: 10.6, isSelf: true },
      { ticker: 'ELV', revGrowthYoY: 0.06,  opMargin: 0.052, fcfMargin: 0.04,  peRatio: 10.9, forwardPeRatio: 9.8,  isSelf: false },
      { ticker: 'CI',  revGrowthYoY: 0.08,  opMargin: 0.045, fcfMargin: 0.035, peRatio: 12.4, forwardPeRatio: 10.9, isSelf: false },
      { ticker: 'CVS', revGrowthYoY: 0.04,  opMargin: 0.035, fcfMargin: 0.03,  peRatio: 11.2, forwardPeRatio: 9.4,  isSelf: false },
    ],
    segments: [
      { name: 'UnitedHealthcare', value: 310*B, yoyGrowth: 0.06 },
      { name: 'Optum Health', value: 108*B, yoyGrowth: 0.09 },
      { name: 'Optum Rx', value: 135*B, yoyGrowth: 0.11 },
      { name: 'Optum Insight', value: 19*B, yoyGrowth: 0.03 },
    ], g: 0.09 },
};

db.prepare('DELETE FROM fundamentals').run();
const insFund = db.prepare('INSERT INTO fundamentals (ticker, data, fetched_at) VALUES (?, ?, ?)');
// Financial fixtures exist only for the shipped example tickers; a CSV holding
// without one simply has no cached fundamentals, which the app renders as an
// empty state rather than an error.
const seededTickers = new Set(HOLDINGS.map((h) => h.ticker));
for (const [sym, spec] of Object.entries(FUND_SPECS)) {
  if (!seededTickers.has(sym)) continue;
  const { income, cashFlow, balanceSheet, keyMetrics } = buildQuarters(spec.fin);
  const { annualIncome, annualCashFlow } = annualize(income, cashFlow);
  const est = estimates(sym, spec.fin.revTTM, spec.fin.eps * 4, spec.g, spec.fin.nm);
  const blob = {
    income, cashFlow, balanceSheet, keyMetrics,
    peers: spec.peers, peerRows: spec.peerRows, segments: spec.segments,
    annualIncome, annualCashFlow, analystEstimates: est.ann, quarterlyEstimates: est.q,
    unavailable: false, cachedAt: NOW,
  };
  insFund.run(sym, JSON.stringify(blob), NOW);
}

// ── Analysis scans (the AI intelligence layer) ────────────────────────────────
const SCANS = {
  NVDA: {
    bucketPrimary: 4, bucketSecondary: 3, bucketConfidence: 'high',
    bucketRationale: 'Move is fundamental: hyperscaler capex guides raised again and Blackwell Ultra shipments pulled forward. Sentiment tailwind is secondary.',
    thesisStatus: 'confirmed',
    news: {
      overall_tone: 'bullish',
      today_summary: 'Shares firm after two hyperscalers raised FY27 capex guidance, with sell-side notes highlighting accelerating GB300 orders and easing supply constraints at CoWoS.',
      institutional_today: 'Three price-target raises this week; positioning surveys show large-cap growth funds back to overweight after the June trim.',
      social_today: 'Retail chatter elevated but not euphoric — mentions running ~1.4x 90-day average, mostly earnings-preview threads.',
      key_headlines: [
        { headline: 'Hyperscaler capex guides point to another leg of AI infrastructure spend', source: 'Bloomberg', date: '2026-08-07' },
        { headline: 'NVIDIA GB300 lead times shorten as CoWoS capacity ramps', source: 'DigiTimes', date: '2026-08-06' },
        { headline: 'Sovereign AI deals add $12B to visible 2027 pipeline', source: 'Reuters', date: '2026-08-04' },
      ],
      analyst_ratings: [
        { firm: 'Morgan Stanley', action: 'Reiterate Overweight', priceTarget: '$180 → $210' },
        { firm: 'UBS', action: 'Upgrade', priceTarget: '$195' },
      ],
      context_30_60: 'Stock chopped sideways through June on export-control noise, then broke out in mid-July as Q2 supply-chain checks came back strong. Narrative has rotated from "peak capex" fear to duration-of-cycle debate.',
      score: 0.62, twitterScore: 0.55, redditScore: 0.48, mediaScore: 0.66, analystScore: 0.78,
    },
    thesis: {
      status: 'confirmed',
      past: { summary: 'Thesis strengthened over the last 60 days: capex guides, CoWoS ramp, and sovereign deals all extend the demand runway.', evidence: ['Two hyperscalers raised FY27 capex', 'GB300 lead times shortening', 'Networking attach rate above 70% on new clusters'] },
      today: { explanation: 'Every pillar of the thesis has fresh confirming data. Data-center revenue is still compounding above 50% YoY and the CUDA moat shows no erosion in framework share.' },
      forward: { outlook: 'Q2 earnings (Aug 26) is the key checkpoint — guidance above $62B would validate the double-by-FY28 path.', keyEvents: ['Q2 FY27 earnings Aug 26', 'GTC DC keynote Oct 6', 'Hyperscaler Q3 capex updates late Oct'] },
    },
    catalysts: [
      { date: '2026-08-26', type: 'Earnings', description: 'Q2 FY27 earnings + Q3 guide', impactHypothesis: 'Guide >$62B extends the beat-and-raise cadence; whisper numbers already elevated.', horizon: 'near', category: 'thesis', thesisRelevance: true },
      { date: '2026-09-17', type: 'Macro', description: 'FOMC rate decision', impactHypothesis: 'A cut steepens the growth trade; NVDA is the highest-beta expression.', horizon: 'near', category: 'macro', thesisRelevance: false },
      { date: '2026-10-06', type: 'Product', description: 'GTC DC keynote — Rubin roadmap detail', impactHypothesis: 'Rubin timeline confirmation would de-risk FY28 estimates.', horizon: 'mid', category: 'fundamental', thesisRelevance: true },
    ],
    fiveMetrics: {
      revenue: { value: '$208B TTM', context: 'Still compounding >50% YoY off a huge base', trend: 'up', forwardOutlook: 'Consensus has FY27 revenue near $260B; supply, not demand, remains the constraint.' },
      profitability: { value: '62% op margin', context: 'Best-in-class; pricing power intact', trend: 'flat', forwardOutlook: 'Mix shift to systems (GB300 racks) trims gross margin ~100bps but operating leverage offsets it.' },
      cashGeneration: { value: '$87B TTM FCF', context: '42% FCF margin funds buybacks + capacity prepays', trend: 'up', forwardOutlook: 'FCF conversion stays above 90% of net income; expect buyback authorization refresh.' },
      valuation: { value: '46x trailing / 33x forward', context: 'Premium to semis, discount to its own growth', trend: 'flat', forwardOutlook: 'Multiple holds if beat-and-raise cadence continues; PEG still below 1.2.' },
      financialHealth: { value: '$42B net cash', context: 'No leverage risk; capacity prepays are the only claim', trend: 'up', forwardOutlook: 'Balance sheet can absorb any supply-chain shock; no refinancing exposure.' },
    },
    sectorRel: {
      forwardPE: { stock: 33.1, sectorMedian: 24.6, percentile: 82 },
      premiumTrend: 'stable',
      correlationToSector30d: 0.84, correlationToSector90d: 0.79,
      relativePerformance: [
        { period: '30d', stockReturn: 9.4, sectorReturn: 5.1, spyReturn: 2.6 },
        { period: '60d', stockReturn: 14.2, sectorReturn: 8.3, spyReturn: 4.1 },
      ],
      forwardOutlook: 'Semis should keep leading while capex guides rise; NVDA outperforms SOXX in up-tapes, lags in export-control headline shocks.',
    },
    driver: {
      past: { summary: 'June was sentiment-driven chop on export-control headlines; July flipped to fundamentals as supply-chain checks and capex guides came in strong.', dominantBucket: 4, evolution: 'Bucket 3 noise in June → Bucket 4 confirmation from mid-July onward.' },
      today: { primaryBucket: 4, secondaryBucket: 3, rationale: 'Capex guidance raises are a direct fundamental read-through to NVDA revenue; sentiment amplifies but did not originate the move.', confidence: 'high' },
      forward: { summary: 'Earnings on Aug 26 should keep the driver fundamental; a macro shock (CPI/FOMC) is the main risk of a bucket shift.', expectedBucket: 4, keyFactors: ['Q2 guide magnitude', 'Hyperscaler Q3 capex', 'Export-control headlines'] },
    },
  },
  MSFT: {
    bucketPrimary: 1, bucketSecondary: 4, bucketConfidence: 'medium',
    bucketRationale: 'Trading in line with beta-adjusted market; no idiosyncratic news this week. Azure re-acceleration remains the medium-term fundamental story.',
    thesisStatus: 'confirmed',
    news: {
      overall_tone: 'neutral',
      today_summary: 'Quiet tape. Coverage focused on Copilot seat-growth disclosures expected at the September analyst day; no material new datapoints this week.',
      institutional_today: 'Flows balanced; MSFT is a consensus overweight and screens as a funding source when semis rip.',
      social_today: 'Low retail engagement — mention volume at 0.8x the 90-day average.',
      key_headlines: [
        { headline: 'Microsoft to detail Copilot monetization at September analyst day', source: 'The Information', date: '2026-08-05' },
        { headline: 'Azure regional capacity additions point to sustained AI demand', source: 'CNBC', date: '2026-08-03' },
      ],
      analyst_ratings: [ { firm: 'Goldman Sachs', action: 'Reiterate Buy', priceTarget: '$560' } ],
      context_30_60: 'Steady grinder — tracked the market through the summer with a brief post-earnings pop in late July after Azure grew 31% cc.',
      score: 0.18, twitterScore: 0.05, redditScore: 0.1, mediaScore: 0.22, analystScore: 0.45,
    },
    thesis: {
      status: 'confirmed',
      past: { summary: 'Q4 earnings confirmed the annuity model: Azure +31% cc with AI services contributing 14 points of growth.', evidence: ['Azure 31% cc growth', 'Copilot seats +40% QoQ', 'Commercial RPO at record $315B'] },
      today: { explanation: 'Thesis intact and boring — exactly what you want from a compounder. Nothing in the last 30 days challenges the 15%+ EPS growth path.' },
      forward: { outlook: 'Analyst day (Sep 10) should give the first hard Copilot ARR disclosure; that is the next thesis checkpoint.', keyEvents: ['Analyst day Sep 10', 'Q1 FY27 earnings late Oct'] },
    },
    catalysts: [
      { date: '2026-09-10', type: 'Corporate', description: 'Analyst day — Copilot ARR disclosure expected', impactHypothesis: 'A credible ARR number would re-rate the AI annuity narrative.', horizon: 'near', category: 'thesis', thesisRelevance: true },
      { date: '2026-09-17', type: 'Macro', description: 'FOMC rate decision', impactHypothesis: 'Duration-sensitive mega-caps rally on a dovish surprise.', horizon: 'near', category: 'macro', thesisRelevance: false },
      { date: '2026-10-28', type: 'Earnings', description: 'Q1 FY27 earnings', impactHypothesis: 'Azure growth above 30% cc keeps the compounding story on track.', horizon: 'mid', category: 'fundamental', thesisRelevance: true },
    ],
    fiveMetrics: {
      revenue: { value: '$298B TTM', context: '15% YoY, cloud-led', trend: 'up', forwardOutlook: 'Azure AI services and Copilot seats keep total growth in the mid-teens through FY27.' },
      profitability: { value: '45% op margin', context: 'Expanding despite AI capex depreciation', trend: 'up', forwardOutlook: 'Margin roughly flat as AI infra depreciation offsets scale gains.' },
      cashGeneration: { value: '$83B TTM FCF', context: 'Capex-heavy but still a cash machine', trend: 'flat', forwardOutlook: 'FCF growth lags EPS until the capex curve bends in FY28.' },
      valuation: { value: '35x trailing / 30x forward', context: 'In line with 5-year average', trend: 'flat', forwardOutlook: 'Multiple sustained by durability, not expansion — returns should track EPS growth.' },
      financialHealth: { value: 'AAA balance sheet', context: '$35B net cash, minimal leverage', trend: 'flat', forwardOutlook: 'No constraints; dividend + buyback both growing.' },
    },
    sectorRel: {
      forwardPE: { stock: 29.8, sectorMedian: 24.6, percentile: 68 },
      premiumTrend: 'stable',
      correlationToSector30d: 0.91, correlationToSector90d: 0.88,
      relativePerformance: [
        { period: '30d', stockReturn: 3.1, sectorReturn: 4.2, spyReturn: 2.6 },
        { period: '60d', stockReturn: 5.8, sectorReturn: 7.0, spyReturn: 4.1 },
      ],
      forwardOutlook: 'Slight laggard vs XLK while semis lead; catches up when the tape broadens or on Copilot ARR disclosure.',
    },
    driver: {
      past: { summary: 'Market-correlated grind higher with one fundamental pop after Q4 earnings.', dominantBucket: 1, evolution: 'Bucket 1 throughout, brief Bucket 4 spike on earnings day.' },
      today: { primaryBucket: 1, secondaryBucket: 4, rationale: 'No idiosyncratic catalyst this week; 0.9 beta to the index explains the move within noise.', confidence: 'medium' },
      forward: { summary: 'Analyst day is the next likely bucket-4 event; otherwise expect continued market-driven trading.', expectedBucket: 4, keyFactors: ['Copilot ARR disclosure', 'Rate path', 'Semis leadership rotation'] },
    },
  },
  AMZN: {
    bucketPrimary: 3, bucketSecondary: 4, bucketConfidence: 'medium',
    bucketRationale: 'Post-earnings drift is positioning-driven: heavy call-buying into the print unwound despite a fundamentally fine quarter. Retail margin beat is the underlying positive.',
    thesisStatus: 'neutral',
    news: {
      overall_tone: 'neutral',
      today_summary: 'Stock digesting a +6% earnings pop from last week. Options positioning unwind is dampening follow-through; sell-side uniformly raised targets on the retail margin beat.',
      institutional_today: 'Long-only adds reported on the margin story; fast-money profit-taking after the pop.',
      social_today: 'Mentions cooling from earnings-week spike; tone mildly positive around AWS AI backlog.',
      key_headlines: [
        { headline: 'Amazon retail margins hit record on regionalization gains', source: 'WSJ', date: '2026-08-01' },
        { headline: 'AWS backlog accelerates to $220B on AI workload commitments', source: 'Bloomberg', date: '2026-07-31' },
      ],
      analyst_ratings: [
        { firm: 'JPMorgan', action: 'Reiterate Overweight', priceTarget: '$250 → $265' },
        { firm: 'Evercore ISI', action: 'Reiterate Outperform', priceTarget: '$260' },
      ],
      context_30_60: 'Ran up 12% into earnings on margin optimism, beat, popped, and has been consolidating since — a classic buy-the-rumor structure without the sell-off.',
      score: 0.31, twitterScore: 0.2, redditScore: 0.35, mediaScore: 0.3, analystScore: 0.6,
    },
    thesis: {
      status: 'neutral',
      past: { summary: 'Margin leg of the thesis is confirming (record retail op margin); AWS re-acceleration is real but decelerating at the second derivative.', evidence: ['NA retail op margin 7.1%, record', 'AWS +19% YoY vs +19.5% last Q', 'Ad revenue +22%'] },
      today: { explanation: 'Thesis half-confirmed: margins are re-rating on schedule, but the "AWS re-accelerates" pillar stalled this quarter. Not challenged — just unproven.' },
      forward: { outlook: 'Watch AWS growth against the $220B backlog conversion; re-acceleration above 20% would flip status to confirmed.', keyEvents: ['re:Invent Nov 30', 'Q3 earnings late Oct', 'Holiday-quarter margin guide'] },
    },
    catalysts: [
      { date: '2026-09-25', type: 'Sector', description: 'Retail sector September sales data', impactHypothesis: 'Consumer resilience read-through for the retail segment.', horizon: 'near', category: 'sector', thesisRelevance: false },
      { date: '2026-10-29', type: 'Earnings', description: 'Q3 earnings — AWS growth is the number that matters', impactHypothesis: 'AWS ≥20% converts the thesis to confirmed; <18% pressures it.', horizon: 'mid', category: 'thesis', thesisRelevance: true },
      { date: '2026-11-30', type: 'Product', description: 'AWS re:Invent', impactHypothesis: 'Custom-silicon and AI-services announcements support the backlog-conversion story.', horizon: 'mid', category: 'fundamental', thesisRelevance: true },
    ],
    fiveMetrics: {
      revenue: { value: '$705B TTM', context: '11% YoY with improving mix', trend: 'up', forwardOutlook: 'Ads and AWS out-grow retail, mixing revenue toward higher-margin streams.' },
      profitability: { value: '11.5% op margin', context: 'Record, driven by NA retail + ads', trend: 'up', forwardOutlook: 'Structural path to 13-14% as regionalization and ads compounding continue.' },
      cashGeneration: { value: '$53B TTM FCF', context: 'Inflecting as capex growth moderates', trend: 'up', forwardOutlook: 'FCF is the thesis scoreboard — expect >$70B run-rate exiting 2027.' },
      valuation: { value: '36x trailing / 27x forward', context: 'Cheapest vs. own history in a decade on FCF', trend: 'down', forwardOutlook: 'Multiple compresses as earnings catch up; total return driven by EPS.' },
      financialHealth: { value: '$30B net cash', context: 'Leverage fully de-risked', trend: 'up', forwardOutlook: 'Buyback capacity building; first meaningful repurchase authorization plausible in 2027.' },
    },
    sectorRel: {
      forwardPE: { stock: 27.3, sectorMedian: 22.8, percentile: 71 },
      premiumTrend: 'compressing',
      correlationToSector30d: 0.72, correlationToSector90d: 0.77,
      relativePerformance: [
        { period: '30d', stockReturn: 7.8, sectorReturn: 3.0, spyReturn: 2.6 },
        { period: '60d', stockReturn: 10.5, sectorReturn: 4.4, spyReturn: 4.1 },
      ],
      forwardOutlook: 'Should keep outperforming XLY — the margin story is idiosyncratic, not consumer-cyclical.',
    },
    driver: {
      past: { summary: 'Pre-earnings run-up was positioning; the pop was fundamental; the digestion since is options-unwind mechanics.', dominantBucket: 3, evolution: 'Bucket 3 build-up → Bucket 4 on earnings day → Bucket 3 unwind.' },
      today: { primaryBucket: 3, secondaryBucket: 4, rationale: 'Price action dominated by dealer positioning unwind after the earnings pop; underlying fundamental beat supports the level.', confidence: 'medium' },
      forward: { summary: 'Once positioning normalizes, expect reversion to fundamental drivers into Q3 earnings.', expectedBucket: 4, keyFactors: ['AWS growth rate', 'Holiday guide', 'Consumer spending data'] },
    },
  },
  XOM: {
    bucketPrimary: 2, bucketSecondary: 1, bucketConfidence: 'high',
    bucketRationale: 'Move tracks the energy complex: crude rallied on OPEC+ discipline and XLE followed. Nothing company-specific this week.',
    thesisStatus: 'confirmed',
    news: {
      overall_tone: 'neutral',
      today_summary: 'Trading with crude. Brent back above $71 on OPEC+ compliance and a surprise inventory draw; XOM moving in lockstep with XLE.',
      institutional_today: 'Energy remains an underweight across active funds; value managers quietly adding on FCF yield.',
      social_today: 'Minimal retail interest — energy is off the radar, which bulls consider a feature.',
      key_headlines: [
        { headline: 'OPEC+ holds production targets, compliance at 96%', source: 'Reuters', date: '2026-08-06' },
        { headline: 'EIA reports surprise 4.2M bbl crude draw', source: 'EIA', date: '2026-08-05' },
      ],
      analyst_ratings: [ { firm: 'Wells Fargo', action: 'Reiterate Overweight', priceTarget: '$128' } ],
      context_30_60: 'Range-bound $105-115 tracking crude. Q2 earnings in-line; Guyana ramp ahead of schedule was the one positive surprise.',
      score: 0.12, twitterScore: 0.0, redditScore: 0.05, mediaScore: 0.15, analystScore: 0.35,
    },
    thesis: {
      status: 'confirmed',
      past: { summary: 'FCF resilience thesis holding: Q2 FCF of $9.8B at ~$68 average WTI, Guyana volumes ahead of plan.', evidence: ['Q2 FCF $9.8B', 'Guyana ahead of schedule', 'Buyback pace maintained at $5B/qtr'] },
      today: { explanation: 'Thesis performing as designed — low-cost barrels are cushioning a mediocre price environment while buybacks shrink the float.' },
      forward: { outlook: 'Thesis is price-resilient down to ~$60 WTI; OPEC+ November meeting is the main exogenous risk.', keyEvents: ['OPEC+ meeting Nov 1', 'Q3 earnings Oct 30'] },
    },
    catalysts: [
      { date: '2026-09-04', type: 'Macro', description: 'OPEC+ monthly compliance report', impactHypothesis: 'Continued discipline supports crude above $68.', horizon: 'near', category: 'macro', thesisRelevance: false },
      { date: '2026-10-30', type: 'Earnings', description: 'Q3 earnings', impactHypothesis: 'FCF above $9B at current strip re-confirms the downside-protection thesis.', horizon: 'mid', category: 'thesis', thesisRelevance: true },
      { date: '2026-11-01', type: 'Macro', description: 'OPEC+ production decision', impactHypothesis: 'A quota increase is the primary bear risk to the whole energy complex.', horizon: 'mid', category: 'sector', thesisRelevance: true },
    ],
    fiveMetrics: {
      revenue: { value: '$340B TTM', context: 'Flat — volume gains offset softer crude', trend: 'flat', forwardOutlook: 'Revenue tracks crude; volumes add ~3%/yr from Guyana and Permian.' },
      profitability: { value: '13.5% op margin', context: 'Cost cuts holding margins despite price', trend: 'flat', forwardOutlook: 'Structural cost program targets another $3B by 2027.' },
      cashGeneration: { value: '$29B TTM FCF', context: '8.5% FCF margin at $68 WTI', trend: 'flat', forwardOutlook: 'FCF covers dividend + buyback down to $60 WTI.' },
      valuation: { value: '14x trailing / 13x forward', context: 'In line with supermajor peers', trend: 'flat', forwardOutlook: 'Rerating requires a crude regime change; total return is yield + buyback.' },
      financialHealth: { value: '11% net debt/cap', context: 'Lowest leverage among peers', trend: 'up', forwardOutlook: 'Balance sheet can fund counter-cyclical M&A if crude breaks down.' },
    },
    sectorRel: {
      forwardPE: { stock: 13.1, sectorMedian: 12.2, percentile: 58 },
      premiumTrend: 'stable',
      correlationToSector30d: 0.93, correlationToSector90d: 0.9,
      relativePerformance: [
        { period: '30d', stockReturn: 2.2, sectorReturn: 1.8, spyReturn: 2.6 },
        { period: '60d', stockReturn: 3.5, sectorReturn: 2.9, spyReturn: 4.1 },
      ],
      forwardOutlook: 'Expect continued high correlation to XLE; modest alpha from Guyana volume beats.',
    },
    driver: {
      past: { summary: 'Pure sector trade — 0.9+ correlation to XLE all summer, driven by OPEC+ headlines and inventory data.', dominantBucket: 2, evolution: 'Bucket 2 throughout; brief Bucket 4 on Guyana update.' },
      today: { primaryBucket: 2, secondaryBucket: 1, rationale: 'Crude complex strength on OPEC+ compliance is lifting the whole sector; XOM has no idiosyncratic news.', confidence: 'high' },
      forward: { summary: 'Sector-driven until the November OPEC+ decision; earnings could briefly shift the driver to fundamentals.', expectedBucket: 2, keyFactors: ['Crude price', 'OPEC+ November decision', 'Q3 FCF print'] },
    },
  },
  UNH: {
    bucketPrimary: 4, bucketSecondary: 3, bucketConfidence: 'high',
    bucketRationale: 'Sharp underperformance vs. both market and XLV after the MA cost-trend disclosure — a company-specific fundamental problem, amplified by capitulation selling.',
    thesisStatus: 'challenged',
    news: {
      overall_tone: 'bearish',
      today_summary: 'Under pressure again after management flagged Medicare Advantage utilization running above the June guide. Two downgrades this week; tone in coverage has turned openly skeptical of the 2027 recovery timeline.',
      institutional_today: 'Long-only capitulation continues; hedge-fund shorts pressing. Healthcare PMs describe positioning as "uninvestable until trend visibility."',
      social_today: 'Retail sentiment sharply negative; UNH threads dominated by falling-knife debates.',
      key_headlines: [
        { headline: 'UnitedHealth flags MA utilization above prior guidance', source: 'Bloomberg', date: '2026-08-05' },
        { headline: 'Two firms cut UNH to Hold citing 2027 margin uncertainty', source: 'Barron\'s', date: '2026-08-06' },
      ],
      analyst_ratings: [
        { firm: 'Bernstein', action: 'Downgrade', priceTarget: '$310 → $265' },
        { firm: 'Raymond James', action: 'Downgrade', priceTarget: '$300 → $270' },
      ],
      context_30_60: 'Down 18% over 60 days in three legs: the June utilization warning, the July guidance cut, and this week\'s disclosure. Each bounce has been sold.',
      score: -0.58, twitterScore: -0.6, redditScore: -0.55, mediaScore: -0.62, analystScore: -0.4,
    },
    thesis: {
      status: 'challenged',
      past: { summary: 'The core assumption — cost trend normalizing by 2027 — has been contradicted three times in 60 days.', evidence: ['June utilization warning', 'July FY26 guidance cut', 'August disclosure of trend above guide'] },
      today: { explanation: 'Thesis is directly challenged: management no longer has credibility on the trend-normalization timeline, and the Street is pushing recovery assumptions to 2028. The Optum pillar still compounds, but it is not the stock driver right now.' },
      forward: { outlook: 'Decision point: either underwrite a longer recovery (2028) at a cheaper entry, or exit. Q3 earnings MLR is the evidence that settles it.', keyEvents: ['Q3 earnings Oct 15 — MLR print', 'CMS 2028 MA rate notice (early 2027)', 'Investor day Dec 2'] },
    },
    catalysts: [
      { date: '2026-10-15', type: 'Earnings', description: 'Q3 earnings — medical loss ratio is the number', impactHypothesis: 'MLR stabilization would be the first evidence for the recovery case; another miss likely forces a thesis exit.', horizon: 'mid', category: 'thesis', thesisRelevance: true },
      { date: '2026-12-02', type: 'Corporate', description: 'Investor day — 2027 framework', impactHypothesis: 'Credible 2027 margin bridge could mark the bottom.', horizon: 'mid', category: 'fundamental', thesisRelevance: true },
      { date: '2026-09-17', type: 'Macro', description: 'FOMC rate decision', impactHypothesis: 'Largely irrelevant to the stock right now — idiosyncratic story dominates.', horizon: 'near', category: 'macro', thesisRelevance: false },
    ],
    fiveMetrics: {
      revenue: { value: '$425B TTM', context: '7.5% YoY, Optum-led', trend: 'up', forwardOutlook: 'Top line is not the problem — growth persists through the margin reset.' },
      profitability: { value: '7.2% op margin', context: 'Compressing on MA utilization', trend: 'down', forwardOutlook: 'Consensus now models margin trough in mid-2027; timeline risk remains.' },
      cashGeneration: { value: '$23B TTM FCF', context: 'Still strong despite margin pressure', trend: 'flat', forwardOutlook: 'Cash conversion holds; buyback paused pending trend visibility.' },
      valuation: { value: '12x trailing / 11x forward', context: 'Decade-low multiple', trend: 'down', forwardOutlook: 'Cheap on trough-ish earnings — but estimates are still falling, so the real multiple is higher.' },
      financialHealth: { value: '40% debt/cap', context: 'Manageable; ample liquidity', trend: 'flat', forwardOutlook: 'No balance-sheet risk; leverage stable through the reset.' },
    },
    sectorRel: {
      forwardPE: { stock: 10.6, sectorMedian: 15.4, percentile: 14 },
      premiumTrend: 'compressing',
      correlationToSector30d: 0.31, correlationToSector90d: 0.44,
      relativePerformance: [
        { period: '30d', stockReturn: -9.6, sectorReturn: 0.8, spyReturn: 2.6 },
        { period: '60d', stockReturn: -18.2, sectorReturn: 1.5, spyReturn: 4.1 },
      ],
      forwardOutlook: 'Decoupled from XLV — this trades on company-specific MLR data until trend visibility returns.',
    },
    driver: {
      past: { summary: 'Three legs down over 60 days, each triggered by a company disclosure — textbook fundamental deterioration with sentiment amplification.', dominantBucket: 4, evolution: 'Bucket 4 shocks in June, July, August; Bucket 3 capitulation between them.' },
      today: { primaryBucket: 4, secondaryBucket: 3, rationale: 'This week\'s move started with the utilization disclosure (fundamental) and was extended by downgrade-driven selling (sentiment).', confidence: 'high' },
      forward: { summary: 'Driver stays fundamental until an MLR print stabilizes; expect high volatility around Oct 15 earnings.', expectedBucket: 4, keyFactors: ['Q3 MLR', 'Guidance credibility', 'Short positioning'] },
    },
  },
};

db.prepare('DELETE FROM analysis_scans').run();
const insScan = db.prepare(`INSERT INTO analysis_scans
  (ticker, scan_type, bucket_primary, bucket_secondary, bucket_rationale, bucket_confidence,
   news_sentiment, thesis_status, thesis_analysis, catalysts, five_metrics, sector_relative,
   driver_analysis, full_analysis, step_timestamps, scanned_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const STEPS = ['news', 'fundamentals', 'sector', 'bucket', 'thesis', 'catalysts'];
const stampsAt = (iso) => JSON.stringify(Object.fromEntries(STEPS.map((s) => [s, iso])));

/** Yesterday's scan, so the history picker and delta logic have prior state. */
function priorVariant(s) {
  return {
    ...s,
    // A day earlier the driver read as market beta before the story developed.
    bucketPrimary: s.bucketPrimary === 4 ? 1 : s.bucketPrimary,
    bucketRationale: 'Prior session: move tracked the index within beta tolerance; no company-specific catalyst identified.',
    thesisStatus: s.thesisStatus === 'challenged' ? 'neutral' : s.thesisStatus,
  };
}

let scanIdx = 0;
for (const [sym, s] of Object.entries(SCANS)) {
  if (!seededTickers.has(sym)) continue;
  const prevAt = new Date(Date.parse(NOW) - 26 * 3600_000).toISOString();
  const p = priorVariant(s);
  insScan.run(
    sym, 'full', p.bucketPrimary, p.bucketSecondary, p.bucketRationale, 'medium',
    JSON.stringify(p.news), p.thesisStatus, JSON.stringify({ ...p.thesis, status: p.thesisStatus }),
    JSON.stringify(p.catalysts), JSON.stringify(p.fiveMetrics), JSON.stringify(p.sectorRel),
    JSON.stringify(p.driver), null, stampsAt(prevAt), prevAt,
  );

  const scannedAt = new Date(Date.parse(NOW) + scanIdx++ * 60_000).toISOString();
  insScan.run(
    sym, 'full', s.bucketPrimary, s.bucketSecondary, s.bucketRationale, s.bucketConfidence,
    JSON.stringify(s.news), s.thesisStatus, JSON.stringify(s.thesis),
    JSON.stringify(s.catalysts), JSON.stringify(s.fiveMetrics), JSON.stringify(s.sectorRel),
    JSON.stringify(s.driver),
    JSON.stringify({ news: s.news, driver: s.driver, thesis: s.thesis, catalysts: s.catalysts }),
    stampsAt(scannedAt), scannedAt,
  );
}

// ── Regime + anomalies ────────────────────────────────────────────────────────
db.prepare('DELETE FROM regime_snapshots').run();
db.prepare(`INSERT INTO regime_snapshots (regime, rationale, spy_change, vix, snapped_at) VALUES (?, ?, ?, ?, ?)`)
  .run('rotation',
    'Index near highs but leadership is churning: semis and energy leading while healthcare and defensives lag. Breadth is narrowing without risk-off stress — classic rotation regime. VIX at 16.8 shows no systemic fear.',
    0.42, 16.8, NOW);

db.prepare('DELETE FROM anomaly_flags').run();
const insFlag = db.prepare(`INSERT INTO anomaly_flags (ticker, flag_type, description, severity, resolved, flagged_at) VALUES (?, ?, ?, ?, 0, ?)`);
insFlag.run('UNH', 'regime_divergence', 'Down 9.6% over 30 days while SPY gained 2.6% — a -12% beta-adjusted divergence driven by the MA utilization disclosures. Largest anomaly in the portfolio.', 'high', NOW);
insFlag.run('UNH', 'thesis_challenge', 'Cost-trend normalization assumption contradicted by three consecutive disclosures; thesis status moved to challenged.', 'high', NOW);
insFlag.run('AMZN', 'sector_divergence', 'Outperformed XLY by 4.8% over 30 days; correlation to sector dropped to 0.72. Idiosyncratic margin story decoupling from the consumer complex.', 'medium', NOW);

const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log(
  `Demo data seeded into ${DB_PATH}\n` +
  `  ${count('holdings')} holdings · ${count('price_history')} price rows · ` +
  `${count('fundamentals')} fundamentals blobs\n` +
  `  ${count('analysis_scans')} scans · ${count('anomaly_flags')} anomaly flags · ` +
  `prices through ${LAST_TRADING_DAY}\n\n` +
  `Start the app with "npm run dev" — no API keys required.\n` +
  `All figures are invented for demo purposes.`,
);
