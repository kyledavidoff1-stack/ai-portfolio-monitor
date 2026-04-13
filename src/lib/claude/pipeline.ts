/**
 * Per-stock analysis pipeline.
 * Runs steps 1-6 sequentially, passing outputs forward.
 * Stores results in analysisScans table.
 */

import { db } from '@/lib/db';
import { analysisScans } from '@/lib/db/schema';
import { callClaude } from './client';
import { buildNewsSentimentPrompt } from './prompts/news-sentiment';
import { buildFundamentalAnalysisPrompt } from './prompts/fundamental-analysis';
import { buildSectorRelativePrompt } from './prompts/sector-relative';
import { buildBucketAssignmentPrompt } from './prompts/bucket-assignment';
import { buildThesisCheckPrompt } from './prompts/thesis-check';
import { buildCatalystScanPrompt } from './prompts/catalyst-scan';
import type { Holding, NewsSentiment, Catalyst, ThesisCheck, DriverAnalysis } from '@/types';
import type { QuoteData } from '@/lib/fmp/quotes';
import type { FundamentalsBlob } from '@/lib/fmp/fundamentals-cache';
import type { RelativePerfPoint } from '@/components/company/SectorRelativeChart';

export type StepName = 'news' | 'fundamentals' | 'sector' | 'bucket' | 'thesis' | 'catalysts';

export interface AnalyzeStockParams {
  ticker: string;
  holding: Holding;
  quote: QuoteData;
  fundamentalsBlob: FundamentalsBlob;
  spyQuote: QuoteData;
  sectorEtfQuote: QuoteData | null;
  relativePerfData: RelativePerfPoint[];
  pePercentile: number | null;
  onStep?: (step: StepName) => void;
}

