/**
 * Singleton scan manager — owns scan execution and state in module scope.
 * The running scan survives client disconnects / page navigations.
 */

import { db } from '@/lib/db';
import { holdings, analysisScans, regimeSnapshots } from '@/lib/db/schema';
import { fetchQuotes } from '@/lib/fmp/quotes';
import { getFundamentals } from '@/lib/fmp/fundamentals-cache';
import { ensureAllPriceHistory, getAlignedPriceHistory } from '@/lib/fmp/prices';
import { normalizeTo100, percentileRank } from '@/lib/analysis/correlation';
import { analyzeStock } from '@/lib/claude/pipeline';
import { analyzePortfolio } from '@/lib/claude/portfolio-scan';
import { deserializeScan } from '@/utils/deserialize-scan';
import { REGIME_TTL_HOURS } from '@/lib/config/constants';
import { selectSteps, isStale, ALL_STEPS, type ScanMode, type StepName } from '@/lib/scan/delta';
import { desc } from 'drizzle-orm';
import type { AnalysisScan, RegimeSnapshot } from '@/types';
import type { RelativePerfPoint } from '@/components/company/SectorRelativeChart';

export type { ScanMode };

const STEP_LABELS: Record<StepName, string> = {
  news: 'news & sentiment',
  fundamentals: 'fundamental analysis',
  sector: 'sector relative',
  bucket: 'bucket assignment',
  thesis: 'thesis check',
  catalysts: 'catalyst scan',
};

export interface ScanProgress {
  event: 'progress' | 'error' | 'complete';
  data: Record<string, unknown>;
}

export interface ScanState {
  running: boolean;
  progress: ScanProgress[];
  currentTicker: string | null;
  currentStep: string | null;
  currentIdx: number;
  totalTickers: number;
  message: string;
  /** Requested mode for the current run */
  mode: ScanMode;
  /** Claude steps actually executed so far (skipped cached steps don't count) */
  stepsRun: number;
  /** Steps that would have run if nothing were cached */
  stepsPossible: number;
  error?: string;
}

// ── Module-level state ──
let scanState: ScanState = {
  running: false,
  progress: [],
  currentTicker: null,
  currentStep: null,
  currentIdx: 0,
  totalTickers: 0,
  message: '',
  mode: 'auto',
  stepsRun: 0,
  stepsPossible: 0,
};

let scanPromise: Promise<void> | null = null;
let progressCursor = 0; // not used here, but clients track their own cursor

function pushEvent(event: ScanProgress['event'], data: Record<string, unknown>) {
  scanState.progress.push({ event, data });
}

function resetState(mode: ScanMode) {
  scanState = {
    running: true,
    progress: [],
    currentTicker: null,
    currentStep: null,
    currentIdx: 0,
    totalTickers: 0,
    message: 'Starting scan...',
    mode,
    stepsRun: 0,
    stepsPossible: 0,
  };
}

/** Start a scan. Returns false if one is already running.
 *  'auto' (default) re-runs only steps whose cache TTL has expired;
 *  'full' forces every step to re-run. */
export function startScan(mode: ScanMode = 'auto'): boolean {
  if (scanState.running) return false;

  resetState(mode);
  scanPromise = runScan(mode).finally(() => {
    scanState.running = false;
    scanPromise = null;
  });

  return true;
}


export function getScanState(): ScanState {
  return scanState;
}

export function isScanRunning(): boolean {
  return scanState.running;
}

/**
 * Return new progress events since the given cursor.
 * Returns { events, cursor } where cursor should be passed back next call.
 */
export function getProgressSince(cursor: number): { events: ScanProgress[]; cursor: number } {
  const events = scanState.progress.slice(cursor);
  return { events, cursor: scanState.progress.length };
}

// ── Scan execution (lifted from route.ts) ──

