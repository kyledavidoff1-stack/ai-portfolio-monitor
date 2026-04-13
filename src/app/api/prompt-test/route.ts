/**
 * POST /api/prompt-test
 * Prompt testing endpoint — build/preview prompts and run individual pipeline steps.
 *
 * Body: { step, ticker?, mode: 'preview' | 'run', customSystem?, customUserMessage? }
 *
 * Preview mode: returns the prompt text that would be sent to Claude.
 * Run mode: sends the prompt (custom or default) to Claude and returns raw output.
 */

import { db } from '@/lib/db';
import { holdings, analysisScans, regimeSnapshots } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { fetchQuotes } from '@/lib/fmp/quotes';
import { getFundamentals } from '@/lib/fmp/fundamentals-cache';
import { ensureAllPriceHistory, getAlignedPriceHistory } from '@/lib/fmp/prices';
import { normalizeTo100, percentileRank } from '@/lib/analysis/correlation';
import { getClaudeClient, CLAUDE_MODEL } from '@/lib/claude/client';
import { buildNewsSentimentPrompt } from '@/lib/claude/prompts/news-sentiment';
import { buildFundamentalAnalysisPrompt } from '@/lib/claude/prompts/fundamental-analysis';
import { buildSectorRelativePrompt } from '@/lib/claude/prompts/sector-relative';
import { buildBucketAssignmentPrompt } from '@/lib/claude/prompts/bucket-assignment';
import { buildThesisCheckPrompt } from '@/lib/claude/prompts/thesis-check';
import { buildCatalystScanPrompt } from '@/lib/claude/prompts/catalyst-scan';
import { buildRegimeCheckPrompt } from '@/lib/claude/prompts/regime-check';
import { buildAnomalyDetectionPrompt } from '@/lib/claude/prompts/anomaly-detection';
import { deserializeScan } from '@/utils/deserialize-scan';
import type { NewsSentiment, FiveMetrics, SectorRelativeData, AnalysisScan, Regime } from '@/types';
import type { RelativePerfPoint } from '@/components/company/SectorRelativeChart';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const VALID_STEPS = ['news', 'fundamentals', 'sector', 'bucket', 'thesis', 'catalysts', 'regime', 'anomaly'] as const;
type Step = (typeof VALID_STEPS)[number];

// ── JSON extraction (mirrors client.ts logic) ────────────────────────────────

