/**
 * Delta-scan step selection.
 *
 * These cover the rules that decide whether a second scan of the day is cheap
 * (reuse cached steps) or expensive (re-run everything) — getting them wrong
 * either burns Claude credits or serves stale analysis.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSteps, isStale, isDeltaSelection } from '@/lib/scan/delta';
import type { AnalysisScan } from '@/types';

const NOW = Date.parse('2026-08-08T18:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

function scanFixture(over: Partial<AnalysisScan> = {}): AnalysisScan {
  return {
    id: 1,
    ticker: 'NVDA',
    scanType: 'full',
    bucketPrimary: 4,
    bucketSecondary: 3,
    bucketRationale: 'capex driven',
    bucketConfidence: 'high',
    newsSentiment: { overall_tone: 'bullish' } as AnalysisScan['newsSentiment'],
    thesisStatus: 'confirmed',
    thesisAnalysis: {
      status: 'confirmed',
      past: { summary: '', evidence: [] },
      today: { explanation: 'intact' },
      forward: { outlook: '', keyEvents: [] },
    },
    catalysts: [{ date: '2026-08-26' }] as AnalysisScan['catalysts'],
    fiveMetrics: { revenue: {} } as AnalysisScan['fiveMetrics'],
    sectorRelative: { forwardOutlook: 'leads' } as AnalysisScan['sectorRelative'],
    driverAnalysis: { today: {} } as AnalysisScan['driverAnalysis'],
    fullAnalysis: null,
    stepTimestamps: {
      news: hoursAgo(1),
      fundamentals: hoursAgo(1),
      sector: hoursAgo(1),
      bucket: hoursAgo(1),
      thesis: hoursAgo(1),
      catalysts: hoursAgo(1),
    },
    stepErrors: null,
    scannedAt: hoursAgo(1),
    ...over,
  };
}

const holding = { thesis: 'AI capex runs for years', updatedAt: hoursAgo(48) };

/** Sorted step list for a selection, so assertions read declaratively. */
function steps(over: Partial<Parameters<typeof selectSteps>[0]> = {}): string[] {
  return [...selectSteps({
    mode: 'auto',
    previous: scanFixture(),
    holding,
    dailyChangePercent: 0.4,
    now: NOW,
    ...over,
  })].sort();
}

const ALL_SORTED = ['bucket', 'catalysts', 'fundamentals', 'news', 'sector', 'thesis'];

test('a quiet re-scan re-runs only the bucket assignment', () => {
  assert.deepEqual(steps(), ['bucket']);
});

test('full mode ignores cache and runs every step', () => {
  assert.deepEqual(steps({ mode: 'full' }), ALL_SORTED);
});

test('a ticker with no prior scan runs every step', () => {
  assert.deepEqual(steps({ previous: null }), ALL_SORTED);
});

test('news past its 4h TTL re-runs, dragging the thesis check with it', () => {
  const previous = scanFixture();
  previous.stepTimestamps!.news = hoursAgo(5);
  assert.deepEqual(steps({ previous }), ['bucket', 'news', 'thesis']);
});

test('news inside its TTL stays cached', () => {
  const previous = scanFixture();
  previous.stepTimestamps!.news = hoursAgo(3);
  assert.deepEqual(steps({ previous }), ['bucket']);
});

test('a price move at or beyond the spike threshold invalidates fresh news', () => {
  assert.deepEqual(steps({ dailyChangePercent: -2.6 }), ['bucket', 'news', 'thesis']);
});

test('a move below the threshold leaves news cached', () => {
  assert.deepEqual(steps({ dailyChangePercent: 1.4 }), ['bucket']);
});

test('catalysts re-run after their 12h TTL', () => {
  const previous = scanFixture();
  previous.stepTimestamps!.catalysts = hoursAgo(13);
  assert.deepEqual(steps({ previous }), ['bucket', 'catalysts']);
});

test('fundamentals re-run after their 24h TTL', () => {
  const previous = scanFixture();
  previous.stepTimestamps!.fundamentals = hoursAgo(25);
  assert.deepEqual(steps({ previous }), ['bucket', 'fundamentals']);
});

test('editing the thesis re-runs the thesis check', () => {
  assert.deepEqual(
    steps({ holding: { thesis: 'revised view', updatedAt: hoursAgo(0.5) } }),
    ['bucket', 'thesis'],
  );
});

test('a step with no stored output re-runs however fresh its timestamp', () => {
  assert.deepEqual(steps({ previous: scanFixture({ catalysts: null }) }), ['bucket', 'catalysts']);
});

test('rows predating step timestamps fall back to scannedAt', () => {
  assert.deepEqual(
    steps({ previous: scanFixture({ stepTimestamps: null, scannedAt: hoursAgo(1) }) }),
    ['bucket'],
  );
  assert.deepEqual(
    steps({ previous: scanFixture({ stepTimestamps: null, scannedAt: hoursAgo(30) }) }),
    ALL_SORTED,
  );
});

test('isStale treats a zero TTL and an unparseable date as stale', () => {
  assert.equal(isStale(hoursAgo(0), 0, NOW), true);
  assert.equal(isStale('not-a-date', 24, NOW), true);
  assert.equal(isStale(null, 24, NOW), true);
  assert.equal(isStale(hoursAgo(1), 24, NOW), false);
});

test('isDeltaSelection distinguishes a partial run from a full one', () => {
  assert.equal(isDeltaSelection(new Set(['bucket'])), true);
  assert.equal(isDeltaSelection(new Set(ALL_SORTED as never)), false);
});
