import { db } from '@/lib/db';
import { holdings, analysisScans, regimeSnapshots, anomalyFlags } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { fetchQuotes, QuoteData } from '@/lib/fmp/quotes';
import { ensureAllPriceHistory, getAlignedPriceHistory } from '@/lib/fmp/prices';
import { buildCorrelationMatrix, CorrelationMatrix } from '@/lib/analysis/correlation';
import { Holding, AnalysisScan, RegimeSnapshot, AnomalyFlag } from '@/types';
import { formatCurrency } from '@/utils/format';
import { deserializeScan } from '@/utils/deserialize-scan';
import { DashboardGridLoader } from '@/components/dashboard/DashboardGridLoader';
import { ScanProvider } from '@/components/dashboard/ScanContext';
import { CommandStripScanButton } from '@/components/dashboard/CommandStripScanButton';
import { REGIME_LABELS } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

function sortHoldings(rows: Holding[], quotes: Record<string, QuoteData>): Holding[] {
  return [...rows].sort((a, b) => {
    const aVal = a.shares && quotes[a.ticker] ? a.shares * quotes[a.ticker].price : null;
    const bVal = b.shares && quotes[b.ticker] ? b.shares * quotes[b.ticker].price : null;
    if (aVal != null && bVal != null) return bVal - aVal;
    if (aVal != null) return -1;
    if (bVal != null) return 1;
    return a.ticker.localeCompare(b.ticker);
  });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const REGIME_DOTS: Record<string, string> = {
  risk_on: 'bg-emerald-400',
  risk_off: 'bg-red-400',
  rotation: 'bg-amber-400',
  dislocation: 'bg-red-600',
};

export default async function DashboardPage() {
  const allHoldings = await db.select().from(holdings);

  const tickers = allHoldings.map((h) => h.ticker);
  let quotes: Record<string, QuoteData> = {};
  let spyQuote: QuoteData | null = null;

  if (tickers.length > 0) {
    try {
      quotes = await fetchQuotes([...tickers, 'SPY']);
      spyQuote = quotes['SPY'] ?? null;
    } catch {
      // Quotes unavailable — degrade gracefully
    }
  }

  const sorted = sortHoldings(allHoldings, quotes);

  const holdingsWithBeta = allHoldings.filter((h) => h.beta != null);
  const avgBeta =
    holdingsWithBeta.length > 0
      ? holdingsWithBeta.reduce((s, h) => s + h.beta!, 0) / holdingsWithBeta.length
      : null;

  const portfolioValue = allHoldings.reduce((sum, h) => {
    if (h.shares && quotes[h.ticker]) return sum + h.shares * quotes[h.ticker].price;
    return sum;
  }, 0);

  const hasPortfolioValue = portfolioValue > 0;

  // Daily P&L
  let dailyPL = 0;
  let dailyPLPct = 0;
  let hasDailyPL = false;
  if (hasPortfolioValue) {
    let prevDayValue = 0;
    for (const h of allHoldings) {
      const q = quotes[h.ticker];
      if (h.shares && q && !q.unavailable) {
        dailyPL += h.shares * q.change;
        prevDayValue += h.shares * q.previousClose;
      }
    }
    dailyPLPct = prevDayValue > 0 ? (dailyPL / prevDayValue) * 100 : 0;
    hasDailyPL = prevDayValue > 0;
  }

  // ── AI scan data ──
  const latestScans: Record<string, AnalysisScan> = {};
  let regime: RegimeSnapshot | null = null;
  let activeAnomalies: AnomalyFlag[] = [];
  let lastScanTime: string | null = null;

  try {
    // Latest scan per ticker
    const recentScans = await db.select().from(analysisScans).orderBy(desc(analysisScans.scannedAt));
    const seen = new Set<string>();
    for (const row of recentScans) {
      if (!seen.has(row.ticker)) {
        seen.add(row.ticker);
        latestScans[row.ticker] = deserializeScan(row);
        if (!lastScanTime || row.scannedAt > lastScanTime) lastScanTime = row.scannedAt;
      }
    }

    // Latest regime
    const [latestRegime] = await db.select().from(regimeSnapshots).orderBy(desc(regimeSnapshots.snappedAt)).limit(1);
    if (latestRegime) {
      regime = latestRegime as RegimeSnapshot;
    }

    // Active anomalies
    activeAnomalies = (await db.select().from(anomalyFlags).where(eq(anomalyFlags.resolved, 0))) as AnomalyFlag[];
  } catch {
    // Degrade gracefully
  }

  // Thesis counts from scans
  let thesisConfirmed = 0;
  let thesisPressure = 0;
  let thesisChallenged = 0;
  let thesisUnset = 0;
  const thesisAtRisk: Array<{ ticker: string; analysis: string }> = [];

  for (const h of allHoldings) {
    const scan = latestScans[h.ticker];
    if (!scan?.thesisStatus || !h.thesis?.trim()) {
      thesisUnset++;
    } else if (scan.thesisStatus === 'confirmed') {
      thesisConfirmed++;
    } else if (scan.thesisStatus === 'challenged') {
      thesisChallenged++;
      thesisAtRisk.push({ ticker: h.ticker, analysis: scan.thesisAnalysis?.today.explanation || 'Thesis challenged' });
    } else {
      thesisPressure++;
    }
  }

  // ── Correlation matrix ──
  let correlationData: CorrelationMatrix | null = null;
  if (tickers.length >= 2) {
    try {
      const holdingTickers = [...new Set(tickers)].filter(t => t !== 'SPY').sort();
      const mid = Math.floor(holdingTickers.length / 2);
      const corrTickers = [...holdingTickers.slice(0, mid), 'SPY', ...holdingTickers.slice(mid)];
      await ensureAllPriceHistory(corrTickers, 120);
      const aligned = await getAlignedPriceHistory(corrTickers, 90);
      correlationData = buildCorrelationMatrix(aligned, corrTickers);
    } catch {
      // Degrade gracefully
    }
  }

  const flaggedCount = activeAnomalies.length;

  return (
    <ScanProvider>
    <div className="space-y-3">
      {/* ── Command Strip ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-3.5">
        <div className="flex items-center gap-0 flex-wrap">
          {/* Regime */}
          <div className="flex items-center gap-3 pr-6 mr-6 border-r border-gray-800">
            <div>
              <p className="text-[13px] text-gray-400 uppercase tracking-widest font-medium">Regime</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-gray-300 text-sm font-medium">
                  {regime ? REGIME_LABELS[regime.regime] ?? regime.regime : 'Not scanned'}
                </span>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${regime ? REGIME_DOTS[regime.regime] ?? 'bg-gray-500' : 'bg-gray-700'}`} />
              </div>
            </div>
          </div>

          {/* SPY indicator */}
          {spyQuote && (
            <div className="pr-6 mr-6 border-r border-gray-800">
              <p className="text-[13px] text-gray-400 uppercase tracking-widest font-medium">SPY Today</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-gray-300 text-sm font-mono font-semibold">
                  ${spyQuote.price.toFixed(2)}
                </span>
                <span
                  className={`text-xs font-mono font-semibold ${
                    spyQuote.changePercentage >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {spyQuote.changePercentage >= 0 ? '+' : ''}
                  {spyQuote.changePercentage.toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-8 flex-1 flex-wrap">
            <CommandStat
              label="Portfolio Beta"
              value={avgBeta != null ? avgBeta.toFixed(2) : '—'}
              dim={avgBeta == null}
            />
            <CommandStat
              label="Positions"
              value={String(allHoldings.length)}
              dim={allHoldings.length === 0}
            />
            <div>
              <p className="text-[13px] text-gray-400 uppercase tracking-widest font-medium">Portfolio Value</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className={`text-sm font-semibold font-mono ${hasPortfolioValue ? 'text-gray-100' : 'text-gray-500'}`}>
                  {hasPortfolioValue ? formatCurrency(portfolioValue) : '—'}
                </p>
                {hasDailyPL && (
                  <span className={`text-xs font-mono font-semibold ${dailyPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {dailyPL >= 0 ? '+' : ''}{formatCurrency(dailyPL)} ({dailyPLPct >= 0 ? '+' : ''}{dailyPLPct.toFixed(2)}%)
                  </span>
                )}
                {!hasPortfolioValue && allHoldings.length > 0 && (
                  <p className="text-[13px] text-gray-500">add shares</p>
                )}
              </div>
            </div>
            <CommandStat
              label="Flagged"
              value={flaggedCount > 0 ? String(flaggedCount) : '—'}
              dim={flaggedCount === 0}
            />
            <CommandStat
              label="Last Scan"
              value={lastScanTime ? timeAgo(lastScanTime) : 'Never'}
              dim={!lastScanTime}
            />
          </div>

          {/* Scan button */}
          <div className="shrink-0 ml-4">
            <CommandStripScanButton />
          </div>

        </div>
      </div>

      {/* ── Draggable panel grid ── */}
      <DashboardGridLoader
        holdings={sorted}
        quotes={quotes}
        totalHoldings={allHoldings.length}
        thesisConfirmed={thesisConfirmed}
        thesisPressure={thesisPressure}
        thesisChallenged={thesisChallenged}
        thesisUnset={thesisUnset}
        thesisAtRisk={thesisAtRisk}
        correlationData={correlationData}
        latestScans={latestScans}
        regime={regime}
        anomalies={activeAnomalies}
      />
    </div>
    </ScanProvider>
  );
}

// ── CommandStat ───────────────────────────────────────────────────────────────

function CommandStat({
  label,
  value,
  dim = false,
  note,
}: {
  label: string;
  value: string;
  dim?: boolean;
  note?: string;
}) {
  return (
    <div>
      <p className="text-[13px] text-gray-400 uppercase tracking-widest font-medium">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <p className={`text-sm font-semibold font-mono ${dim ? 'text-gray-500' : 'text-gray-100'}`}>
          {value}
        </p>
        {note && <p className="text-[13px] text-gray-500">{note}</p>}
      </div>
    </div>
  );
}
