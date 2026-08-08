/**
 * POST /api/scan/step — re-run a single pipeline step for one ticker.
 * Body: { ticker: string, step: 'news' | 'bucket' | 'thesis' | 'catalysts' }
 * Updates only the relevant columns in the latest analysisScans row.
 */

import { db } from '@/lib/db';
import { holdings, analysisScans } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { fetchQuotes } from '@/lib/fmp/quotes';
import { getFundamentals } from '@/lib/fmp/fundamentals-cache';
import { callClaude } from '@/lib/claude/client';
import { buildNewsSentimentPrompt } from '@/lib/claude/prompts/news-sentiment';
import { buildBucketAssignmentPrompt } from '@/lib/claude/prompts/bucket-assignment';
import { buildThesisCheckPrompt } from '@/lib/claude/prompts/thesis-check';
import { buildCatalystScanPrompt } from '@/lib/claude/prompts/catalyst-scan';
import { deserializeScan } from '@/utils/deserialize-scan';
import type { NewsSentiment, ThesisCheck, Catalyst, DriverAnalysis } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_STEPS = new Set(['news', 'bucket', 'thesis', 'catalysts']);

export async function POST(request: Request) {
  const body = await request.json();
  const { ticker, step } = body as { ticker?: string; step?: string };

  if (!ticker || !step || !VALID_STEPS.has(step)) {
    return Response.json(
      { error: `Invalid request. ticker and step (${[...VALID_STEPS].join('|')}) required.` },
      { status: 400 },
    );
  }

  const symbol = ticker.toUpperCase();

  // Load holding
  const [holding] = await db.select().from(holdings).where(eq(holdings.ticker, symbol));
  if (!holding) {
    return Response.json({ error: `Holding ${symbol} not found` }, { status: 404 });
  }

  // Load latest scan row (we'll patch it)
  const [scanRow] = await db.select().from(analysisScans)
    .where(eq(analysisScans.ticker, symbol))
    .orderBy(desc(analysisScans.scannedAt))
    .limit(1);

  const existingScan = scanRow ? deserializeScan(scanRow) : null;

  const companyName = holding.companyName ?? symbol;
  const sector = holding.sector ?? 'Unknown';

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateFields: Record<string, any> = {};

    if (step === 'news') {
      const prompt = buildNewsSentimentPrompt({ ticker: symbol, companyName, sector });
      const result = await callClaude<NewsSentiment>({
        system: prompt.system,
        userMessage: prompt.userMessage,
        webSearch: prompt.webSearch,
        maxSearches: prompt.maxSearches,
      });
      updateFields = { newsSentiment: JSON.stringify(result) };
    }

    if (step === 'bucket') {
      // Needs quote data + prior step outputs (pull from existing scan)
      const sectorEtf = holding.sectorEtf ?? 'XLK';
      const quoteTickers = [symbol, 'SPY', sectorEtf];
      const quotes = await fetchQuotes([...new Set(quoteTickers)]);
      const quote = quotes[symbol];
      const spyQuote = quotes['SPY'];

      if (!quote || !spyQuote) {
        return Response.json({ error: 'Could not fetch quotes' }, { status: 502 });
      }

      // Re-use existing scan data as context for the bucket prompt
      const newsSentiment = existingScan?.newsSentiment ?? null;

      // Pull fundamental outlook from fiveMetrics if available
      let fundamentalOutlook: Record<string, string> | null = null;
      if (existingScan?.fiveMetrics) {
        const fm = existingScan.fiveMetrics;
        fundamentalOutlook = {
          revenue: fm.revenue?.forwardOutlook ?? '',
          profitability: fm.profitability?.forwardOutlook ?? '',
          cashGeneration: fm.cashGeneration?.forwardOutlook ?? '',
          valuation: fm.valuation?.forwardOutlook ?? '',
          financialHealth: fm.financialHealth?.forwardOutlook ?? '',
        };
      }

      const sectorRelative = existingScan?.sectorRelative
        ? {
            forwardOutlook: existingScan.sectorRelative.forwardOutlook,
            premiumTrend: existingScan.sectorRelative.premiumTrend,
            relativeStrength: '', // not stored separately
          }
        : null;

      const prompt = buildBucketAssignmentPrompt({
        ticker: symbol,
        dailyChange: quote.changePercentage,
        spyChange: spyQuote.changePercentage,
        sectorEtfChange: quotes[sectorEtf]?.changePercentage ?? 0,
        newsSentiment,
        fundamentalOutlook,
        sectorRelative,
      });

      const result = await callClaude<{
        bucketPrimary: number;
        bucketSecondary: number | null;
        bucketRationale: string;
        bucketConfidence: string;
        past: DriverAnalysis['past'];
        today: DriverAnalysis['today'];
        forward: DriverAnalysis['forward'];
      }>({
        system: prompt.system,
        userMessage: prompt.userMessage,
      });

      updateFields = {
        bucketPrimary: result.bucketPrimary,
        bucketSecondary: result.bucketSecondary,
        bucketRationale: result.bucketRationale,
        bucketConfidence: result.bucketConfidence,
        driverAnalysis: JSON.stringify({
          past: result.past,
          today: result.today,
          forward: result.forward,
        }),
      };
    }

    if (step === 'thesis') {
      if (!holding.thesis?.trim()) {
        // No thesis set — write default
        const defaultCheck: ThesisCheck = {
          status: 'neutral',
          past: { summary: 'No thesis set.', evidence: [] },
          today: { explanation: 'Set an investment thesis to enable thesis tracking.' },
          forward: { outlook: 'Set a thesis to get forward outlook.', keyEvents: [] },
        };
        updateFields = {
          thesisStatus: defaultCheck.status,
          thesisAnalysis: JSON.stringify(defaultCheck),
        };
      } else {
        const newsSentiment = existingScan?.newsSentiment ?? null;
        let fundamentalOutlook: Record<string, string> | null = null;
        if (existingScan?.fiveMetrics) {
          const fm = existingScan.fiveMetrics;
          fundamentalOutlook = {
            revenue: fm.revenue?.forwardOutlook ?? '',
            profitability: fm.profitability?.forwardOutlook ?? '',
            cashGeneration: fm.cashGeneration?.forwardOutlook ?? '',
            valuation: fm.valuation?.forwardOutlook ?? '',
            financialHealth: fm.financialHealth?.forwardOutlook ?? '',
          };
        }
        const sectorRelative = existingScan?.sectorRelative
          ? {
              forwardOutlook: existingScan.sectorRelative.forwardOutlook,
              premiumTrend: existingScan.sectorRelative.premiumTrend,
              relativeStrength: '',
            }
          : null;

        const prompt = buildThesisCheckPrompt({
          ticker: symbol,
          thesis: holding.thesis,
          newsSentiment,
          fundamentalOutlook,
          sectorRelative,
        });
        const result = await callClaude<ThesisCheck>({
          system: prompt.system,
          userMessage: prompt.userMessage,
        });
        updateFields = {
          thesisStatus: result.status,
          thesisAnalysis: JSON.stringify(result),
        };
      }
    }

    if (step === 'catalysts') {
      const prompt = buildCatalystScanPrompt({
        ticker: symbol,
        companyName,
        sector,
        thesis: holding.thesis,
      });
      const result = await callClaude<Catalyst[]>({
        system: prompt.system,
        userMessage: prompt.userMessage,
        webSearch: prompt.webSearch,
        maxSearches: prompt.maxSearches,
      });
      updateFields = { catalysts: JSON.stringify(result) };
    }

    // Update existing row or insert new one. Record when this step last ran so
    // the next delta scan treats it as fresh.
    const now = new Date().toISOString();
    const stepTimestamps = JSON.stringify({
      ...(existingScan?.stepTimestamps ?? {}),
      [step]: now,
    });

    if (scanRow) {
      await db.update(analysisScans)
        .set({ ...updateFields, stepTimestamps, scannedAt: now })
        .where(eq(analysisScans.id, scanRow.id));
    } else {
      await db.insert(analysisScans).values({
        ticker: symbol,
        scanType: 'step',
        ...updateFields,
        stepTimestamps,
        scannedAt: now,
      });
    }

    return Response.json({ ok: true, step, ticker: symbol });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Scan/Step] ${step} failed for ${symbol}:`, msg);
    return Response.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
