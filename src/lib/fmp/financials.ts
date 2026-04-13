import { fmpFetch } from './client';
import type { PeerRow, RevenueSegment } from '@/types';

export interface IncomeQ {
  date: string;
  period: string;
  revenue: number;
  grossProfit: number;
  grossProfitRatio: number;
  operatingIncome: number;
  operatingIncomeRatio: number;
  netIncome: number;
  epsDiluted: number | null;
}

export interface CashFlowQ {
  date: string;
  period: string;
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
  dividendsPaid: number | null;
  commonStockRepurchased: number | null;
}

export interface BalanceSheetQ {
  date: string;
  period: string;
  cashAndCashEquivalents: number;
  shortTermInvestments: number;
  totalAssets: number;
  totalLiabilities: number;
  totalStockholdersEquity: number;
  totalDebt: number;
  netDebt: number;
}

export interface KeyMetricQ {
  date: string;
  period: string;
  peRatio: number | null;
  pegRatio: number | null;
  priceToFreeCashFlowsRatio: number | null;
}

/** TTM ratios from /ratios-ttm (free tier) */
export interface RatiosTTM {
  peRatio: number | null;
  pegRatio: number | null;
  priceToFreeCashFlowRatio: number | null;
}

export interface QuarterlyFinancials {
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  balanceSheet: BalanceSheetQ[];
  keyMetrics: KeyMetricQ[];
  ratiosTTM: RatiosTTM | null;
  /** True when FMP returns a premium-required error for this ticker */
  unavailable: boolean;
}

// Raw shape returned by /ratios-ttm
interface RawRatiosTTM {
  priceToEarningsRatioTTM?: number;
  priceToEarningsGrowthRatioTTM?: number;
  priceToFreeCashFlowRatioTTM?: number;
}

/** FMP stable API returns 0 for ratio fields — always recompute from raw values */
function normalizeIncome(raw: IncomeQ[]): IncomeQ[] {
  return raw.map((q) => ({
    ...q,
    grossProfitRatio: q.revenue > 0 ? q.grossProfit / q.revenue : 0,
    operatingIncomeRatio: q.revenue > 0 ? q.operatingIncome / q.revenue : 0,
  }));
}

