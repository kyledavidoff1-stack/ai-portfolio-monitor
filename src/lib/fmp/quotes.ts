import { fmpFetch } from './client';

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
    if (quote) result[ticker] = quote;
  }
  return result;
}
