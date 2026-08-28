/**
 * Local app settings — API credentials and model choice.
 *
 * Resolution order for every value: the `app_settings` table first, then the
 * environment. That lets someone configure the app entirely from the Settings
 * page without touching a file, while `.env.local` keeps working for people who
 * prefer it (and for CI, where there is no database).
 *
 * Reads are synchronous. better-sqlite3 is a synchronous driver, so `.all()`
 * returns rows directly — no await, and callers stay synchronous.
 */

import { db } from '@/lib/db';
import { appSettings } from '@/lib/db/schema';

export type SettingKey =
  | 'AI_API_KEY'
  | 'AI_BASE_URL'
  | 'AI_MODEL'
  | 'FMP_API_KEY';

/** Where a resolved value came from. Shown in the UI so it is obvious which
 *  one is winning when both a stored setting and an env var exist. */
export type SettingSource = 'settings' | 'env' | 'unset';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Environment fallbacks. ANTHROPIC_API_KEY is accepted alongside CLAUDE_API_KEY
// because most people already have that one exported.
const ENV_FALLBACKS: Record<SettingKey, Array<string>> = {
  AI_API_KEY: ['AI_API_KEY', 'CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'],
  AI_BASE_URL: ['AI_BASE_URL', 'ANTHROPIC_BASE_URL'],
  AI_MODEL: ['AI_MODEL', 'CLAUDE_MODEL'],
  FMP_API_KEY: ['FMP_API_KEY'],
};

function readStored(): Record<string, string> {
  try {
    const rows = db.select().from(appSettings).all();
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (row.value !== '') out[row.key] = row.value;
    }
    return out;
  } catch {
    // No database yet (fresh clone before db:migrate) — fall back to env only.
    return {};
  }
}

function readEnv(key: SettingKey): string | null {
  for (const name of ENV_FALLBACKS[key]) {
    const v = process.env[name];
    if (v && v.trim() !== '') return v.trim();
  }
  return null;
}

/** Resolve one setting, and say where it came from. */
export function resolveSetting(key: SettingKey): { value: string | null; source: SettingSource } {
  const stored = readStored()[key];
  if (stored) return { value: stored, source: 'settings' };
  const env = readEnv(key);
  if (env) return { value: env, source: 'env' };
  return { value: null, source: 'unset' };
}

export function getSetting(key: SettingKey): string | null {
  return resolveSetting(key).value;
}

export function getAiModel(): string {
  return getSetting('AI_MODEL') ?? DEFAULT_MODEL;
}

export function saveSettings(values: Partial<Record<SettingKey, string>>): void {
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed === '') {
      // Empty means "clear the stored value and fall back to the environment".
      db.delete(appSettings).where(eqKey(key)).run();
      continue;
    }
    db.insert(appSettings)
      .values({ key, value: trimmed, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: trimmed, updatedAt: now } })
      .run();
  }
}

// Small helper so the import list above stays short.
import { eq } from 'drizzle-orm';
function eqKey(key: string) {
  return eq(appSettings.key, key);
}

/** Mask a credential for display — never send a stored key back to the browser. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export { DEFAULT_MODEL };