async function runScan(mode: ScanMode) {
  try {
    // 1. Fetch all holdings
    const allHoldings = await db.select().from(holdings);
    if (allHoldings.length === 0) {
      scanState.message = 'No holdings found. Add stocks first.';
      pushEvent('error', { message: scanState.message });
      return;
    }

    // Latest scan per ticker — the basis for delta step selection
    const priorScans = await db.select().from(analysisScans).orderBy(desc(analysisScans.scannedAt));
    const priorByTicker = new Map<string, AnalysisScan>();
    for (const row of priorScans) {
      if (!priorByTicker.has(row.ticker)) priorByTicker.set(row.ticker, deserializeScan(row));
    }

    // 2. Fetch quotes
    const tickers = allHoldings.map((h) => h.ticker);
    const sectorEtfs = [...new Set(allHoldings.map((h) => h.sectorEtf).filter(Boolean))] as string[];
    const allQuoteTickers = [...new Set([...tickers, 'SPY', ...sectorEtfs])];

    scanState.totalTickers = allHoldings.length;
    scanState.message = 'Fetching market data...';
    pushEvent('progress', { message: scanState.message, currentTicker: 0, totalTickers: allHoldings.length });

    const quotes = await fetchQuotes(allQuoteTickers);
    const spyQuote = quotes['SPY'];

    if (!spyQuote) {
      scanState.message = 'Could not fetch SPY quote';
      pushEvent('error', { message: scanState.message });
      return;
    }

    // 3. Per-stock analysis
    for (let i = 0; i < allHoldings.length; i++) {
      const holding = allHoldings[i];
      const ticker = holding.ticker;
      const quote = quotes[ticker];

      if (!quote) {
        pushEvent('error', { ticker, step: 'quote', message: `No quote for ${ticker}` });
        continue;
      }

      const previous = priorByTicker.get(ticker) ?? null;
      const stepsToRun = selectSteps({
        mode,
        previous,
        holding,
        dailyChangePercent: quote.changePercentage,
      });
      scanState.stepsPossible += ALL_STEPS.length;
      scanState.stepsRun += stepsToRun.size;
      const cachedCount = ALL_STEPS.length - stepsToRun.size;

      scanState.currentTicker = ticker;
      scanState.currentIdx = i + 1;
      scanState.currentStep = 'starting';
      scanState.message = cachedCount > 0
        ? `Analyzing ${ticker} (${i + 1} of ${allHoldings.length})... ${cachedCount} step${cachedCount === 1 ? '' : 's'} cached`
        : `Analyzing ${ticker} (${i + 1} of ${allHoldings.length})...`;
      pushEvent('progress', {
        message: scanState.message,
        ticker,
        currentTicker: i + 1,
        totalTickers: allHoldings.length,
        step: 'starting',
        stepsToRun: [...stepsToRun],
        cachedSteps: cachedCount,
      });

      try {
        const blob = await getFundamentals(ticker);

        const sectorEtf = holding.sectorEtf ?? 'XLK';
        let relativePerfData: RelativePerfPoint[] = [];
        let pePercentile: number | null = null;

        try {
          await ensureAllPriceHistory([ticker, sectorEtf, 'SPY'], 252);
          const aligned = await getAlignedPriceHistory([ticker, sectorEtf, 'SPY'], 252);
          const stockPrices = aligned.get(ticker) ?? [];
          const sectorPrices = aligned.get(sectorEtf) ?? [];
          const spyPrices = aligned.get('SPY') ?? [];

          if (stockPrices.length >= 2) {
            const stockNorm = normalizeTo100(stockPrices);
            const sectorNorm = normalizeTo100(sectorPrices);
            const spyNorm = normalizeTo100(spyPrices);
            relativePerfData = stockPrices.map((p, idx) => ({
              date: p.date,
              stock: stockNorm[idx]?.value ?? 100,
              sectorEtf: sectorNorm[idx]?.value ?? 100,
              spy: spyNorm[idx]?.value ?? 100,
            }));
          }

          const peerPEs = blob.peerRows
            .filter((r) => !r.isSelf && r.peRatio != null)
            .map((r) => r.peRatio!);
          const selfPE = blob.peerRows.find((r) => r.isSelf)?.peRatio;
          if (selfPE != null && peerPEs.length > 0) {
            pePercentile = Math.round(percentileRank(selfPE, peerPEs));
          }
        } catch {
          // Price data unavailable — continue with empty
        }

        const sectorEtfQuote = quotes[sectorEtf] ?? null;

        await analyzeStock({
          ticker,
          holding,
          quote,
          fundamentalsBlob: blob,
          spyQuote,
          sectorEtfQuote,
          relativePerfData,
          pePercentile,
          stepsToRun,
          previous,
          onStep: (step) => {
            scanState.currentStep = step;
            scanState.message = `Analyzing ${ticker} (${i + 1} of ${allHoldings.length})... ${STEP_LABELS[step]}`;
            pushEvent('progress', {
              message: scanState.message,
              ticker,
              currentTicker: i + 1,
              totalTickers: allHoldings.length,
              step,
            });
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Scan] Failed to analyze ${ticker}:`, msg);
        pushEvent('error', { ticker, message: msg.slice(0, 200) });
      }
    }

    // 4. Portfolio-level analysis
    scanState.currentTicker = null;
    scanState.currentStep = 'portfolio';
    scanState.message = 'Running portfolio-level analysis...';
    pushEvent('progress', { message: scanState.message, step: 'portfolio' });

    const recentScans = await db.select().from(analysisScans).orderBy(desc(analysisScans.scannedAt));
    const latestByTicker = new Map<string, typeof recentScans[0]>();
    for (const scan of recentScans) {
      if (!latestByTicker.has(scan.ticker)) {
        latestByTicker.set(scan.ticker, scan);
      }
    }
    const latestScansList = [...latestByTicker.values()].map(deserializeScan);

    // Regime is a market-wide signal — reuse a recent snapshot on a delta scan
    // rather than paying for another web-search call. Anomaly detection always
    // re-runs; it is cheap and depends on today's prices.
    const [lastRegime] = await db.select().from(regimeSnapshots)
      .orderBy(desc(regimeSnapshots.snappedAt)).limit(1);
    const reuseRegime = mode === 'auto' && lastRegime
      ? !isStale(lastRegime.snappedAt, REGIME_TTL_HOURS)
      : false;
    scanState.stepsPossible += 1;
    if (!reuseRegime) scanState.stepsRun += 1;

    await analyzePortfolio({
      holdings: allHoldings,
      quotes,
      latestScans: latestScansList,
      cachedRegime: reuseRegime ? (lastRegime as RegimeSnapshot) : null,
      onStep: (step) => {
        scanState.currentStep = step;
        scanState.message = step === 'regime' ? 'Checking market regime...' : 'Detecting anomalies...';
        pushEvent('progress', { message: scanState.message, step });
      },
    });

    const skipped = scanState.stepsPossible - scanState.stepsRun;
    scanState.message = skipped > 0
      ? `Scan complete — analyzed ${allHoldings.length} stocks (${skipped} cached step${skipped === 1 ? '' : 's'} skipped)`
      : `Scan complete — analyzed ${allHoldings.length} stocks`;
    pushEvent('complete', {
      scannedCount: allHoldings.length,
      message: scanState.message,
      mode,
      stepsRun: scanState.stepsRun,
      stepsSkipped: skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    scanState.error = msg;
    scanState.message = `Scan failed: ${msg.slice(0, 200)}`;
    pushEvent('error', { message: scanState.message });
  }
}
