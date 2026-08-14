import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { fetchCompanyProfile } from '@/lib/fmp/fundamentals';
import { getSectorEtf } from '@/lib/config/sector-etf-map';
import { parseHoldingsCsv, toCsvRow, HOLDINGS_CSV_COLUMNS } from '@/lib/csv';

export const dynamic = 'force-dynamic';

// GET /api/holdings/csv — download all holdings as CSV.
// Includes thesis text, so this doubles as a portable backup that can be
// restored through the POST importer below.
export async function GET() {
  const rows = await db.select().from(holdings).orderBy(asc(holdings.ticker));

  const lines = [
    toCsvRow([...HOLDINGS_CSV_COLUMNS]),
    ...rows.map((h) => toCsvRow([
      h.ticker,
      h.shares,
      h.costBasis,
      h.companyName,
      h.sector,
      h.industry,
      h.sectorEtf,
      h.beta,
      h.thesis,
    ])),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="portfolio-monitor-holdings-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

// POST /api/holdings/csv — bulk add from CSV upload.
// Values present in the CSV win; FMP is consulted only to fill the gaps, so an
// exported backup restores fully even with no API key configured.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const rows = parseHoldingsCsv(await (file as File).text());

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid tickers found in CSV' }, { status: 400 });
    }

    const results: { ticker: string; status: 'added' | 'skipped' | 'error'; message?: string }[] = [];

    for (const row of rows) {
      const ticker = row.ticker;

      const existing = await db.select().from(holdings).where(eq(holdings.ticker, ticker));
      if (existing.length > 0) {
        results.push({ ticker, status: 'skipped', message: 'already exists' });
        continue;
      }

      // Only reach for FMP when the CSV didn't supply the profile fields.
      const needsProfile = !row.companyName || !row.sector;
      let profile: Awaited<ReturnType<typeof fetchCompanyProfile>> = null;
      if (needsProfile) {
        try {
          profile = await fetchCompanyProfile(ticker);
        } catch {
          profile = null;   // no key, rate limited, or thin coverage — fall through
        }
      }

      const sector = row.sector ?? profile?.sector ?? null;

      try {
        const now = new Date().toISOString();
        await db.insert(holdings).values({
          ticker,
          companyName: row.companyName ?? profile?.companyName ?? ticker,
          shares: row.shares ?? null,
          costBasis: row.costBasis ?? null,
          sector,
          industry: row.industry ?? profile?.industry ?? null,
          sectorEtf: row.sectorEtf ?? profile?.sectorEtf ?? (sector ? getSectorEtf(sector, row.industry) : null),
          beta: row.beta ?? profile?.beta ?? null,
          thesis: row.thesis ?? null,
          addedAt: now,
          updatedAt: now,
        });
        results.push({
          ticker,
          status: 'added',
          message: needsProfile && !profile ? 'added without company data (FMP unavailable)' : undefined,
        });
      } catch {
        results.push({ ticker, status: 'error', message: 'could not save holding' });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CSV import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
