/**
 * Portfolio-level analysis pipeline.
 * Runs steps 7-8: Regime Check + Anomaly Detection.
 */

import { db } from '@/lib/db';
import { regimeSnapshots, anomalyFlags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { callClaude } from './client';
import { buildRegimeCheckPrompt } from './prompts/regime-check';
import { buildAnomalyDetectionPrompt } from './prompts/anomaly-detection';
import type { Holding, AnalysisScan, Regime, AnomalyFlag, RegimeSnapshot } from '@/types';
import type { QuoteData } from '@/lib/fmp/quotes';

export interface AnalyzePortfolioParams {
  holdings: Holding[];
  quotes: Record<string, QuoteData>;
  latestScans: AnalysisScan[];
  /** A still-fresh regime snapshot to reuse instead of re-running step 7. */
  cachedRegime?: RegimeSnapshot | null;
  onStep?: (step: 'regime' | 'anomaly') => void;
}

export async function analyzePortfolio(params: AnalyzePortfolioParams): Promise<void> {
  const { holdings, quotes, latestScans, cachedRegime, onStep } = params;

  const spyQuote = quotes['SPY'];
  if (!spyQuote) {
    console.warn('[Portfolio] No SPY quote available — skipping regime check');
    return;
  }

  // ── Step 7: Regime Check ──
  onStep?.('regime');
  let regime: Regime = 'risk_on';
  let regimeRationale = '';
  let vix: number | null = null;

  if (cachedRegime) {
    regime = cachedRegime.regime;
    regimeRationale = cachedRegime.rationale;
    vix = cachedRegime.vix;
    console.log(`[Portfolio] Regime cache HIT (${regime}) — skipping step 7`);
  } else {
  try {
    const prompt = buildRegimeCheckPrompt({
      spyPrice: spyQuote.price,
      spyChange: spyQuote.change,
      spyChangePercent: spyQuote.changePercentage,
    });

    const result = await callClaude<{
      regime: Regime;
      rationale: string;
      spyChange: number;
      vix: number;
    }>({
      system: prompt.system,
      userMessage: prompt.userMessage,
      webSearch: prompt.webSearch,
      maxSearches: prompt.maxSearches,
    });

    regime = result.regime;
    regimeRationale = result.rationale;
    vix = result.vix;

    await db.insert(regimeSnapshots).values({
      regime: result.regime,
      rationale: result.rationale,
      spyChange: result.spyChange,
      vix: result.vix,
      snappedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Portfolio] Regime check failed, using SPY-based fallback:', err instanceof Error ? err.message : err);
    // Fallback: classify regime from SPY change alone
    const pct = spyQuote.changePercentage;
    if (pct <= -3) regime = 'dislocation';
    else if (pct <= -1) regime = 'risk_off';
    else if (pct >= 0.5) regime = 'risk_on';
    else regime = 'rotation';
    regimeRationale = `Fallback classification based on SPY ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% daily change (Claude API unavailable).`;

    await db.insert(regimeSnapshots).values({
      regime,
      rationale: regimeRationale,
      spyChange: pct,
      vix: null,
      snappedAt: new Date().toISOString(),
    }).catch(() => {}); // best-effort insert
  }
  }

  // ── Step 8: Anomaly Detection ──
  onStep?.('anomaly');
  try {
    const priceChanges: Record<string, number> = {};
    for (const h of holdings) {
      const q = quotes[h.ticker];
      if (q) priceChanges[h.ticker] = q.changePercentage;
    }

    const prompt = buildAnomalyDetectionPrompt({
      regime,
      regimeRationale,
      scans: latestScans,
      priceChanges,
    });

    const flags = await callClaude<Array<{
      ticker: string;
      flagType: string;
      description: string;
      severity: string;
    }>>({
      system: prompt.system,
      userMessage: prompt.userMessage,
    });

    if (Array.isArray(flags) && flags.length > 0) {
      // Clear old unresolved flags for these tickers
      const flaggedTickers = [...new Set(flags.map((f) => f.ticker))];
      for (const t of flaggedTickers) {
        await db.update(anomalyFlags)
          .set({ resolved: 1 })
          .where(eq(anomalyFlags.ticker, t));
      }

      // Insert new flags
      const now = new Date().toISOString();
      for (const flag of flags) {
        await db.insert(anomalyFlags).values({
          ticker: flag.ticker,
          flagType: flag.flagType,
          description: flag.description,
          severity: flag.severity,
          resolved: 0,
          flaggedAt: now,
        });
      }
    }
  } catch (err) {
    console.warn('[Portfolio] Anomaly detection failed:', err instanceof Error ? err.message : err);
  }
}
