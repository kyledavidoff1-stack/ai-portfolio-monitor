/**
 * GET  /api/settings — current configuration, with credentials masked.
 * POST /api/settings — save credentials / model / base URL.
 *
 * Values are stored in the local SQLite database. Secrets are never returned to
 * the browser in full; the UI only ever shows a mask plus where the value came
 * from.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveSetting,
  saveSettings,
  maskSecret,
  DEFAULT_MODEL,
  type SettingKey,
} from '@/lib/config/settings';

export const dynamic = 'force-dynamic';

const WRITABLE: SettingKey[] = ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'FMP_API_KEY'];

export async function GET() {
  try {
    const ai = resolveSetting('AI_API_KEY');
    const fmp = resolveSetting('FMP_API_KEY');
    const baseUrl = resolveSetting('AI_BASE_URL');
    const model = resolveSetting('AI_MODEL');

    return NextResponse.json({
      aiApiKey: { masked: maskSecret(ai.value), source: ai.source },
      fmpApiKey: { masked: maskSecret(fmp.value), source: fmp.source },
      // Not secrets — safe to return in full so the fields can be edited.
      aiBaseUrl: { value: baseUrl.value, source: baseUrl.source },
      aiModel: { value: model.value ?? DEFAULT_MODEL, source: model.source },
      defaultModel: DEFAULT_MODEL,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: Partial<Record<SettingKey, string>> = {};

    for (const key of WRITABLE) {
      const value = body[key];
      // undefined means "leave alone"; empty string means "clear and fall back
      // to the environment". Both are meaningful, so only skip undefined.
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
      }
      updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    }

    saveSettings(updates);
    return NextResponse.json({ ok: true, saved: Object.keys(updates) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
