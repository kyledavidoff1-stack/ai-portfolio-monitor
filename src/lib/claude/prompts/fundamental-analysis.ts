/**
 * Step 2: Fundamental Interpretation (no web search)
 * Given FMP quarterly/annual data, writes forward outlook for 5 metric cards.
 */

import type { IncomeQ, CashFlowQ, BalanceSheetQ, KeyMetricQ } from '@/lib/fmp/financials';

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function buildFinTable(income: IncomeQ[], cashFlow: CashFlowQ[], balanceSheet: BalanceSheetQ[]): string {
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

export function buildFundamentalAnalysisPrompt(params: {
  ticker: string;
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  balanceSheet: BalanceSheetQ[];
  keyMetrics: KeyMetricQ[];
}) {
  const { ticker, income, cashFlow, balanceSheet, keyMetrics } = params;

  const finTable = buildFinTable(income, cashFlow, balanceSheet);

  const latestBS = balanceSheet[0];
  const bsInfo = latestBS
    ? `Balance Sheet (${latestBS.date}): Cash ${fmtNum(latestBS.cashAndCashEquivalents)}, Total Debt ${fmtNum(latestBS.totalDebt)}, Net Debt ${fmtNum(latestBS.netDebt)}, Equity ${fmtNum(latestBS.totalStockholdersEquity)}`
    : 'Balance sheet data unavailable';

  const metricsInfo = keyMetrics[0]
    ? `Valuation (TTM): P/E ${keyMetrics[0].peRatio?.toFixed(1) ?? 'N/A'}, PEG ${keyMetrics[0].pegRatio?.toFixed(2) ?? 'N/A'}, P/FCF ${keyMetrics[0].priceToFreeCashFlowsRatio?.toFixed(1) ?? 'N/A'}`
    : 'Valuation metrics unavailable';

  const system = `You are a financial analyst writing concise forward-looking commentary for an investment dashboard. Given quarterly financial data for a stock, write a 1-2 sentence forward outlook for each of 5 key metrics.

Respond with a single JSON object:
{
  "revenue": "1-2 sentence forward outlook on revenue trajectory",
  "profitability": "1-2 sentence forward outlook on margins and profitability",
  "cashGeneration": "1-2 sentence forward outlook on free cash flow",
  "valuation": "1-2 sentence forward outlook on valuation",
  "financialHealth": "1-2 sentence forward outlook on balance sheet strength"
}

Be specific, reference actual numbers and trends from the data. Write like explaining to a smart friend — concise, no filler.`;

  const userMessage = `Analyze the financial data for ${ticker} and provide forward outlooks:

${finTable}

${bsInfo}

${metricsInfo}`;

  return { system, userMessage };
}
