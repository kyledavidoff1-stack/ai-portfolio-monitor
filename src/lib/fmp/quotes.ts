import { fmpFetch } from './client';
import { getPriceHistory } from './prices';

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercentage: number;
  previousClose: number;
  volume: number;
  marketCap?: number | null;
  /** True when FMP returns a premium-required error for this ticker */
  unavailable?: true;
  /** Where the numbers came from. 'history' means the live quote endpoint was
   *  unavailable (no/unpaid FMP key) and this was derived from the last two
   *  cached daily closes — real data, just not intraday. */
  source?: 'live' | 'history';
  /** Date of the close backing a 'history' quote (YYYY-MM-DD) */
  asOf?: string;
}

export async function fetchQuote(ticker: string): Promise<QuoteData | null> {
  try {
    // FMP stable API returns "changesPercentage" (plural) — normalize to "changePercentage"
    const data = await fmpFetch<Array<QuoteData & { changesPercentage?: number }>>(`/quote?symbol=${ticker.toUpperCase()}`);
    const raw = data?.[0];
    if (!raw) return null;
    return { ...raw, changePercentage: raw.changesPercentage ?? raw.changePercentage ?? 0, marketCap: raw.marketCap ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.startsWith('FMP_PREMIUM:')) {
      console.warn(`[FMP] ${ticker}: ${msg.slice(12)}`);
      return { symbol: ticker, price: 0, change: 0, changePercentage: 0, previousClose: 0, volume: 0, unavailable: true };
    }
    // Network error or other failure — fail silently
    return null;
  }
}

// Fetch quotes for multiple tickers in parallel (individual calls — batch is premium)
export async function fetchQuotes(tickers: string[]): Promise<Record<string, QuoteData>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => {
      const quote = await fetchQuote(ticker);
      return [ticker, quote] as [string, QuoteData | null];
    })
  );
  const result: Record<string, QuoteData> = {};
  for (const [ticker, quote] of entries) {
    if (quote) result[ticker] = { ...quote, source: 'live' };
  }
  return result;
}

/**
 * Build a quote from the two most recent cached daily closes.
 * Returns null when there isn't enough history to compute a change.
 */
export async function quoteFromHistory(ticker: string): Promise<QuoteData | null> {
  const rows = await getPriceHistory(ticker, 2);   // oldest-first
  if (rows.length === 0) return null;

  const last = rows[rows.length - 1];
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
  const previousClose = prev?.close ?? last.close;
  const change = last.close - previousClose;

  return {
    symbol: ticker.toUpperCase(),
    price: last.close,
    change,
    changePercentage: previousClose > 0 ? (change / previousClose) * 100 : 0,
    previousClose,
    volume: 0,
    marketCap: null,
    source: 'history',
    asOf: last.date,
  };
}

/**
 * Quotes with graceful degradation: live FMP quotes where available, falling
 * back to the last cached daily closes otherwise. This is what keeps the app
 * usable without a paid FMP plan — panels render real (if end-of-day) prices
 * instead of empty dashes.
 */
export async function getQuotes(tickers: string[]): Promise<Record<string, QuoteData>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  let live: Record<string, QuoteData> = {};
  try {
    live = await fetchQuotes(unique);
  } catch {
    // Whole-batch failure (no API key, network down) — fall through to history
  }

  const needsFallback = unique.filter((t) => !live[t] || live[t].unavailable);
  if (needsFallback.length === 0) return live;

  const fallbacks = await Promise.all(
    needsFallback.map(async (t) => [t, await quoteFromHistory(t)] as const),
  );

  const result = { ...live };
  for (const [ticker, quote] of fallbacks) {
    if (quote) result[ticker] = quote;
  }
  return result;
}
