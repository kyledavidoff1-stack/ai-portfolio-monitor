/**
 * Step 2: Fundamental Interpretation (no web search)
 * Given FMP quarterly/annual data, writes forward outlook for 5 metric cards.
 * Injects the exact FMP-sourced values displayed on the dashboard so Claude's
 * forward outlook is consistent with the numbers the user sees.
 */

import type { IncomeQ, CashFlowQ, BalanceSheetQ, KeyMetricQ } from '@/lib/fmp/financials';

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function pctStr(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function buildFinTable(income: IncomeQ[], cashFlow: CashFlowQ[]): string {
  const rows: string[] = ['Quarter | Revenue | Gross Margin | Op Margin | Net Income | FCF'];
  for (let i = 0; i < Math.min(income.length, 8); i++) {
    const q = income[i];
    const cf = cashFlow[i];
    rows.push(
      `${q.date} (${q.period}) | ${fmtNum(q.revenue)} | ${(q.grossProfitRatio * 100).toFixed(1)}% | ${(q.operatingIncomeRatio * 100).toFixed(1)}% | ${fmtNum(q.netIncome)} | ${cf ? fmtNum(cf.freeCashFlow) : 'N/A'}`
    );
  }
  return rows.join('\n');
}

/**
 * Compute the exact same displayed metrics from the five metric cards.
 * This mirrors the logic in company/[ticker]/page.tsx buildFiveCards().
 */
function buildDisplayedMetrics(params: {
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  balanceSheet: BalanceSheetQ[];
  keyMetrics: KeyMetricQ[];
  livePrice: number | null;
  forwardEps: number | null;
}): string {
  const { income, cashFlow, balanceSheet, keyMetrics, livePrice, forwardEps } = params;
  const lines: string[] = ['DISPLAYED METRICS (these exact numbers are shown to the user):'];

  // Revenue & Growth
  if (income.length >= 4) {
    const ttmRev = income.slice(0, 4).reduce((s, q) => s + q.revenue, 0);
    const pyRev = income.length >= 8 ? income.slice(4, 8).reduce((s, q) => s + q.revenue, 0) : 0;
    const growth = pyRev > 0 ? (ttmRev / pyRev - 1) : null;
    lines.push(`Revenue: ${fmtNum(ttmRev)} TTM${growth != null ? `, ${pctStr(growth)} YoY growth` : ''}`);
  }

  // Profitability (operating margin)
  if (income.length >= 4) {
    const ttmRev = income.slice(0, 4).reduce((s, q) => s + q.revenue, 0);
    const ttmOp = income.slice(0, 4).reduce((s, q) => s + q.operatingIncome, 0);
    const margin = ttmRev > 0 ? ttmOp / ttmRev : null;
    if (margin != null) lines.push(`Profitability: ${pctStr(margin)} operating margin TTM`);
  }

  // Cash Generation (FCF)
  if (cashFlow.length >= 4) {
    const ttmRev = income.slice(0, 4).reduce((s, q) => s + q.revenue, 0);
    const ttmFCF = cashFlow.slice(0, 4).reduce((s, q) => {
      return s + (q.freeCashFlow ?? (q.operatingCashFlow + q.capitalExpenditure));
    }, 0);
    const fcfMargin = ttmRev > 0 ? ttmFCF / ttmRev : null;
    lines.push(`Cash Generation: ${fmtNum(ttmFCF)} FCF TTM${fcfMargin != null ? ` (${pctStr(fcfMargin)} FCF margin)` : ''}`);
  }

  // Valuation (forward P/E or TTM P/E)
  const forwardPE = forwardEps && forwardEps > 0 && livePrice ? livePrice / forwardEps : null;
  const ttmPE = keyMetrics[0]?.peRatio ?? null;
  const displayPE = forwardPE ?? ttmPE;
  const peLabel = forwardPE != null ? 'Forward P/E' : 'TTM P/E';
  if (displayPE != null) lines.push(`Valuation: ${displayPE.toFixed(1)}x ${peLabel}`);

  // Financial Health (net cash/debt)
  if (balanceSheet.length > 0) {
    const latest = balanceSheet[0];
    const netDebt = latest.netDebt ?? (latest.totalDebt - latest.cashAndCashEquivalents);
    const netCash = -netDebt;
    lines.push(`Financial Health: ${fmtNum(Math.abs(netCash))} ${netCash >= 0 ? 'net cash' : 'net debt'}`);
  }

  return lines.join('\n');
}

export function buildFundamentalAnalysisPrompt(params: {
  ticker: string;
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  balanceSheet: BalanceSheetQ[];
  keyMetrics: KeyMetricQ[];
  livePrice?: number | null;
  forwardEps?: number | null;
}) {
  const { ticker, income, cashFlow, balanceSheet, keyMetrics, livePrice = null, forwardEps = null } = params;

  const finTable = buildFinTable(income, cashFlow);

  const latestBS = balanceSheet[0];
  const bsInfo = latestBS
    ? `Balance Sheet (${latestBS.date}): Cash ${fmtNum(latestBS.cashAndCashEquivalents)}, Total Debt ${fmtNum(latestBS.totalDebt)}, Net Debt ${fmtNum(latestBS.netDebt)}, Equity ${fmtNum(latestBS.totalStockholdersEquity)}`
    : 'Balance sheet data unavailable';

  const metricsInfo = keyMetrics[0]
    ? `Valuation (TTM): P/E ${keyMetrics[0].peRatio?.toFixed(1) ?? 'N/A'}, PEG ${keyMetrics[0].pegRatio?.toFixed(2) ?? 'N/A'}, P/FCF ${keyMetrics[0].priceToFreeCashFlowsRatio?.toFixed(1) ?? 'N/A'}`
    : 'Valuation metrics unavailable';

  const displayedMetrics = buildDisplayedMetrics({ income, cashFlow, balanceSheet, keyMetrics, livePrice, forwardEps });

  const system = `You are a financial analyst writing concise forward-looking commentary for an investment dashboard. Given quarterly financial data for a stock, write a 1-2 sentence forward outlook for each of 5 key metrics.

Respond with a single JSON object:
{
  "revenue": "1-2 sentence forward outlook on revenue trajectory",
  "profitability": "1-2 sentence forward outlook on margins and profitability",
  "cashGeneration": "1-2 sentence forward outlook on free cash flow",
  "valuation": "1-2 sentence forward outlook on valuation",
  "financialHealth": "1-2 sentence forward outlook on balance sheet strength"
}

CRITICAL: The "DISPLAYED METRICS" section below shows the exact numbers the user sees on their dashboard. Your forward outlook for each metric MUST reference these exact numbers as the starting point. Do not introduce different figures from other sources. Explain where these metrics are expected to go from here and why.

Be specific, reference actual numbers and trends from the data. Write like explaining to a smart friend — concise, no filler.`;

  const userMessage = `Analyze the financial data for ${ticker} and provide forward outlooks:

${displayedMetrics}

${finTable}

${bsInfo}

${metricsInfo}`;

  return { system, userMessage };
}
