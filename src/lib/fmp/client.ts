import { getSetting } from '@/lib/config/settings';
// FMP API client — implemented in Sprint 1
// Financial Modeling Prep: https://financialmodelingprep.com/developer/docs

export const FMP_BASE = 'https://financialmodelingprep.com/stable';
export const FMP_BASE_LEGACY = 'https://financialmodelingprep.com/api';

export function getFmpApiKey(): string {
  const key = getSetting('FMP_API_KEY');
  if (!key) {
    throw new Error(
      'No FMP API key configured. Add one on the Settings page, or set FMP_API_KEY in .env.local',
    );
  }
  return key;
}

export async function fmpFetch<T>(path: string): Promise<T> {
  const apiKey = getFmpApiKey();
  const url = `${FMP_BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`FMP API error: ${res.status} ${res.statusText}`);
  const text = await res.text();
  // FMP returns HTTP 200 with a plaintext error for tickers requiring a premium plan
  if (text.startsWith('Premium Query Parameter')) {
    throw new Error(`FMP_PREMIUM: ticker not available on current FMP plan`);
  }
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new Error(`FMP response is not valid JSON: ${text.slice(0, 120)}`);
  }
  // FMP returns {"Error Message": "Limit Reach ..."} with HTTP 200 when rate-limited
  if (parsed && typeof parsed === 'object' && 'Error Message' in (parsed as Record<string, unknown>)) {
    const msg = (parsed as Record<string, unknown>)['Error Message'];
    throw new Error(`FMP_RATE_LIMIT: ${msg}`);
  }
  return parsed;
}
