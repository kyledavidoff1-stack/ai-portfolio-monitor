import { NextResponse } from 'next/server';

// POST /api/refresh — refresh a specific stock
// Body: { ticker: string }
// Implemented in Sprint 4 (Claude AI Pipeline)
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { ticker } = body;

  if (!ticker) {
    return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
  }

  // Placeholder until Sprint 4
  return NextResponse.json(
    {
      status: 'not_implemented',
      message: `Refresh for ${ticker} will be implemented in Sprint 4.`,
    },
    { status: 501 },
  );
}
