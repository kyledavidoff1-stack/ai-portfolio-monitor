import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// DELETE /api/holdings/[ticker] — remove a holding
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  try {
    const deleted = await db.delete(holdings).where(eq(holdings.ticker, upper)).returning();
    if (deleted.length === 0) {
      return NextResponse.json({ error: `${upper} not found in holdings` }, { status: 404 });
    }
    return NextResponse.json({ deleted: upper });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 });
  }
}

// PATCH /api/holdings/[ticker] — update thesis, shares, costBasis
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if ('thesis' in body) updates.thesis = body.thesis;
    if ('shares' in body) updates.shares = body.shares;
    if ('costBasis' in body) updates.costBasis = body.costBasis;

    const [updated] = await db
      .update(holdings)
      .set(updates)
      .where(eq(holdings.ticker, upper))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: `${upper} not found` }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update holding' }, { status: 500 });
  }
}
