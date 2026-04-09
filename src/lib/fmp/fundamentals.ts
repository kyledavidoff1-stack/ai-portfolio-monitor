import { fmpFetch } from './client';
import { getSectorEtf } from '@/lib/config/sector-etf-map';

export interface FmpProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  beta: number | null;
  description: string;
  exchange: string;
  marketCap: number | null;
  price: number | null;
  currency: string;
  website: string;
  ceo: string;
  country: string;
}

export interface CompanyProfile {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  beta: number | null;
  description: string | null;
  exchange: string | null;
  marketCap: number | null;
  price: number | null;
  sectorEtf: string;
}

export async function fetchCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const data = await fmpFetch<FmpProfile[]>(`/profile?symbol=${ticker.toUpperCase()}`);
  if (!data || data.length === 0) return null;

  const p = data[0];
  const sectorEtf = getSectorEtf(p.sector ?? '', p.industry ?? '');

  return {
    ticker: p.symbol,
    companyName: p.companyName,
    sector: p.sector || null,
    industry: p.industry || null,
    beta: p.beta ?? null,
    description: p.description || null,
    exchange: p.exchange || null,
    marketCap: p.marketCap ?? null,
    price: p.price ?? null,
    sectorEtf,
  };
}
