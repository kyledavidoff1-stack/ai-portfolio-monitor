import { NextResponse } from 'next/server';

// POST /api/scan — trigger a full or delta scan
// Body: { type: 'full' | 'delta', tickers?: string[] }
// Implemented in Sprint 4 (Claude AI Pipeline)
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { type = 'full', tickers } = body;

  // Placeholder until Sprint 4
  return NextResponse.json(
    {
      status: 'not_implemented',
      message: `Scan trigger (${type}) will be implemented in Sprint 4.`,
      tickers: tickers ?? [],
    },
    { status: 501 },
  );
}
