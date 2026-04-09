import { db } from '@/lib/db';
import { holdings, analysisScans } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCurrency, formatPercent, formatMultiple, fmtB, pctAbs } from '@/utils/format';
import { fetchQuote } from '@/lib/fmp/quotes';
import { getFundamentals } from '@/lib/fmp/fundamentals-cache';
import { fetchAnalystEstimates } from '@/lib/fmp/financials';
import { ensureAllPriceHistory, getAlignedPriceHistory, getAlignedIntradayHistory } from '@/lib/fmp/prices';
import { normalizeTo100, percentileRank } from '@/lib/analysis/correlation';
import { MetricCardData } from '@/components/company/FiveNumbers';
import { CompanyGridLoader } from '@/components/company/CompanyGridLoader';
import { RefreshButton } from '@/components/company/RefreshButton';
import { deserializeScan } from '@/utils/deserialize-scan';
import { BUCKET_LABELS } from '@/lib/config/constants';
import type { AnalysisScan } from '@/types';
import type { RelativePerfPoint } from '@/components/company/SectorRelativeChart';
import type { IncomeQ, CashFlowQ, BalanceSheetQ, KeyMetricQ, AnalystEstimate } from '@/lib/fmp/financials';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ ticker: string }>;
}

/** Format "2024-09-30" → "Q3 '24" */
function fmtQuarter(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const q = Math.ceil(m / 3);
  return `Q${q} '${String(y).slice(-2)}`;
}

/** Build a range label like "Q2 '23 – Q2 '25" from oldest-first date strings */
function dateRangeLabel(dates: string[]): string | undefined {
  if (dates.length < 2) return undefined;
  return `${fmtQuarter(dates[0])} – ${fmtQuarter(dates[dates.length - 1])}`;
}

// ── Build the five metric cards from quarterly FMP data (server-side) ─────────

