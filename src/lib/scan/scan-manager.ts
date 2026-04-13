/**
 * Singleton scan manager — owns scan execution and state in module scope.
 * The running scan survives client disconnects / page navigations.
 */

import { db } from '@/lib/db';
import { holdings, analysisScans } from '@/lib/db/schema';
import { fetchQuotes } from '@/lib/fmp/quotes';
import { getFundamentals } from '@/lib/fmp/fundamentals-cache';
import { ensureAllPriceHistory, getAlignedPriceHistory } from '@/lib/fmp/prices';
import { normalizeTo100, percentileRank } from '@/lib/analysis/correlation';
import { analyzeStock, type StepName } from '@/lib/claude/pipeline';
import { analyzePortfolio } from '@/lib/claude/portfolio-scan';
import { deserializeScan } from '@/utils/deserialize-scan';
import { desc } from 'drizzle-orm';
import type { RelativePerfPoint } from '@/components/company/SectorRelativeChart';

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
};

let scanPromise: Promise<void> | null = null;
let progressCursor = 0; // not used here, but clients track their own cursor

function pushEvent(event: ScanProgress['event'], data: Record<string, unknown>) {
  scanState.progress.push({ event, data });
}

function resetState() {
  scanState = {
    running: true,
    progress: [],
    currentTicker: null,
    currentStep: null,
    currentIdx: 0,
    totalTickers: 0,
    message: 'Starting scan...',
  };
}

/** Start a scan. Returns false if one is already running. */
export function startScan(): boolean {
  if (scanState.running) return false;

  resetState();
  scanPromise = runScan().finally(() => {
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

async function runScan() {
  try {
    // 1. Fetch all holdings
    const allHoldings = await db.select().from(holdings);
    if (allHoldings.length === 0) {
      scanState.message = 'No holdings found. Add stocks first.';
      pushEvent('error', { message: scanState.message });
      return;
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

      scanState.currentTicker = ticker;
      scanState.currentIdx = i + 1;
      scanState.currentStep = 'starting';
      scanState.message = `Analyzing ${ticker} (${i + 1} of ${allHoldings.length})...`;
      pushEvent('progress', {
        message: scanState.message,
        ticker,
        currentTicker: i + 1,
        totalTickers: allHoldings.length,
        step: 'starting',
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

    await analyzePortfolio({
      holdings: allHoldings,
      quotes,
      latestScans: latestScansList,
      onStep: (step) => {
        scanState.currentStep = step;
        scanState.message = step === 'regime' ? 'Checking market regime...' : 'Detecting anomalies...';
        pushEvent('progress', { message: scanState.message, step });
      },
    });

    scanState.message = `Scan complete — analyzed ${allHoldings.length} stocks`;
    pushEvent('complete', {
      scannedCount: allHoldings.length,
      message: scanState.message,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    scanState.error = msg;
    scanState.message = `Scan failed: ${msg.slice(0, 200)}`;
    pushEvent('error', { message: scanState.message });
  }
}