export async function analyzeStock(params: AnalyzeStockParams): Promise<void> {
  const {
    ticker, holding, quote, fundamentalsBlob, spyQuote, sectorEtfQuote,
    relativePerfData, pePercentile, onStep,
  } = params;

  const companyName = holding.companyName ?? ticker;
  const sector = holding.sector ?? 'Unknown';
  const sectorEtf = holding.sectorEtf ?? 'XLK';

  // Partial results — fill in as steps complete
  let newsSentiment: NewsSentiment | null = null;
  let fundamentalOutlook: Record<string, string> | null = null;
  let sectorRelativeResult: { forwardOutlook: string; premiumTrend: string; relativeStrength: string } | null = null;
  let bucketResult: { bucketPrimary: number; bucketSecondary: number | null; bucketRationale: string; bucketConfidence: string } | null = null;
  let driverAnalysis: DriverAnalysis | null = null;
  let thesisCheck: ThesisCheck | null = null;
  let catalysts: Catalyst[] | null = null;

  // ── Step 1: News & Sentiment ──
  onStep?.('news');
  try {
    const prompt = buildNewsSentimentPrompt({ ticker, companyName, sector });
    newsSentiment = await callClaude<NewsSentiment>({
      system: prompt.system,
      userMessage: prompt.userMessage,
      webSearch: prompt.webSearch,
      maxSearches: prompt.maxSearches,
    });
  } catch (err) {
    console.warn(`[Pipeline] Step 1 (news) failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  // ── Step 2: Fundamental Analysis ──
  onStep?.('fundamentals');
  try {
    const prompt = buildFundamentalAnalysisPrompt({
      ticker,
      income: fundamentalsBlob.income,
      cashFlow: fundamentalsBlob.cashFlow,
      balanceSheet: fundamentalsBlob.balanceSheet,
      keyMetrics: fundamentalsBlob.keyMetrics,
      livePrice: quote.price ?? null,
      forwardEps: fundamentalsBlob.analystEstimates[0]?.epsAvg ?? null,
    });
    fundamentalOutlook = await callClaude<Record<string, string>>({
      system: prompt.system,
      userMessage: prompt.userMessage,
    });
  } catch (err) {
    console.warn(`[Pipeline] Step 2 (fundamentals) failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  // ── Step 3: Sector Relative ──
  onStep?.('sector');
  try {
    // Compute relative perf summaries from chart data
    const perfData = relativePerfData;
    let relativePerf30d: { stock: number; sector: number; spy: number } | null = null;
    let relativePerf90d: { stock: number; sector: number; spy: number } | null = null;
    if (perfData.length >= 30) {
      const slice30 = perfData.slice(-30);
      const first30 = slice30[0];
      const last30 = slice30[slice30.length - 1];
      relativePerf30d = {
        stock: ((last30.stock / first30.stock) - 1) * 100,
        sector: ((last30.sectorEtf / first30.sectorEtf) - 1) * 100,
        spy: ((last30.spy / first30.spy) - 1) * 100,
      };
    }
    if (perfData.length >= 90) {
      const slice90 = perfData.slice(-90);
      const first90 = slice90[0];
      const last90 = slice90[slice90.length - 1];
      relativePerf90d = {
        stock: ((last90.stock / first90.stock) - 1) * 100,
        sector: ((last90.sectorEtf / first90.sectorEtf) - 1) * 100,
        spy: ((last90.spy / first90.spy) - 1) * 100,
      };
    }

    const prompt = buildSectorRelativePrompt({
      ticker,
      sectorEtf,
      peerRows: fundamentalsBlob.peerRows,
      pePercentile,
      relativePerf30d,
      relativePerf90d,
    });
    sectorRelativeResult = await callClaude<{ forwardOutlook: string; premiumTrend: string; relativeStrength: string }>({
      system: prompt.system,
      userMessage: prompt.userMessage,
    });
  } catch (err) {
    console.warn(`[Pipeline] Step 3 (sector) failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  // ── Step 4: Bucket Assignment ──
  onStep?.('bucket');
  try {
    const dailyChange = quote.changePercentage;
    const spyChange = spyQuote.changePercentage;
    const sectorEtfChange = sectorEtfQuote?.changePercentage ?? 0;

    const prompt = buildBucketAssignmentPrompt({
      ticker,
      dailyChange,
      spyChange,
      sectorEtfChange,
      newsSentiment,
      fundamentalOutlook,
      sectorRelative: sectorRelativeResult,
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

    bucketResult = {
      bucketPrimary: result.bucketPrimary,
      bucketSecondary: result.bucketSecondary,
      bucketRationale: result.bucketRationale,
      bucketConfidence: result.bucketConfidence,
    };
    driverAnalysis = {
      past: result.past,
      today: result.today,
      forward: result.forward,
    };
  } catch (err) {
    console.warn(`[Pipeline] Step 4 (bucket) failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  // ── Step 5: Thesis Check ──
  onStep?.('thesis');
  try {
    if (holding.thesis?.trim()) {
      const prompt = buildThesisCheckPrompt({
        ticker,
        thesis: holding.thesis,
        newsSentiment,
        fundamentalOutlook,
        sectorRelative: sectorRelativeResult,
      });
      thesisCheck = await callClaude<ThesisCheck>({
        system: prompt.system,
        userMessage: prompt.userMessage,
      });
    } else {
      thesisCheck = {
        status: 'neutral',
        past: { summary: 'No thesis set.', evidence: [] },
        today: { explanation: 'Set an investment thesis to enable thesis tracking.' },
        forward: { outlook: 'Set a thesis to get forward outlook.', keyEvents: [] },
      };
    }
  } catch (err) {
    console.warn(`[Pipeline] Step 5 (thesis) failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  // ── Step 6: Catalyst Scan ──
  onStep?.('catalysts');
  try {
    const prompt = buildCatalystScanPrompt({
      ticker,
      companyName,
      sector,
      thesis: holding.thesis,
    });
    catalysts = await callClaude<Catalyst[]>({
      system: prompt.system,
      userMessage: prompt.userMessage,
      webSearch: prompt.webSearch,
      maxSearches: prompt.maxSearches,
    });
  } catch (err) {
    console.warn(`[Pipeline] Step 6 (catalysts) failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  // ── Build sector relative data for DB ──
  const sectorRelativeData = sectorRelativeResult ? {
    forwardPE: { stock: 0, sectorMedian: 0, percentile: pePercentile ?? 0 },
    premiumTrend: sectorRelativeResult.premiumTrend as 'expanding' | 'compressing' | 'stable',
    correlationToSector30d: 0,
    correlationToSector90d: 0,
    relativePerformance: [],
    forwardOutlook: sectorRelativeResult.forwardOutlook,
  } : null;

  // ── Build five metrics with forward outlooks ──
  const fiveMetrics = fundamentalOutlook ? {
    revenue: { value: '', context: '', trend: 'flat' as const, forwardOutlook: fundamentalOutlook.revenue },
    profitability: { value: '', context: '', trend: 'flat' as const, forwardOutlook: fundamentalOutlook.profitability },
    cashGeneration: { value: '', context: '', trend: 'flat' as const, forwardOutlook: fundamentalOutlook.cashGeneration },
    valuation: { value: '', context: '', trend: 'flat' as const, forwardOutlook: fundamentalOutlook.valuation },
    financialHealth: { value: '', context: '', trend: 'flat' as const, forwardOutlook: fundamentalOutlook.financialHealth },
  } : null;

  // ── Store results ──
  const now = new Date().toISOString();
  await db.insert(analysisScans).values({
    ticker,
    scanType: 'full',
    bucketPrimary: bucketResult?.bucketPrimary ?? null,
    bucketSecondary: bucketResult?.bucketSecondary ?? null,
    bucketRationale: bucketResult?.bucketRationale ?? null,
    bucketConfidence: bucketResult?.bucketConfidence ?? null,
    newsSentiment: newsSentiment ? JSON.stringify(newsSentiment) : null,
    thesisStatus: thesisCheck?.status ?? null,
    thesisAnalysis: thesisCheck ? JSON.stringify(thesisCheck) : null,
    catalysts: catalysts ? JSON.stringify(catalysts) : null,
    fiveMetrics: fiveMetrics ? JSON.stringify(fiveMetrics) : null,
    sectorRelative: sectorRelativeData ? JSON.stringify(sectorRelativeData) : null,
    driverAnalysis: driverAnalysis ? JSON.stringify(driverAnalysis) : null,
    fullAnalysis: null,
    scannedAt: now,
  });
}
