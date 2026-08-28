'use client';

import { useCallback, useEffect, useState } from 'react';

type Source = 'settings' | 'env' | 'unset';

interface SettingsPayload {
  aiApiKey: { masked: string | null; source: Source };
  fmpApiKey: { masked: string | null; source: Source };
  aiBaseUrl: { value: string | null; source: Source };
  aiModel: { value: string; source: Source };
  defaultModel: string;
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; detail?: string };

const SOURCE_LABEL: Record<Source, string> = {
  settings: 'saved here',
  env: 'from .env.local',
  unset: 'not set',
};

export function SettingsForm() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Empty means "unchanged" for secrets — we never round-trip the real value.
  const [aiKey, setAiKey] = useState('');
  const [fmpKey, setFmpKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiTest, setAiTest] = useState<TestState>({ status: 'idle' });
  const [fmpTest, setFmpTest] = useState<TestState>({ status: 'idle' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load settings');
      setData(json);
      setBaseUrl(json.aiBaseUrl.value ?? '');
      setModel(json.aiModel.value ?? '');
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const body: Record<string, string> = {
        AI_BASE_URL: baseUrl,
        AI_MODEL: model,
      };
      // Only send secrets the user actually typed, so leaving a field blank
      // keeps the existing key instead of wiping it.
      if (aiKey.trim() !== '') body.AI_API_KEY = aiKey;
      if (fmpKey.trim() !== '') body.FMP_API_KEY = fmpKey;

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');

      setAiKey('');
      setFmpKey('');
      setSaved(true);
      setAiTest({ status: 'idle' });
      setFmpTest({ status: 'idle' });
      await load();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function test(target: 'ai' | 'fmp') {
    const setState = target === 'ai' ? setAiTest : setFmpTest;
    setState({ status: 'testing' });
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const json = await res.json();
      setState(json.ok
        ? { status: 'ok', detail: json.detail }
        : { status: 'fail', detail: json.error });
    } catch (err) {
      setState({ status: 'fail', detail: err instanceof Error ? err.message : 'Request failed' });
    }
  }

  if (loadError) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-sm text-red-400">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-sm text-gray-500">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── AI provider ── */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-1">
          AI provider
        </h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          The analysis pipeline speaks the Anthropic Messages API. That means your own
          Anthropic key works directly, and so does any gateway or proxy that implements
          the same API — point the base URL at it and name whichever model you want to
          pay for.
        </p>

        <Field
          label="API key"
          hint={data.aiApiKey.masked
            ? `Currently ${data.aiApiKey.masked} (${SOURCE_LABEL[data.aiApiKey.source]}). Leave blank to keep it.`
            : 'No key configured yet.'}
        >
          <input
            type="password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder={data.aiApiKey.masked ? 'Enter a new key to replace' : 'sk-ant-…'}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Model"
          hint={`Whatever model name your provider expects. Default: ${data.defaultModel}`}
        >
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={data.defaultModel}
            className={`${inputClass} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Base URL"
          hint="Optional. Leave blank for the Anthropic API. Set this to use a gateway, proxy, or self-hosted endpoint."
        >
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.anthropic.com"
            className={`${inputClass} font-mono`}
            autoComplete="off"
          />
        </Field>

        <TestRow
          state={aiTest}
          disabled={data.aiApiKey.source === 'unset' && aiKey.trim() === ''}
          onTest={() => test('ai')}
          label="Test AI connection"
        />

        <p className="text-xs text-gray-600 mt-3 leading-relaxed">
          Two of the eight pipeline steps (news and catalysts) use server-side web
          search. On a provider that does not support it, those steps will fail and say
          so — the rest of the analysis still runs.
        </p>
      </section>

      {/* ── Market data ── */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-1">
          Market data
        </h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          Financial Modeling Prep supplies prices, statements, profiles, and peers. The
          free tier allows 250 requests per day, which is enough for a small portfolio
          scanned once or twice daily.{' '}
          <a
            href="https://financialmodelingprep.com/developer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            Get a key
          </a>
          .
        </p>

        <Field
          label="FMP API key"
          hint={data.fmpApiKey.masked
            ? `Currently ${data.fmpApiKey.masked} (${SOURCE_LABEL[data.fmpApiKey.source]}). Leave blank to keep it.`
            : 'No key configured yet.'}
        >
          <input
            type="password"
            value={fmpKey}
            onChange={(e) => setFmpKey(e.target.value)}
            placeholder={data.fmpApiKey.masked ? 'Enter a new key to replace' : 'Your FMP API key'}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <TestRow
          state={fmpTest}
          disabled={data.fmpApiKey.source === 'unset' && fmpKey.trim() === ''}
          onTest={() => test('fmp')}
          label="Test market data connection"
        />
      </section>

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
        {saveError && <span className="text-sm text-red-400">{saveError}</span>}
      </div>

      {/* ── Where these live ── */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2">
          Where these are stored
        </h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          Keys saved here are written to your local SQLite database at{' '}
          <code className="text-gray-400 font-mono">data/portfolio.db</code>, which is
          gitignored and never leaves this machine. They are stored as plain text — the
          same trust level as a <code className="text-gray-400 font-mono">.env.local</code>{' '}
          file. Anyone with access to your disk can read them.
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mt-2">
          A value set here takes precedence over the environment. Clear a field and save
          to fall back to <code className="text-gray-400 font-mono">.env.local</code>.
        </p>
      </section>

      {/* ── Analysis tuning (read-only) ── */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2">
          Analysis tuning
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          These are configured in <code className="text-gray-400 font-mono">.env.local</code>.
        </p>
        <dl className="space-y-2">
          {[
            ['Anomaly threshold', 'SCAN_ANOMALY_THRESHOLD', 'Divergence from expected return that raises a flag'],
            ['News cache', 'CACHE_NEWS_HOURS', 'Hours before a delta scan re-runs news and sentiment'],
            ['Catalyst cache', 'CACHE_CATALYSTS_HOURS', 'Hours before a delta scan re-runs the catalyst scan'],
            ['Fundamentals cache', 'CACHE_FUNDAMENTALS_HOURS', 'Hours before financial data is refetched'],
          ].map(([label, envVar, desc]) => (
            <div key={envVar} className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <dt className="text-sm text-gray-300">{label}</dt>
                <dd className="text-xs text-gray-500">{desc}</dd>
              </div>
              <code className="text-[12px] text-gray-500 font-mono shrink-0">{envVar}</code>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 bg-gray-800 border border-gray-700 focus:border-gray-500 rounded-md text-sm text-gray-100 placeholder-gray-600 focus:outline-none transition-colors';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {children}
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{hint}</p>
    </div>
  );
}

function TestRow({
  state,
  disabled,
  onTest,
  label,
}: {
  state: TestState;
  disabled: boolean;
  onTest: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={onTest}
        disabled={disabled || state.status === 'testing'}
        className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 disabled:text-gray-600 disabled:hover:bg-gray-800 border border-gray-700 rounded-md transition-colors"
      >
        {state.status === 'testing' ? 'Testing…' : label}
      </button>
      {state.status === 'ok' && (
        <span className="text-xs text-emerald-400">✓ {state.detail ?? 'Working'}</span>
      )}
      {state.status === 'fail' && (
        <span className="text-xs text-red-400 break-words">✕ {state.detail}</span>
      )}
    </div>
  );
}