function buildFiveCards(
  income: IncomeQ[],
  cashFlow: CashFlowQ[],
  balanceSheet: BalanceSheetQ[],
  keyMetrics: KeyMetricQ[],
  unavailable: boolean,
  forwardPE: number | null = null,
  forwardEps: number | null = null,
): MetricCardData[] {
  const noData = unavailable || income.length < 4;

  // Revenue & Growth
  let revenueCard: MetricCardData;
  if (noData) {
    revenueCard = {
      id: 'revenue', label: 'Revenue & Growth', color: 'emerald',
      primary: '—', primarySuffix: '', secondary: '—', secondaryLabel: '',
      secondaryPositive: null, spark: [], noData: true,
    };
  } else {
    const ttmRev = income.slice(0, 4).reduce((s, q) => s + q.revenue, 0);
    const pyRev  = income.slice(4, 8).reduce((s, q) => s + q.revenue, 0);
    const growth = pyRev > 0 ? (ttmRev / pyRev - 1) : null;
    const revSlice = [...income].reverse().slice(-8);
    const spark  = revSlice.map((q) => ({ v: q.revenue }));
    revenueCard = {
      id: 'revenue', label: 'Revenue & Growth', color: 'emerald',
      primary: fmtB(ttmRev), primarySuffix: 'TTM',
      secondary: growth != null ? formatPercent(growth) : '—',
      secondaryLabel: 'YoY',
      secondaryPositive: growth != null ? growth >= 0 : null,
      spark, dateRange: dateRangeLabel(revSlice.map(q => q.date)), noData: false,
    };
  }

  // Profitability
  let profCard: MetricCardData;
  if (noData) {
    profCard = {
      id: 'profitability', label: 'Profitability', color: 'blue',
      primary: '—', primarySuffix: '', secondary: '—', secondaryLabel: '',
      secondaryPositive: null, spark: [], noData: true,
    };
  } else {
    const ttmRev   = income.slice(0, 4).reduce((s, q) => s + q.revenue, 0);
    const ttmOp    = income.slice(0, 4).reduce((s, q) => s + q.operatingIncome, 0);
    const pyRev    = income.slice(4, 8).reduce((s, q) => s + q.revenue, 0);
    const pyOp     = income.slice(4, 8).reduce((s, q) => s + q.operatingIncome, 0);
    const margin   = ttmRev > 0 ? ttmOp / ttmRev : null;
    const pyMargin = pyRev > 0 ? pyOp / pyRev : null;
    const delta    = margin != null && pyMargin != null ? margin - pyMargin : null;
    const profSlice = [...income].reverse().slice(-8);
    const spark    = profSlice.map((q) => ({ v: q.operatingIncomeRatio * 100 }));
    profCard = {
      id: 'profitability', label: 'Profitability', color: 'blue',
      primary: margin != null ? pctAbs(margin) : '—', primarySuffix: 'op. margin',
      secondary: delta != null ? formatPercent(delta) : '—',
      secondaryLabel: 'YoY chg',
      secondaryPositive: delta != null ? delta >= 0 : null,
      spark, dateRange: dateRangeLabel(profSlice.map(q => q.date)), noData: false,
    };
  }

  // Cash Generation
  let cashCard: MetricCardData;
  if (noData || cashFlow.length < 4) {
    cashCard = {
      id: 'cashgen', label: 'Cash Generation', color: 'cyan',
      primary: '—', primarySuffix: '', secondary: '—', secondaryLabel: '',
      secondaryPositive: null, spark: [], noData: true,
    };
  } else {
    const last4CF = cashFlow.slice(0, 4);
    const ttmRev  = income.slice(0, 4).reduce((s, q) => s + q.revenue, 0);
    const ttmFCF  = last4CF.reduce((s, q) => {
      const fcf = q.freeCashFlow ?? (q.operatingCashFlow + q.capitalExpenditure);
      return s + fcf;
    }, 0);
    const fcfMargin = ttmRev > 0 ? ttmFCF / ttmRev : null;
    const cfSlice = [...cashFlow].reverse().slice(-8);
    const spark = cfSlice.map((q) => ({
      v: q.freeCashFlow ?? (q.operatingCashFlow + q.capitalExpenditure),
    }));
    cashCard = {
      id: 'cashgen', label: 'Cash Generation', color: 'cyan',
      primary: fmtB(ttmFCF), primarySuffix: 'FCF TTM',
      secondary: fcfMargin != null ? pctAbs(fcfMargin) : '—',
      secondaryLabel: 'FCF margin',
      secondaryPositive: ttmFCF > 0,
      spark, dateRange: dateRangeLabel(cfSlice.map(q => q.date)), noData: false,
    };
  }

  // Valuation — sparkline shows rolling TTM EPS trend (since quarterly PE history is premium)
  let valCard: MetricCardData;
  if (noData || keyMetrics.length === 0) {
    valCard = {
      id: 'valuation', label: 'Valuation', color: 'violet',
      primary: '—', primarySuffix: '', secondary: '—', secondaryLabel: '',
      secondaryPositive: null, spark: [], noData: true,
    };
  } else {
    const latest = keyMetrics[0];
    const pe     = latest.peRatio ?? null;
    // Build rolling TTM EPS: each point = sum of 4 consecutive quarters' diluted EPS
    const ttmEpsSpark: { v: number }[] = [];
    const ttmEpsDates: string[] = [];
    for (let i = 0; i + 3 < income.length; i++) {
      const ttmEps = income.slice(i, i + 4).reduce((s, q) => s + (q.epsDiluted ?? 0), 0);
      ttmEpsSpark.push({ v: ttmEps });
      ttmEpsDates.push(income[i].date);
    }
    ttmEpsSpark.reverse(); // oldest first for sparkline
    ttmEpsDates.reverse();
    const displayPE = forwardPE ?? pe;
    const peLabel = forwardPE != null ? 'Fwd P/E' : 'TTM P/E';

    // Compute PEG ourselves: Forward P/E / expected EPS growth rate (%)
    // FMP's pre-calculated PEG is unreliable, so we derive from analyst estimates
    let computedPeg: number | null = null;
    if (displayPE != null && forwardEps != null && forwardEps > 0 && income.length >= 4) {
      const ttmEps = income.slice(0, 4).reduce((s, q) => s + (q.epsDiluted ?? 0), 0);
      if (ttmEps > 0) {
        const growthPct = ((forwardEps / ttmEps) - 1) * 100; // e.g. 20 for 20% growth
        if (growthPct > 0) {
          computedPeg = displayPE / growthPct;
        }
      }
    }

    valCard = {
      id: 'valuation', label: 'Valuation', color: 'violet',
      primary: displayPE != null ? formatMultiple(displayPE) : '—', primarySuffix: peLabel,
      secondary: computedPeg != null ? formatMultiple(computedPeg) : '—',
      secondaryLabel: 'PEG',
      secondaryPositive: null,
      spark: ttmEpsSpark, dateRange: dateRangeLabel(ttmEpsDates), noData: false,
    };
  }

  // Financial Health
  let healthCard: MetricCardData;
  if (noData || balanceSheet.length === 0) {
    healthCard = {
      id: 'health', label: 'Financial Health', color: 'amber',
      primary: '—', primarySuffix: '', secondary: '—', secondaryLabel: '',
      secondaryPositive: null, spark: [], noData: true,
    };
  } else {
    const latest  = balanceSheet[0];
    const netDebt = latest.netDebt ?? (latest.totalDebt - latest.cashAndCashEquivalents);
    const netCash = -netDebt;
    const bsSlice = [...balanceSheet].reverse().slice(-8);
    const spark   = bsSlice.map((q) => ({
      v: -(q.netDebt ?? (q.totalDebt - q.cashAndCashEquivalents)),
    }));
    healthCard = {
      id: 'health', label: 'Financial Health', color: 'amber',
      primary: fmtB(Math.abs(netCash)),
      primarySuffix: netCash >= 0 ? 'net cash' : 'net debt',
      secondary: fmtB(latest.cashAndCashEquivalents),
      secondaryLabel: 'cash',
      secondaryPositive: netCash >= 0,
      spark, dateRange: dateRangeLabel(bsSlice.map(q => q.date)), noData: false,
    };
  }

  return [revenueCard, profCard, cashCard, valCard, healthCard];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CompanyPage({ params }: Props) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const [holding] = await db.select().from(holdings).where(eq(holdings.ticker, symbol));
  if (!holding) notFound();

  const [quote, blob, analystEstimate] = await Promise.all([
    fetchQuote(symbol).catch(() => null),
    getFundamentals(symbol),
    fetchAnalystEstimates(symbol).catch(() => null),
  ]);

  const livePrice       = quote && !quote.unavailable ? quote.price        : null;
  const dailyChangeAmt  = quote && !quote.unavailable ? quote.change        : null;
  const dailyChangePct  = quote && !quote.unavailable ? quote.changePercentage : null;
  const marketValue     = holding.shares && livePrice ? holding.shares * livePrice : null;
  const unrealizedPL    =
    holding.shares && holding.costBasis && livePrice
      ? (livePrice - holding.costBasis) * holding.shares
      : null;
  const unrealizedPLPct =
    holding.costBasis && livePrice
      ? (livePrice - holding.costBasis) / holding.costBasis
      : null;

  // Compute forward P/E from analyst estimates (only if EPS > 0)
  const forwardEps = analystEstimate?.epsAvg ?? null;
  const forwardPE = forwardEps && forwardEps > 0 && livePrice
    ? livePrice / forwardEps
    : null;

  const fiveCards = buildFiveCards(
    blob.income, blob.cashFlow, blob.balanceSheet, blob.keyMetrics, blob.unavailable, forwardPE, forwardEps,
  );

  // ── Sector-relative performance chart data (up to 1Y for range toggle) ──
  const sectorEtf = holding.sectorEtf ?? 'XLK'; // fallback to XLK if no sector ETF
  let relativePerfData: RelativePerfPoint[] = [];
  try {
    await ensureAllPriceHistory([symbol, sectorEtf, 'SPY'], 400);
    const aligned = await getAlignedPriceHistory([symbol, sectorEtf, 'SPY'], 260);
    const stockNorm = normalizeTo100(aligned.get(symbol) ?? []);
    const etfNorm   = normalizeTo100(aligned.get(sectorEtf.toUpperCase()) ?? []);
    const spyNorm   = normalizeTo100(aligned.get('SPY') ?? []);
    if (stockNorm.length > 0 && etfNorm.length > 0 && spyNorm.length > 0) {
      relativePerfData = stockNorm.map((pt, i) => ({
        date: pt.date,
        stock: pt.value,
        sectorEtf: etfNorm[i]?.value ?? 100,
        spy: spyNorm[i]?.value ?? 100,
      }));
    }
  } catch {
    // Degrade gracefully
  }

  // ── Intraday data for 1D/5D toggles ──
  let intradayPerfData: RelativePerfPoint[] = [];
  try {
    const intradayAligned = await getAlignedIntradayHistory([symbol, sectorEtf, 'SPY']);
    const stockIntra = intradayAligned.get(symbol) ?? [];
    const etfIntra = intradayAligned.get(sectorEtf.toUpperCase()) ?? [];
    const spyIntra = intradayAligned.get('SPY') ?? [];
    if (stockIntra.length > 0 && etfIntra.length > 0 && spyIntra.length > 0) {
      // Normalize each to 100 at start
      const s0 = stockIntra[0].close;
      const e0 = etfIntra[0].close;
      const p0 = spyIntra[0].close;
      if (s0 > 0 && e0 > 0 && p0 > 0) {
        intradayPerfData = stockIntra.map((pt, i) => ({
          date: pt.date,
          stock: (pt.close / s0) * 100,
          sectorEtf: (etfIntra[i]?.close / e0) * 100,
          spy: (spyIntra[i]?.close / p0) * 100,
        }));
      }
    }
  } catch {
    // Degrade gracefully
  }

  // ── Overlay self forward P/E on the cached peer row ──
  const selfRow = blob.peerRows.find((r) => r.isSelf);
  if (selfRow) {
    selfRow.forwardPeRatio = forwardPE;
  }

  // ── P/E percentile among peers ──
  let pePercentile: number | null = null;
  if (selfRow?.peRatio != null) {
    const peerPEs = blob.peerRows.filter((r) => r.peRatio != null).map((r) => r.peRatio!);
    if (peerPEs.length >= 2) {
      pePercentile = percentileRank(selfRow.peRatio, peerPEs);
    }
  }

  // ── Latest AI scan for this ticker ──
  let latestScan: AnalysisScan | null = null;
  try {
    const [scanRow] = await db.select().from(analysisScans)
      .where(eq(analysisScans.ticker, symbol))
      .orderBy(desc(analysisScans.scannedAt))
      .limit(1);
    if (scanRow) {
      latestScan = deserializeScan(scanRow);
      // Overlay forward outlooks onto five cards from scan data
      if (latestScan.fiveMetrics) {
        const fm = latestScan.fiveMetrics;
        const fmKeys = ['revenue', 'profitability', 'cashGeneration', 'valuation', 'financialHealth'] as const;
        for (let i = 0; i < fiveCards.length && i < fmKeys.length; i++) {
          const outlook = fm[fmKeys[i]]?.forwardOutlook;
          if (outlook) fiveCards[i].forwardOutlook = outlook;
        }
      }
    }
  } catch {
    // Degrade gracefully
  }

  // Driver summary for header
  const driverSummary = latestScan?.bucketPrimary
    ? `${BUCKET_LABELS[latestScan.bucketPrimary]}${latestScan.bucketConfidence ? ` (${latestScan.bucketConfidence} confidence)` : ''}`
    : null;

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
        ← Portfolio
      </Link>

      {/* ── Header + Driver Banner (inline) ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-3xl font-bold text-gray-100 font-mono tracking-tight shrink-0">{symbol}</h1>
          <span className="text-gray-700 text-xl font-light shrink-0">—</span>
          <p className="text-gray-300 text-base font-medium truncate">
            {holding.companyName ?? symbol}
          </p>
          <span className="text-gray-700 shrink-0">|</span>
          <p className="text-sm text-gray-400 truncate">
            {driverSummary ?? `Run scan to analyze what's driving ${symbol}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {blob.cachedAt && (
            <span className="text-[13px] text-gray-600 font-mono">
              data cached {formatRelativeTime(blob.cachedAt)}
            </span>
          )}
          <RefreshButton ticker={symbol} />
        </div>
      </div>

      {/* ── Compact Stats Strip ── */}
      <div className="flex items-center flex-wrap gap-y-2">
        <DailyGainStat
          changeAmt={dailyChangeAmt}
          changePct={dailyChangePct}
          unrealizedPL={unrealizedPL}
          unrealizedPLPct={unrealizedPLPct}
        />
        <StatDivider />
        <CompactStat
          label="Current Price"
          value={livePrice != null ? `$${livePrice.toFixed(2)}` : '—'}
        />
        <StatDivider />
        <CompactStat
          label="Cost Basis"
          value={holding.costBasis != null ? formatCurrency(holding.costBasis, false) : null}
          note={holding.costBasis != null ? 'per share' : undefined}
        />
        <StatDivider />
        <CompactStat
          label="Market Value"
          value={
            holding.shares == null ? null :
            marketValue != null ? formatCurrency(marketValue) :
            '—'
          }
          note={marketValue != null ? `${holding.shares!.toLocaleString()} sh` : undefined}
        />
        <StatDivider />
        <CompactStat
          label="Beta"
          value={holding.beta != null ? holding.beta.toFixed(2) : '—'}
          note={
            holding.beta != null
              ? holding.beta > 1.2 ? 'high vol' : holding.beta < 0.8 ? 'low vol' : 'mkt-corr'
              : undefined
          }
        />
      </div>

      {/* ── Two-column draggable panel grid ── */}
      <CompanyGridLoader
        ticker={symbol}
        sectorEtf={sectorEtf}
        initialThesis={holding.thesis}
        fiveCards={fiveCards}
        income={blob.income}
        cashFlow={blob.cashFlow}
        balanceSheet={blob.balanceSheet}
        peerRows={blob.peerRows}
        segments={blob.segments ?? []}
        relativePerfData={relativePerfData}
        intradayPerfData={intradayPerfData}
        pePercentile={pePercentile}
        annualIncome={blob.annualIncome ?? []}
        annualCashFlow={blob.annualCashFlow ?? []}
        analystEstimates={blob.analystEstimates ?? []}
        quarterlyEstimates={blob.quarterlyEstimates ?? []}
        latestScan={latestScan}
      />
    </div>
  );
}

