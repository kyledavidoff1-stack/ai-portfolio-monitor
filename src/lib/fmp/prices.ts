import { db } from '@/lib/db';
import { priceHistory } from '@/lib/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { getFmpApiKey, FMP_BASE } from './client';
import { fmpFetch } from './client';

interface FmpHistoricalRow {
  symbol: string;
  date: string;
  close: number;
  volume: number;
}

/**
 * Fetch historical daily closes from FMP and cache in the price_history table.
 * Only fetches days after the latest cached date for efficiency.
 */
export async function ensurePriceHistory(ticker: string, days: number = 120): Promise<void> {
  const symbol = ticker.toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - days);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  // Find the earliest and latest dates we already have cached
  const [latest, earliest] = await Promise.all([
    db.select({ date: priceHistory.date }).from(priceHistory)
      .where(eq(priceHistory.ticker, symbol)).orderBy(desc(priceHistory.date)).limit(1),
    db.select({ date: priceHistory.date }).from(priceHistory)
      .where(eq(priceHistory.ticker, symbol)).orderBy(asc(priceHistory.date)).limit(1),
  ]);

  const latestDate = latest[0]?.date ?? null;
  const earliestDate = earliest[0]?.date ?? null;

  // Build list of date ranges to fetch
  const fetches: Array<{ from: string; to?: string }> = [];

  if (!latestDate) {
    // No cached data — fetch the full window
    fetches.push({ from: windowStartStr });
  } else {
    // Backfill: if window extends before earliest cached date, fetch that range
    if (earliestDate && windowStartStr < earliestDate) {
      const dayBefore = new Date(earliestDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      fetches.push({ from: windowStartStr, to: dayBefore.toISOString().slice(0, 10) });
    }
    // Forward: fetch from latest cached + 1 to today
    if (latestDate < today) {
      const nextDay = new Date(latestDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const fromDate = nextDay.toISOString().slice(0, 10);
      if (fromDate <= today) {
        fetches.push({ from: fromDate });
      }
    }
  }

  if (fetches.length === 0) return;

  for (const range of fetches) {
    try {
      const apiKey = getFmpApiKey();
      let url = `${FMP_BASE}/historical-price-eod/full?symbol=${symbol}&from=${range.from}&apikey=${apiKey}`;
      if (range.to) url += `&to=${range.to}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;

      const text = await res.text();
      if (text.startsWith('Premium Query Parameter')) continue;

      let rows: FmpHistoricalRow[];
      try {
        rows = JSON.parse(text) as FmpHistoricalRow[];
      } catch {
        continue;
      }

      if (!Array.isArray(rows) || rows.length === 0) continue;
      if ('Error Message' in (rows as unknown as Record<string, unknown>)) continue;

      const values = rows
        .filter((r) => r.close > 0)
        .map((r) => ({
          ticker: symbol,
          date: r.date,
          close: r.close,
          volume: r.volume ?? null,
        }));

      if (values.length === 0) continue;

      const CHUNK = 50;
      for (let i = 0; i < values.length; i += CHUNK) {
        await db.insert(priceHistory).values(values.slice(i, i + CHUNK)).onConflictDoNothing();
      }
    } catch (err) {
      console.warn(`[prices] Failed to fetch history for ${symbol}:`, (err as Error).message?.slice(0, 100));
    }
  }
}

/**
 * Ensure price history is cached for multiple tickers.
 * Runs in parallel with a concurrency limit to avoid FMP rate limits.
 */
export async function ensureAllPriceHistory(tickers: string[], days: number = 120): Promise<void> {
  const CONCURRENCY = 4;
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    await Promise.all(unique.slice(i, i + CONCURRENCY).map((t) => ensurePriceHistory(t, days)));
  }
}

/**
 * Read cached price history from the DB, sorted oldest-first.
 * Returns up to `days` most recent trading days.
 */
export async function getPriceHistory(
  ticker: string,
  days: number = 90,
): Promise<{ date: string; close: number }[]> {
  const symbol = ticker.toUpperCase();
  const rows = await db
    .select({ date: priceHistory.date, close: priceHistory.close })
    .from(priceHistory)
    .where(eq(priceHistory.ticker, symbol))
    .orderBy(desc(priceHistory.date))
    .limit(days);

  // Reverse so oldest is first
  return rows.reverse();
}

/**
 * Get price history for multiple tickers, aligned to common dates.
 * Returns a Map from ticker to array of {date, close}, all arrays sharing the same date set.
 */
export async function getAlignedPriceHistory(
  tickers: string[],
  days: number = 90,
): Promise<Map<string, { date: string; close: number }[]>> {
  const allData = new Map<string, { date: string; close: number }[]>();

  for (const t of tickers) {
    const data = await getPriceHistory(t, days + 10); // fetch extra to handle alignment
    allData.set(t.toUpperCase(), data);
  }

  // Find dates common to all tickers
  const dateSets = [...allData.values()].map((rows) => new Set(rows.map((r) => r.date)));
  if (dateSets.length === 0) return allData;

  const commonDates = new Set(
    [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))),
  );

  // Sort common dates ascending and take the last `days`
  const sortedDates = [...commonDates].sort();
  const finalDates = new Set(sortedDates.slice(-days));

  // Filter each ticker's data to only common dates
  const aligned = new Map<string, { date: string; close: number }[]>();
  for (const [ticker, rows] of allData) {
    aligned.set(ticker, rows.filter((r) => finalDates.has(r.date)));
  }

  return aligned;
}

// ── Intraday prices (5-minute bars) ─────────────────────────────────────────

export interface IntradayPoint {
  date: string;   // "YYYY-MM-DD HH:MM:SS"
  close: number;
}

// Simple in-memory cache with 5-minute TTL for ephemeral intraday data
const intradayCache = new Map<string, { data: IntradayPoint[]; ts: number }>();
const INTRADAY_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch 5-minute intraday bars from FMP.
 * Cached in memory for 5 minutes to avoid redundant API calls.
 */
export async function fetchIntradayPrices(ticker: string): Promise<IntradayPoint[]> {
  const symbol = ticker.toUpperCase();
  const cached = intradayCache.get(symbol);
  if (cached && Date.now() - cached.ts < INTRADAY_TTL_MS) {
    return cached.data;
  }

  try {
    const raw = await fmpFetch<Array<{ date: string; close: number }>>(
      `/historical-chart/5min?symbol=${symbol}`
    );
    if (!Array.isArray(raw) || raw.length === 0) return [];
    // FMP returns newest-first — reverse to oldest-first
    const data: IntradayPoint[] = raw
      .filter((r) => r.close > 0)
      .map((r) => ({ date: r.date, close: r.close }))
      .reverse();
    intradayCache.set(symbol, { data, ts: Date.now() });
    return data;
  } catch {
    return [];
  }
}

/**
 * Get intraday price history for multiple tickers, aligned to common timestamps.
 */
export async function getAlignedIntradayHistory(
  tickers: string[],
): Promise<Map<string, IntradayPoint[]>> {
  const allData = new Map<string, IntradayPoint[]>();

  await Promise.all(tickers.map(async (t) => {
    const data = await fetchIntradayPrices(t);
    allData.set(t.toUpperCase(), data);
  }));

  // Find timestamps common to all tickers
  const dateSets = [...allData.values()].map((rows) => new Set(rows.map((r) => r.date)));
  if (dateSets.length === 0) return allData;

  const commonDates = new Set(
    [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))),
  );

  const aligned = new Map<string, IntradayPoint[]>();
  for (const [ticker, rows] of allData) {
    aligned.set(ticker, rows.filter((r) => commonDates.has(r.date)));
  }

  return aligned;
}
