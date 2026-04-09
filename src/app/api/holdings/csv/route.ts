import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchCompanyProfile } from '@/lib/fmp/fundamentals';

// Parse CSV text — expects columns: ticker[,shares][,cost_basis]
// First row may be a header; we detect by checking if first cell is non-numeric
function parseCsv(text: string): { ticker: string; shares?: number; costBasis?: number }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const result: { ticker: string; shares?: number; costBasis?: number }[] = [];

  for (const line of lines) {
    const cells = line.split(',').map((c) => c.trim());
    const first = cells[0].toUpperCase();
    // Skip header row or empty
    if (!first || first === 'TICKER' || first === 'SYMBOL') continue;
    // Skip obvious non-tickers (numbers, long strings)
    if (/^\d/.test(first) || first.length > 10) continue;

    const entry: { ticker: string; shares?: number; costBasis?: number } = { ticker: first };
    if (cells[1] && !isNaN(Number(cells[1]))) entry.shares = Number(cells[1]);
    if (cells[2] && !isNaN(Number(cells[2]))) entry.costBasis = Number(cells[2]);
    result.push(entry);
  }
  return result;
}

// POST /api/holdings/csv — bulk add from CSV upload
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await (file as File).text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid tickers found in CSV' }, { status: 400 });
    }

    const results: { ticker: string; status: 'added' | 'skipped' | 'error'; message?: string }[] = [];

    for (const row of rows) {
      const ticker = row.ticker.toUpperCase();

      // Skip duplicates
      const existing = await db.select().from(holdings).where(eq(holdings.ticker, ticker));
      if (existing.length > 0) {
        results.push({ ticker, status: 'skipped', message: 'already exists' });
        continue;
      }

      try {
        const profile = await fetchCompanyProfile(ticker);
        if (!profile) {
          results.push({ ticker, status: 'error', message: 'not found in FMP' });
          continue;
        }

        const now = new Date().toISOString();
        await db.insert(holdings).values({
          ticker: profile.ticker,
          companyName: profile.companyName,
          shares: row.shares ?? null,
          costBasis: row.costBasis ?? null,
          sector: profile.sector,
          industry: profile.industry,
          sectorEtf: profile.sectorEtf,
          beta: profile.beta,
          thesis: null,
          addedAt: now,
          updatedAt: now,
        });
        results.push({ ticker, status: 'added' });
      } catch {
        results.push({ ticker, status: 'error', message: 'FMP fetch failed' });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CSV import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
