/**
 * Fundamentals cache layer.
 * Reads from the SQLite `fundamentals` table before hitting FMP.
 * On cache miss or stale data (>24h), re-fetches and upserts the full blob.
 */

import { db } from '@/lib/db';
import { fundamentals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { isCacheStale } from '@/utils/cache';
import {
  fetchQuarterlyFinancials,
  fetchPeers,
  fetchSegments,
  buildPeerRows,
  fetchAnnualFinancials,
  fetchAnalystEstimatesMulti,
  fetchAnalystEstimatesQuarterly,
} from './financials';
import type { IncomeQ, CashFlowQ, BalanceSheetQ, KeyMetricQ, AnalystEstimate } from './financials';
import type { PeerRow, RevenueSegment } from '@/types';

export interface FundamentalsBlob {
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  balanceSheet: BalanceSheetQ[];
  keyMetrics: KeyMetricQ[];
  peers: string[];
  peerRows: PeerRow[];
  segments: RevenueSegment[];
  annualIncome: IncomeQ[];
  annualCashFlow: CashFlowQ[];
  analystEstimates: AnalystEstimate[];
  quarterlyEstimates: AnalystEstimate[];
  unavailable: boolean;
  cachedAt: string;   // ISO timestamp of when this blob was written
}

export async function getFundamentals(ticker: string): Promise<FundamentalsBlob> {
  const symbol = ticker.toUpperCase();

  // ── 1. Check cache ────────────────────────────────────────────────────────
  const [cached] = await db
    .select()
    .from(fundamentals)
    .where(eq(fundamentals.ticker, symbol));

  if (cached && !isCacheStale(cached.fetchedAt, 'fundamentals')) {
    const blob = JSON.parse(cached.data) as FundamentalsBlob;
    // Don't serve cached empty results — treat them as a cache miss so we retry
    // Also invalidate blobs missing newer fields (annualIncome added in sprint 4)
    if ((blob.income.length > 0 || blob.unavailable) && blob.annualIncome !== undefined && blob.quarterlyEstimates !== undefined) {
      console.log(`[Fundamentals] Cache HIT: ${symbol}`);
      return blob;
    }
    console.log(`[Fundamentals] Cache contains empty data for ${symbol} — retrying FMP`);
  }

  console.log(`[Fundamentals] Cache ${cached ? 'STALE' : 'MISS'}: ${symbol} — fetching from FMP`);

  // ── 2. Fetch from FMP ─────────────────────────────────────────────────────
  const fin = await fetchQuarterlyFinancials(symbol);

  let peers: string[] = [];
  let peerRows: PeerRow[] = [];
  let segments: RevenueSegment[] = [];
  let annualIncome: IncomeQ[] = [];
  let annualCashFlow: CashFlowQ[] = [];
  let analystEstimates: AnalystEstimate[] = [];
  let quarterlyEstimates: AnalystEstimate[] = [];

  if (!fin.unavailable) {
    const [peersResult, segmentsResult, annualResult, estimatesResult, qEstimatesResult] = await Promise.all([
      fetchPeers(symbol),
      fetchSegments(symbol),
      fetchAnnualFinancials(symbol),
      fetchAnalystEstimatesMulti(symbol),
      fetchAnalystEstimatesQuarterly(symbol),
    ]);
    peers = peersResult;
    segments = segmentsResult;
    annualIncome = annualResult.income;
    annualCashFlow = annualResult.cashFlow;
    analystEstimates = estimatesResult;
    quarterlyEstimates = qEstimatesResult;
    peerRows = await buildPeerRows(symbol, fin, fin.cashFlow, peers);
  }

  const cachedAt = new Date().toISOString();
  const blob: FundamentalsBlob = {
    income:       fin.income,
    cashFlow:     fin.cashFlow,
    balanceSheet: fin.balanceSheet,
    keyMetrics:   fin.keyMetrics,
    peers,
    peerRows,
    segments,
    annualIncome,
    annualCashFlow,
    analystEstimates,
    quarterlyEstimates,
    unavailable:  fin.unavailable,
    cachedAt,
  };

  // ── 3. Upsert to cache (only if we got real data) ────────────────────────
  const hasData = blob.income.length > 0 || blob.unavailable;
  if (hasData) {
    try {
      await db
        .insert(fundamentals)
        .values({ ticker: symbol, data: JSON.stringify(blob), fetchedAt: cachedAt })
        .onConflictDoUpdate({
          target: fundamentals.ticker,
          set: { data: JSON.stringify(blob), fetchedAt: cachedAt },
        });
    } catch (err) {
      console.warn('[Fundamentals] Cache write failed:', err);
    }
  } else {
    console.warn(`[Fundamentals] Skipping cache write for ${symbol} — FMP returned empty data (rate limited?)`);
  }

  return blob;
}
