/**
 * Delta-scan step selection.
 *
 * A full scan runs all six per-stock pipeline steps. A delta scan re-runs only
 * the steps whose cached output has gone stale, which is what makes a second
 * scan of the day cheap. This module is deliberately pure — no db, no network —
 * so the decision logic can be reasoned about and tested in isolation.
 */

import { STEP_TTL_HOURS, PRICE_SPIKE_THRESHOLD } from '@/lib/config/constants';
import type { AnalysisScan, Holding } from '@/types';

/** The six per-stock pipeline steps, in execution order. */
export type StepName = 'news' | 'fundamentals' | 'sector' | 'bucket' | 'thesis' | 'catalysts';

export const ALL_STEPS: StepName[] = ['news', 'fundamentals', 'sector', 'bucket', 'thesis', 'catalysts'];

export type ScanMode = 'auto' | 'full';

/** A step is stale when its TTL is zero (always fresh), unknown, or elapsed. */
export function isStale(timestamp: string | undefined | null, ttlHours: number, now: number = Date.now()): boolean {
  if (ttlHours <= 0) return true;
  if (!timestamp) return true;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return true;
  return now - parsed > ttlHours * 3600_000;
}

export interface StepSelectionInput {
  mode: ScanMode;
  previous: AnalysisScan | null;
  /** Only `thesis` and `updatedAt` are read — used to detect an edited thesis. */
  holding: Pick<Holding, 'thesis' | 'updatedAt'>;
  /** Today's percentage change, e.g. -2.4 for -2.4%. */
  dailyChangePercent: number;
  now?: number;
}

/**
 * Decide which pipeline steps must re-run for one ticker.
 *
 * Beyond plain TTL expiry, three things force a re-run:
 *   - a price move at or beyond the spike threshold invalidates news
 *   - fresh news invalidates the thesis check that was derived from it
 *   - an edited thesis invalidates the thesis check
 * A step whose stored output is missing always re-runs, however fresh its
 * timestamp claims to be.
 */
export function selectSteps(input: StepSelectionInput): Set<StepName> {
  const { mode, previous, holding, dailyChangePercent, now = Date.now() } = input;

  if (mode === 'full' || !previous) return new Set(ALL_STEPS);

  const ts = previous.stepTimestamps ?? {};
  const at = (step: StepName) => ts[step] ?? previous.scannedAt;

  // Bucket assignment reads today's tape, so it is never cached.
  const run = new Set<StepName>(['bucket']);

  const priceSpike = Math.abs(dailyChangePercent) >= PRICE_SPIKE_THRESHOLD * 100;
  if (isStale(at('news'), STEP_TTL_HOURS.news, now) || priceSpike || !previous.newsSentiment) {
    run.add('news');
  }
  if (isStale(at('fundamentals'), STEP_TTL_HOURS.fundamentals, now) || !previous.fiveMetrics) {
    run.add('fundamentals');
  }
  if (isStale(at('sector'), STEP_TTL_HOURS.sector, now) || !previous.sectorRelative) {
    run.add('sector');
  }

  const hasThesis = !!holding.thesis?.trim();
  const thesisEdited = hasThesis && holding.updatedAt > at('thesis');
  if (
    isStale(at('thesis'), STEP_TTL_HOURS.thesis, now) ||
    run.has('news') ||
    thesisEdited ||
    !previous.thesisAnalysis
  ) {
    run.add('thesis');
  }

  if (isStale(at('catalysts'), STEP_TTL_HOURS.catalysts, now) || !previous.catalysts) {
    run.add('catalysts');
  }

  return run;
}

/** True when the selection skips at least one step (i.e. it is a delta run). */
export function isDeltaSelection(steps: Set<StepName>): boolean {
  return ALL_STEPS.some((s) => !steps.has(s));
}
