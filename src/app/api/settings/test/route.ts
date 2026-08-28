/**
 * POST /api/settings/test — verify the configured credentials actually work.
 *
 * Body: { target: 'ai' | 'fmp' }
 *
 * Exists so a first-run user can confirm setup before spending a scan's worth
 * of tokens discovering a typo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClaudeClient, getModel } from '@/lib/claude/client';
import { fmpFetch } from '@/lib/fmp/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let target: string;
  try {
    ({ target } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (target === 'ai') {
    try {
      const client = getClaudeClient();
      const model = getModel();
      const res = await client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      });
      const text = res.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return NextResponse.json({
        ok: true,
        detail: `${model} responded${text ? ` — "${text.slice(0, 40)}"` : ''}`,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 300) : 'Request failed',
      });
    }
  }

  if (target === 'fmp') {
    try {
      // A profile lookup is available on the free tier, so this tests the key
      // rather than the plan.
      const data = await fmpFetch<Array<{ symbol?: string; companyName?: string }>>(
        '/profile?symbol=AAPL',
      );
      const first = Array.isArray(data) ? data[0] : undefined;
      return NextResponse.json({
        ok: true,
        detail: first?.companyName
          ? `Fetched ${first.companyName}`
          : 'Key accepted',
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 300) : 'Request failed',
      });
    }
  }

  return NextResponse.json({ ok: false, error: 'Unknown target' }, { status: 400 });
}