// ── DailyGainStat ─────────────────────────────────────────────────────────────

function DailyGainStat({
  changeAmt,
  changePct,
  unrealizedPL,
  unrealizedPLPct,
}: {
  changeAmt: number | null;
  changePct: number | null;
  unrealizedPL: number | null;
  unrealizedPLPct: number | null;
}) {
  const hasData = changeAmt !== null && changePct !== null;
  const up = hasData && changeAmt! >= 0;
  const dayColor = up ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="flex flex-col gap-0.5 pl-0 pr-4">
      <p className="text-[13px] font-semibold text-gray-600 uppercase tracking-widest">Daily Gain</p>
      {!hasData ? (
        <span className="text-sm font-semibold font-mono text-gray-500">—</span>
      ) : (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm font-semibold font-mono ${dayColor}`}>
              {changeAmt! >= 0 ? '+' : ''}${Math.abs(changeAmt!).toFixed(2)}
            </span>
            <span className={`text-[13px] font-mono ${dayColor}`}>
              ({changePct! >= 0 ? '+' : ''}{changePct!.toFixed(2)}%)
            </span>
          </div>
          {unrealizedPL !== null && unrealizedPLPct !== null && (
            <div className="flex items-baseline gap-1">
              <span className="text-[13px] text-gray-600">Unrlzd</span>
              <span className={`text-[13px] font-mono font-medium ${unrealizedPL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {unrealizedPL >= 0 ? '+' : ''}${Math.abs(unrealizedPL).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
              <span className={`text-[13px] font-mono ${unrealizedPL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ({unrealizedPLPct! >= 0 ? '+' : ''}{(unrealizedPLPct! * 100).toFixed(1)}%)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CompactStat ───────────────────────────────────────────────────────────────

function CompactStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4">
      <p className="text-[13px] font-semibold text-gray-600 uppercase tracking-widest">{label}</p>
      <div className="flex items-baseline gap-1.5">
        {value != null ? (
          <span className="text-sm font-semibold font-mono text-gray-200">{value}</span>
        ) : (
          <Link href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            add →
          </Link>
        )}
        {note && <span className="text-[13px] text-gray-600">{note}</span>}
      </div>
    </div>
  );
}

function StatDivider() {
  return <div className="w-px h-7 bg-gray-800 mx-1" />;
}

// ── Relative time (used for cache freshness indicator) ────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  return `${diffHours}h ago`;
}
