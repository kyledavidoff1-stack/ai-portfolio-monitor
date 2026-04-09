import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchCompanyProfile } from '@/lib/fmp/fundamentals';

// GET /api/holdings — list all holdings
export async function GET() {
  try {
    const rows = await db.select().from(holdings).orderBy(holdings.addedAt);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }
}

// POST /api/holdings — add a ticker
// Body: { ticker: string, shares?: number, costBasis?: number }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker = (body.ticker as string)?.trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    // Check for duplicate
    const existing = await db.select().from(holdings).where(eq(holdings.ticker, ticker));
    if (existing.length > 0) {
      return NextResponse.json({ error: `${ticker} is already in your holdings` }, { status: 409 });
    }

    // Fetch company profile from FMP
    const profile = await fetchCompanyProfile(ticker);
    if (!profile) {
      return NextResponse.json({ error: `Could not find ticker: ${ticker}` }, { status: 404 });
    }

    const now = new Date().toISOString();
    const [inserted] = await db.insert(holdings).values({
      ticker: profile.ticker,
      companyName: profile.companyName,
      shares: body.shares ?? null,
      costBasis: body.costBasis ?? null,
      sector: profile.sector,
      industry: profile.industry,
      sectorEtf: profile.sectorEtf,
      beta: profile.beta,
      thesis: null,
      addedAt: now,
      updatedAt: now,
    }).returning();

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add holding';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
