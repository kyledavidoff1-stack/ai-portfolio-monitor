import { db } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchQuotes } from '@/lib/fmp/quotes';
import { getFundamentals } from '@/lib/fmp/fundamentals-cache';
import { ensureAllPriceHistory, getAlignedPriceHistory } from '@/lib/fmp/prices';
import { normalizeTo100, percentileRank } from '@/lib/analysis/correlation';
import { analyzeStock, StepName } from '@/lib/claude/pipeline';
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

// POST /api/refresh — refresh a single stock with SSE progress
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { ticker } = body;

  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const symbol = ticker.toUpperCase();

        // Get holding
        const [holding] = await db.select().from(holdings).where(eq(holdings.ticker, symbol));
        if (!holding) {
          send('error', { message: `${symbol} not found in holdings` });
          controller.close();
          return;
        }

        send('progress', { message: `Refreshing ${symbol}...`, step: 'starting' });

        // Fetch quote + fundamentals
        const sectorEtf = holding.sectorEtf ?? 'XLK';
        const quoteTickers = [symbol, 'SPY', sectorEtf];
        const quotes = await fetchQuotes(quoteTickers);
        const quote = quotes[symbol];
        const spyQuote = quotes['SPY'];

        if (!quote || !spyQuote) {
          send('error', { message: 'Could not fetch quotes' });
          controller.close();
          return;
        }

        const blob = await getFundamentals(symbol);

        // Build relative perf data
        let relativePerfData: RelativePerfPoint[] = [];
        let pePercentile: number | null = null;

        try {
          await ensureAllPriceHistory([symbol, sectorEtf, 'SPY'], 252);
          const aligned = await getAlignedPriceHistory([symbol, sectorEtf, 'SPY'], 252);
          const stockPrices = aligned.get(symbol) ?? [];
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
          // Continue with empty
        }

        await analyzeStock({
          ticker: symbol,
          holding,
          quote,
          fundamentalsBlob: blob,
          spyQuote,
          sectorEtfQuote: quotes[sectorEtf] ?? null,
          relativePerfData,
          pePercentile,
          onStep: (step) => {
            send('progress', {
              message: `Refreshing ${symbol}... ${STEP_LABELS[step]}`,
              step,
            });
          },
        });

        send('complete', { message: `${symbol} refresh complete` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send('error', { message: `Refresh failed: ${msg.slice(0, 200)}` });
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