export async function fetchQuarterlyFinancials(ticker: string): Promise<QuarterlyFinancials> {
  const symbol = ticker.toUpperCase();
  const empty: QuarterlyFinancials = {
    income: [], cashFlow: [], balanceSheet: [], keyMetrics: [], ratiosTTM: null, unavailable: false,
  };

  try {
    // /key-metrics?period=quarter requires premium — use /ratios-ttm (free) for PE/PEG
    const [rawIncome, cashFlow, balanceSheet, rawRatios] = await Promise.all([
      fmpFetch<IncomeQ[]>(`/income-statement?symbol=${symbol}&period=quarter&limit=9`),
      fmpFetch<CashFlowQ[]>(`/cash-flow-statement?symbol=${symbol}&period=quarter&limit=9`),
      fmpFetch<BalanceSheetQ[]>(`/balance-sheet-statement?symbol=${symbol}&period=quarter&limit=8`),
      fmpFetch<RawRatiosTTM[]>(`/ratios-ttm?symbol=${symbol}`),
    ]);

    const income = normalizeIncome(Array.isArray(rawIncome) ? rawIncome : []);

    const r = Array.isArray(rawRatios) && rawRatios[0] ? rawRatios[0] : null;
    const ratiosTTM: RatiosTTM | null = r ? {
      peRatio: r.priceToEarningsRatioTTM ?? null,
      pegRatio: r.priceToEarningsGrowthRatioTTM ?? null,
      priceToFreeCashFlowRatio: r.priceToFreeCashFlowRatioTTM ?? null,
    } : null;

    // Build keyMetrics[] with a single TTM entry so existing card logic still works
    const keyMetrics: KeyMetricQ[] = ratiosTTM ? [{
      date: new Date().toISOString().slice(0, 10),
      period: 'TTM',
      peRatio: ratiosTTM.peRatio,
      pegRatio: ratiosTTM.pegRatio,
      priceToFreeCashFlowsRatio: ratiosTTM.priceToFreeCashFlowRatio,
    }] : [];

    return {
      income:       income.slice(0, 9),
      cashFlow:     (Array.isArray(cashFlow)     ? cashFlow     : []).slice(0, 9),
      balanceSheet: (Array.isArray(balanceSheet) ? balanceSheet : []).slice(0, 8),
      keyMetrics,
      ratiosTTM,
      unavailable: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    // Let rate-limit errors propagate so the cache layer doesn't cache empty data
    if (msg.startsWith('FMP_RATE_LIMIT:')) {
      console.warn(`[FMP] Rate limited for ${symbol} — will retry on next page load`);
      return empty;
    }
    console.warn(`[FMP] financials fetch failed for ${symbol}:`, msg.slice(0, 200));
    return { ...empty, unavailable: msg.startsWith('FMP_PREMIUM:') };
  }
}

// ── Analyst estimates (for forward P/E) ─────────────────────────────────────

export interface AnalystEstimate {
  symbol: string;
  date: string;
  epsAvg: number | null;
  revenueAvg: number | null;
  netIncomeAvg: number | null;
  ebitAvg: number | null;
  ebitdaAvg: number | null;
}

/**
 * Fetch analyst consensus estimates from FMP.
 * Returns the nearest future fiscal year estimate (NTM forward EPS).
 * FMP returns results sorted by date descending, so we pick the last item
 * that is still in the future (or the earliest available).
 */
export async function fetchAnalystEstimates(ticker: string): Promise<AnalystEstimate | null> {
  const symbol = ticker.toUpperCase();
  try {
    const data = await fmpFetch<AnalystEstimate[]>(
      `/analyst-estimates?symbol=${symbol}&period=annual&limit=5`
    );
    if (!Array.isArray(data) || data.length === 0) return null;

    // Results are descending by date — pick the nearest future year
    const today = new Date().toISOString().slice(0, 10);
    const futureEstimates = data.filter((e) => e.date >= today);
    // If we have future estimates, use the nearest one (last in descending array)
    if (futureEstimates.length > 0) return futureEstimates[futureEstimates.length - 1];
    // Fallback: most recent estimate
    return data[data.length - 1];
  } catch {
    return null;
  }
}

// ── Stock peers ────────────────────────────────────────────────────────────────

export async function fetchPeers(ticker: string): Promise<string[]> {
  const symbol = ticker.toUpperCase();
  try {
    const data = await fmpFetch<Array<{ symbol: string; peersList?: string[] }>>(
      `/stock-peers?symbol=${symbol}`
    );
    if (!Array.isArray(data) || data.length === 0) return [];
    // FMP stable API returns flat array of {symbol, companyName, ...} objects
    // (legacy format was [{symbol, peersList: [...]}])
    if (data[0]?.peersList) {
      return data[0].peersList.slice(0, 5);
    }
    return data.map((d) => d.symbol).filter((s) => s !== symbol).slice(0, 5);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.warn(`[FMP] peers fetch failed for ${symbol}:`, msg.slice(0, 100));
    return [];
  }
}

// ── Revenue segments (annual) ──────────────────────────────────────────────────

interface FmpSegmentRow {
  symbol: string;
  fiscalYear: string;
  period: string;
  date: string;
  data: Record<string, number>;
}

export async function fetchSegments(ticker: string): Promise<RevenueSegment[]> {
  const symbol = ticker.toUpperCase();
  try {
    const data = await fmpFetch<FmpSegmentRow[]>(
      `/revenue-product-segmentation?symbol=${symbol}&period=annual&limit=2`
    );
    if (!Array.isArray(data) || data.length === 0) return [];

    const latest = data[0];
    const prior = data.length >= 2 ? data[1] : null;

    return Object.entries(latest.data)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => {
        const priorValue = prior?.data[name] ?? null;
        const yoyGrowth = priorValue != null && priorValue > 0
          ? value / priorValue - 1
          : null;
        return { name, value, yoyGrowth };
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.warn(`[FMP] segments fetch failed for ${symbol}:`, msg.slice(0, 100));
    return [];
  }
}

// ── Annual financials ────────────────────────────────────────────────────────

export async function fetchAnnualFinancials(
  ticker: string,
): Promise<{ income: IncomeQ[]; cashFlow: CashFlowQ[] }> {
  const symbol = ticker.toUpperCase();
  try {
    const [rawIncome, rawCashFlow] = await Promise.all([
      fmpFetch<IncomeQ[]>(`/income-statement?symbol=${symbol}&period=annual&limit=5`),
      fmpFetch<CashFlowQ[]>(`/cash-flow-statement?symbol=${symbol}&period=annual&limit=5`),
    ]);
    const income = normalizeIncome(Array.isArray(rawIncome) ? rawIncome : []);
    const cashFlow = Array.isArray(rawCashFlow) ? rawCashFlow : [];
    return { income, cashFlow };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.warn(`[FMP] annual financials fetch failed for ${symbol}:`, msg.slice(0, 200));
    return { income: [], cashFlow: [] };
  }
}

/**
 * Fetch all available annual analyst estimates (multiple future years).
 * Returns array sorted by date ascending (oldest first).
 */
export async function fetchAnalystEstimatesMulti(ticker: string): Promise<AnalystEstimate[]> {
  const symbol = ticker.toUpperCase();
  try {
    const data = await fmpFetch<AnalystEstimate[]>(
      `/analyst-estimates?symbol=${symbol}&period=annual&limit=5`
    );
    if (!Array.isArray(data) || data.length === 0) return [];
    // FMP returns descending — reverse to ascending
    return [...data].reverse();
  } catch {
    return [];
  }
}

/**
 * Fetch quarterly analyst estimates (multiple future quarters).
 * Returns array sorted by date ascending (oldest first).
 *
 * FMP's quarterly estimates endpoint requires a premium plan.
 * When unavailable, we derive quarterly estimates from annual estimates
 * by splitting each future year into 4 quarters (÷4 approximation).
 */
export async function fetchAnalystEstimatesQuarterly(ticker: string): Promise<AnalystEstimate[]> {
  const symbol = ticker.toUpperCase();

  // Try the real quarterly endpoint first
  try {
    const data = await fmpFetch<AnalystEstimate[]>(
      `/analyst-estimates?symbol=${symbol}&period=quarter&limit=8`
    );
    if (Array.isArray(data) && data.length > 0) {
      return [...data].reverse();
    }
  } catch {
    // Premium-gated or failed — fall through to derivation
  }

  // Derive from annual estimates
  try {
    const annual = await fetchAnalystEstimatesMulti(symbol);
    if (annual.length === 0) return [];

    const today = new Date().toISOString().slice(0, 10);
    const quarters: AnalystEstimate[] = [];

    for (const yr of annual) {
      const fyYear = parseInt(yr.date.slice(0, 4), 10);
      if (isNaN(fyYear)) continue;

      // Generate Q1-Q4 end dates for this fiscal year
      const qDates = [
        `${fyYear}-03-31`,
        `${fyYear}-06-30`,
        `${fyYear}-09-30`,
        `${fyYear}-12-31`,
      ];

      for (const qDate of qDates) {
        if (qDate <= today) continue; // skip past quarters
        quarters.push({
          symbol,
          date: qDate,
          epsAvg: yr.epsAvg != null ? yr.epsAvg / 4 : null,
          revenueAvg: yr.revenueAvg != null ? yr.revenueAvg / 4 : null,
          netIncomeAvg: yr.netIncomeAvg != null ? yr.netIncomeAvg / 4 : null,
          ebitAvg: yr.ebitAvg != null ? yr.ebitAvg / 4 : null,
          ebitdaAvg: yr.ebitdaAvg != null ? yr.ebitdaAvg / 4 : null,
        });
      }
    }

    // Sort ascending, take up to 8
    return quarters.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  } catch {
    return [];
  }
}

// ── Peer metrics ───────────────────────────────────────────────────────────────

function computeRevGrowthYoY(income: IncomeQ[]): number | null {
  if (income.length < 5) return null;
  const current = income[0]?.revenue ?? 0;
  const yearAgo = income[4]?.revenue ?? 0;
  if (!yearAgo || yearAgo <= 0) return null;
  return current / yearAgo - 1;
}

function computeFcfMargin(income: IncomeQ[], cashFlow: CashFlowQ[]): number | null {
  if (income.length < 4 || cashFlow.length < 4) return null;
  const ttmRev = income.slice(0, 4).reduce((s, q) => s + q.revenue, 0);
  const ttmFcf = cashFlow.slice(0, 4).reduce((s, q) => {
    return s + (q.freeCashFlow ?? (q.operatingCashFlow + q.capitalExpenditure));
  }, 0);
  return ttmRev > 0 ? ttmFcf / ttmRev : null;
}

export async function buildPeerRows(
  selfTicker: string,
  selfFinancials: QuarterlyFinancials,
  selfCashFlow: CashFlowQ[],
  peerTickers: string[],
): Promise<PeerRow[]> {
  // Self row built from already-fetched data — no extra API call
  // forwardPeRatio for self is set later in page.tsx (it already has the quote + estimates)
  const selfRow: PeerRow = {
    ticker: selfTicker,
    revGrowthYoY: computeRevGrowthYoY(selfFinancials.income),
    opMargin: selfFinancials.income[0]?.operatingIncomeRatio ?? null,
    fcfMargin: computeFcfMargin(selfFinancials.income, selfCashFlow),
    peRatio: selfFinancials.ratiosTTM?.peRatio ?? selfFinancials.keyMetrics[0]?.peRatio ?? null,
    forwardPeRatio: null,
    isSelf: true,
  };

  const top4 = peerTickers.slice(0, 4);
  const peerData = await Promise.all(
    top4.map(async (ticker): Promise<PeerRow> => {
      try {
        const [income, cf, rawRatios, estimate, quoteArr] = await Promise.all([
          fmpFetch<IncomeQ[]>(`/income-statement?symbol=${ticker}&period=quarter&limit=5`),
          fmpFetch<CashFlowQ[]>(`/cash-flow-statement?symbol=${ticker}&period=quarter&limit=4`),
          fmpFetch<RawRatiosTTM[]>(`/ratios-ttm?symbol=${ticker}`),
          fetchAnalystEstimates(ticker),
          fmpFetch<Array<{ price: number }>>(`/quote?symbol=${ticker.toUpperCase()}`),
        ]);
        const incArr = normalizeIncome(Array.isArray(income) ? income : []);
        const cfArr = Array.isArray(cf) ? cf : [];
        const r = Array.isArray(rawRatios) && rawRatios[0] ? rawRatios[0] : null;
        const peerPrice = Array.isArray(quoteArr) && quoteArr[0]?.price ? quoteArr[0].price : null;
        const fwdEps = estimate?.epsAvg ?? null;
        const forwardPeRatio = fwdEps && fwdEps > 0 && peerPrice ? peerPrice / fwdEps : null;
        return {
          ticker,
          revGrowthYoY: computeRevGrowthYoY(incArr),
          opMargin: incArr[0]?.operatingIncomeRatio ?? null,
          fcfMargin: computeFcfMargin(incArr, cfArr),
          peRatio: r?.priceToEarningsRatioTTM ?? null,
          forwardPeRatio,
          isSelf: false,
        };
      } catch {
        return { ticker, revGrowthYoY: null, opMargin: null, fcfMargin: null, peRatio: null, forwardPeRatio: null, isSelf: false };
      }
    })
  );

  return [selfRow, ...peerData];
}
