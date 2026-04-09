import { db } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { fetchQuotes } from '@/lib/fmp/quotes';
import { getFundamentals } from '@/lib/fmp/fundamentals-cache';
import { ensureAllPriceHistory, getAlignedPriceHistory } from '@/lib/fmp/prices';
import { normalizeTo100, percentileRank } from '@/lib/analysis/correlation';
import { analyzeStock, StepName } from '@/lib/claude/pipeline';
import { analyzePortfolio } from '@/lib/claude/portfolio-scan';
import { deserializeScan } from '@/utils/deserialize-scan';
import { analysisScans } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import type { RelativePerfPoint } from '@/components/company/SectorRelativeChart';

export const dynamic = 'force-dynamic';

const STEP_LABELS: Record<StepName, string> = {
  news: 'news & sentiment',
  fundamentals: 'fundamental analysis',
  sector: 'sector relative',
  bucket: 'bucket assignment',
  thesis: 'thesis check',
  catalysts: 'catalyst scan',
};

// POST /api/scan — trigger a full portfolio scan with SSE progress
export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // 1. Fetch all holdings
        const allHoldings = await db.select().from(holdings);
        if (allHoldings.length === 0) {
          send('error', { message: 'No holdings found. Add stocks first.' });
          controller.close();
          return;
        }

        // 2. Fetch quotes
        const tickers = allHoldings.map((h) => h.ticker);
        const sectorEtfs = [...new Set(allHoldings.map((h) => h.sectorEtf).filter(Boolean))] as string[];
        const allQuoteTickers = [...new Set([...tickers, 'SPY', ...sectorEtfs])];

        send('progress', { message: 'Fetching market data...', currentTicker: 0, totalTickers: allHoldings.length });

        const quotes = await fetchQuotes(allQuoteTickers);
        const spyQuote = quotes['SPY'];

        if (!spyQuote) {
          send('error', { message: 'Could not fetch SPY quote' });
          controller.close();
          return;
        }

        // 3. Per-stock analysis
        for (let i = 0; i < allHoldings.length; i++) {
          const holding = allHoldings[i];
          const ticker = holding.ticker;
          const quote = quotes[ticker];

          if (!quote) {
            send('error', { ticker, step: 'quote', message: `No quote for ${ticker}` });
            continue;
          }

          send('progress', {
            message: `Analyzing ${ticker} (${i + 1} of ${allHoldings.length})...`,
            ticker,
            currentTicker: i + 1,
            totalTickers: allHoldings.length,
            step: 'starting',
          });

          try {
            // Fetch fundamentals
            const blob = await getFundamentals(ticker);

            // Build relative perf data
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

              // P/E percentile
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
                send('progress', {
                  message: `Analyzing ${ticker} (${i + 1} of ${allHoldings.length})... ${STEP_LABELS[step]}`,
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
            send('error', { ticker, message: msg.slice(0, 200) });
          }
        }

        // 4. Portfolio-level analysis
        send('progress', { message: 'Running portfolio-level analysis...', step: 'portfolio' });

        // Get latest scans for portfolio analysis
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
            send('progress', {
              message: step === 'regime' ? 'Checking market regime...' : 'Detecting anomalies...',
              step,
            });
          },
        });

        send('complete', {
          scannedCount: allHoldings.length,
          message: `Scan complete — analyzed ${allHoldings.length} stocks`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send('error', { message: `Scan failed: ${msg.slice(0, 200)}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