function extractJSON(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim());
  const start = text.search(/[{[]/);
  if (start === -1) throw new Error('No JSON found in response');
  const openChar = text[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) depth--;
    if (depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('Unterminated JSON in response');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getLatestScan(ticker: string): Promise<AnalysisScan | null> {
  const rows = await db
    .select()
    .from(analysisScans)
    .where(eq(analysisScans.ticker, ticker.toUpperCase()))
    .orderBy(desc(analysisScans.scannedAt))
    .limit(1);
  if (rows.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return deserializeScan(rows[0] as any);
}

/** Reconstruct fundamentalOutlook from cached fiveMetrics */
function extractFundamentalOutlook(fm: FiveMetrics | null): Record<string, string> | null {
  if (!fm) return null;
  return {
    revenue: fm.revenue.forwardOutlook ?? '',
    profitability: fm.profitability.forwardOutlook ?? '',
    cashGeneration: fm.cashGeneration.forwardOutlook ?? '',
    valuation: fm.valuation.forwardOutlook ?? '',
    financialHealth: fm.financialHealth.forwardOutlook ?? '',
  };
}

/** Reconstruct sectorRelative from cached SectorRelativeData */
function extractSectorRelative(sr: SectorRelativeData | null): { forwardOutlook: string; premiumTrend: string; relativeStrength: string } | null {
  if (!sr) return null;
  return {
    forwardOutlook: sr.forwardOutlook ?? '',
    premiumTrend: sr.premiumTrend ?? '',
    relativeStrength: '(from cache — re-run Step 3 for fresh data)',
  };
}

// ── Prompt builders per step ─────────────────────────────────────────────────

interface PromptResult {
  system: string;
  userMessage: string;
  webSearch?: boolean;
  maxSearches?: number;
}

async function buildPrompt(step: Step, ticker: string): Promise<{
  prompt: PromptResult;
  dependencies: Record<string, string>;
}> {
  const tickerUp = ticker.toUpperCase();
  const [holding] = await db.select().from(holdings).where(eq(holdings.ticker, tickerUp));
  const companyName = holding?.companyName ?? tickerUp;
  const sector = holding?.sector ?? 'Unknown';
  const sectorEtf = holding?.sectorEtf ?? 'XLK';
  const deps: Record<string, string> = {};

  switch (step) {
    // ── Step 1: News & Sentiment ──
    case 'news': {
      const prompt = buildNewsSentimentPrompt({ ticker: tickerUp, companyName, sector });
      return { prompt, dependencies: deps };
    }

    // ── Step 2: Fundamental Analysis ──
    case 'fundamentals': {
      const blob = await getFundamentals(tickerUp);
      deps.fundamentalsCache = blob.cachedAt;
      const quotes = await fetchQuotes([tickerUp]).catch(() => ({} as Record<string, { price: number }>));
      const livePrice = quotes[tickerUp]?.price ?? null;
      const forwardEps = blob.analystEstimates[0]?.epsAvg ?? null;
      if (livePrice) deps.livePrice = String(livePrice);
      if (forwardEps) deps.forwardEps = String(forwardEps);
      const prompt = buildFundamentalAnalysisPrompt({
        ticker: tickerUp,
        income: blob.income,
        cashFlow: blob.cashFlow,
        balanceSheet: blob.balanceSheet,
        keyMetrics: blob.keyMetrics,
        livePrice,
        forwardEps,
      });
      return { prompt, dependencies: deps };
    }

    // ── Step 3: Sector Relative ──
    case 'sector': {
      const blob = await getFundamentals(tickerUp);
      deps.fundamentalsCache = blob.cachedAt;

      // Compute relative perf (same as scan route)
      let relativePerf30d: { stock: number; sector: number; spy: number } | null = null;
      let relativePerf90d: { stock: number; sector: number; spy: number } | null = null;
      let pePercentile: number | null = null;

      try {
        await ensureAllPriceHistory([tickerUp, sectorEtf, 'SPY'], 252);
        const aligned = await getAlignedPriceHistory([tickerUp, sectorEtf, 'SPY'], 252);
        const stockPrices = aligned.get(tickerUp);
        const sectorPrices = aligned.get(sectorEtf);
        const spyPrices = aligned.get('SPY');
        if (stockPrices && sectorPrices && spyPrices) {
          const stockNorm = normalizeTo100(stockPrices);
          const sectorNorm = normalizeTo100(sectorPrices);
          const spyNorm = normalizeTo100(spyPrices);
          const perfData: RelativePerfPoint[] = stockPrices.map((_p, i) => ({
            date: stockNorm[i].date,
            stock: stockNorm[i].value,
            sectorEtf: sectorNorm[i].value,
            spy: spyNorm[i].value,
          }));

          if (perfData.length >= 30) {
            const s = perfData.slice(-30);
            relativePerf30d = {
              stock: ((s[s.length - 1].stock / s[0].stock) - 1) * 100,
              sector: ((s[s.length - 1].sectorEtf / s[0].sectorEtf) - 1) * 100,
              spy: ((s[s.length - 1].spy / s[0].spy) - 1) * 100,
            };
          }
          if (perfData.length >= 90) {
            const s = perfData.slice(-90);
            relativePerf90d = {
              stock: ((s[s.length - 1].stock / s[0].stock) - 1) * 100,
              sector: ((s[s.length - 1].sectorEtf / s[0].sectorEtf) - 1) * 100,
              spy: ((s[s.length - 1].spy / s[0].spy) - 1) * 100,
            };
          }
          deps.priceHistoryDays = String(perfData.length);
        }
      } catch (err) {
        deps.priceHistoryError = err instanceof Error ? err.message : 'failed';
      }

      // PE percentile
      const validPeers = blob.peerRows.filter((r) => r.peRatio != null && r.peRatio > 0 && !r.isSelf);
      const selfPE = blob.peerRows.find((r) => r.isSelf)?.peRatio;
      if (selfPE && selfPE > 0 && validPeers.length > 0) {
        pePercentile = Math.round(percentileRank(selfPE, validPeers.map((r) => r.peRatio!)));
      }

      const prompt = buildSectorRelativePrompt({
        ticker: tickerUp,
        sectorEtf,
        peerRows: blob.peerRows,
        pePercentile,
        relativePerf30d,
        relativePerf90d,
      });
      return { prompt, dependencies: deps };
    }

    // ── Step 4: Bucket Assignment ──
    case 'bucket': {
      const scan = await getLatestScan(tickerUp);
      if (scan) deps.cachedScanAt = scan.scannedAt;

      const quoteTickers = [tickerUp, 'SPY', sectorEtf];
      const quotes = await fetchQuotes(quoteTickers);
      const tickerQuote = quotes[tickerUp];
      const spyQuote = quotes['SPY'];
      const sectorQuote = quotes[sectorEtf];

      const newsSentiment: NewsSentiment | null = scan?.newsSentiment ?? null;
      const fundamentalOutlook = extractFundamentalOutlook(scan?.fiveMetrics ?? null);
      const sectorRelative = extractSectorRelative(scan?.sectorRelative ?? null);

      if (newsSentiment) deps.newsSentiment = 'cached';
      if (fundamentalOutlook) deps.fundamentalOutlook = 'cached';
      if (sectorRelative) deps.sectorRelative = 'cached';

      const prompt = buildBucketAssignmentPrompt({
        ticker: tickerUp,
        dailyChange: tickerQuote?.changePercentage ?? 0,
        spyChange: spyQuote?.changePercentage ?? 0,
        sectorEtfChange: sectorQuote?.changePercentage ?? 0,
        newsSentiment,
        fundamentalOutlook,
        sectorRelative,
      });
      return { prompt, dependencies: deps };
    }

    // ── Step 5: Thesis Check ──
    case 'thesis': {
      const scan = await getLatestScan(tickerUp);
      if (scan) deps.cachedScanAt = scan.scannedAt;

      const thesis = holding?.thesis ?? '';
      deps.thesisText = thesis || '(no thesis set)';

      const newsSentiment: NewsSentiment | null = scan?.newsSentiment ?? null;
      const fundamentalOutlook = extractFundamentalOutlook(scan?.fiveMetrics ?? null);
      const sectorRelative = extractSectorRelative(scan?.sectorRelative ?? null);

      if (newsSentiment) deps.newsSentiment = 'cached';
      if (fundamentalOutlook) deps.fundamentalOutlook = 'cached';
      if (sectorRelative) deps.sectorRelative = 'cached';

      const prompt = buildThesisCheckPrompt({
        ticker: tickerUp,
        thesis,
        newsSentiment,
        fundamentalOutlook,
        sectorRelative,
      });
      return { prompt, dependencies: deps };
    }

    // ── Step 6: Catalyst Scan ──
    case 'catalysts': {
      const prompt = buildCatalystScanPrompt({
        ticker: tickerUp,
        companyName,
        sector,
        thesis: holding?.thesis ?? null,
      });
      return { prompt, dependencies: deps };
    }

    // ── Step 7: Regime Check ──
    case 'regime': {
      const quotes = await fetchQuotes(['SPY']);
      const spyQuote = quotes['SPY'];
      if (!spyQuote) throw new Error('Could not fetch SPY quote');

      const prompt = buildRegimeCheckPrompt({
        spyPrice: spyQuote.price,
        spyChange: spyQuote.change,
        spyChangePercent: spyQuote.changePercentage,
      });
      return { prompt, dependencies: deps };
    }

    // ── Step 8: Anomaly Detection ──
    case 'anomaly': {
      // Get latest regime
      const [latestRegime] = await db
        .select()
        .from(regimeSnapshots)
        .orderBy(desc(regimeSnapshots.snappedAt))
        .limit(1);

      const regime: Regime = (latestRegime?.regime as Regime) ?? 'risk_on';
      const regimeRationale = latestRegime?.rationale ?? '';
      deps.regime = regime;
      deps.regimeAt = latestRegime?.snappedAt ?? 'none';

      // Get all latest scans
      const allHoldings = await db.select().from(holdings);
      const scans: AnalysisScan[] = [];
      for (const h of allHoldings) {
        const scan = await getLatestScan(h.ticker);
        if (scan) scans.push(scan);
      }
      deps.scanCount = String(scans.length);

      // Price changes
      const tickers = allHoldings.map((h) => h.ticker);
      const quotes = await fetchQuotes(tickers);
      const priceChanges: Record<string, number> = {};
      for (const h of allHoldings) {
        const q = quotes[h.ticker];
        if (q) priceChanges[h.ticker] = q.changePercentage;
      }

      const prompt = buildAnomalyDetectionPrompt({
        regime,
        regimeRationale,
        scans,
        priceChanges,
      });
      return { prompt, dependencies: deps };
    }
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { step, ticker = 'AMZN', mode = 'preview', customSystem, customUserMessage } = body;

    if (!step || !VALID_STEPS.includes(step)) {
      return Response.json(
        { error: `Invalid step. Must be one of: ${VALID_STEPS.join(', ')}` },
        { status: 400 },
      );
    }

    // Build the default prompt with real data
    const { prompt: promptData, dependencies } = await buildPrompt(step as Step, ticker);

    if (mode === 'preview') {
      return Response.json({
        system: promptData.system,
        userMessage: promptData.userMessage,
        webSearch: promptData.webSearch ?? false,
        maxSearches: promptData.maxSearches ?? 0,
        dependencies,
      });
    }

    // ── Run mode — call Claude ──
    const system = customSystem ?? promptData.system;
    const userMessage = customUserMessage ?? promptData.userMessage;

    const client = getClaudeClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any[] = [];
    if (promptData.webSearch) {
      tools.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: promptData.maxSearches ?? 5,
      });
    }

    const start = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userMessage }],
      ...(tools.length > 0 ? { tools } : {}),
    });
    const durationMs = Date.now() - start;

    // Extract text from response
    const textParts: string[] = [];
    for (const block of response.content) {
      if (block.type === 'text') textParts.push(block.text);
    }
    const rawText = textParts.join('\n');

    let parsed: unknown = null;
    let parseError: string | null = null;
    try {
      parsed = extractJSON(rawText);
    } catch (err) {
      parseError = err instanceof Error ? err.message : 'Failed to parse JSON';
    }

    return Response.json({
      system,
      userMessage,
      rawText,
      parsed,
      parseError,
      durationMs,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: CLAUDE_MODEL,
      webSearch: promptData.webSearch ?? false,
      dependencies,
    });
  } catch (err) {
    console.error('[prompt-test]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
