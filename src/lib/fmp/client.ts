// FMP API client — implemented in Sprint 1
// Financial Modeling Prep: https://financialmodelingprep.com/developer/docs

export const FMP_BASE = 'https://financialmodelingprep.com/api';

export function getFmpApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('FMP_API_KEY is not set. Add it to .env.local');
  return key;
}

export async function fmpFetch<T>(path: string): Promise<T> {
  const apiKey = getFmpApiKey();
  const url = `${FMP_BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`FMP API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}
