'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

const STEPS = [
  { value: 'news',         label: 'Step 1: News & Sentiment',      webSearch: true  },
  { value: 'fundamentals', label: 'Step 2: Fundamental Analysis',   webSearch: false },
  { value: 'sector',       label: 'Step 3: Sector Relative',        webSearch: false },
  { value: 'bucket',       label: 'Step 4: Bucket Assignment',      webSearch: false },
  { value: 'thesis',       label: 'Step 5: Thesis Check',           webSearch: false },
  { value: 'catalysts',    label: 'Step 6: Catalyst Scan',          webSearch: true  },
  { value: 'regime',       label: 'Step 7: Regime Check',           webSearch: true  },
  { value: 'anomaly',      label: 'Step 8: Anomaly Detection',      webSearch: false },
] as const;

const DEPENDENT_STEPS = new Set(['bucket', 'thesis', 'anomaly']);

interface RunResult {
  system: string;
  userMessage: string;
  rawText: string;
  parsed: unknown;
  parseError: string | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
  webSearch: boolean;
  dependencies: Record<string, string>;
}

export default function PromptTestPage() {
  const [step, setStep] = useState('news');
  const [ticker, setTicker] = useState('AMZN');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userMessageTemplate, setUserMessageTemplate] = useState('');
  const [userMessageRendered, setUserMessageRendered] = useState('');
  const [showRendered, setShowRendered] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [dependencies, setDependencies] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputTab, setOutputTab] = useState<'parsed' | 'raw'>('parsed');
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadPrompt = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    setResult(null);
    setSaveResult(null);
    try {
      // Fetch rendered preview and raw source templates in parallel
      const [previewRes, sourceRes] = await Promise.all([
        fetch('/api/prompt-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step, ticker, mode: 'preview' }),
        }),
        fetch(`/api/prompt-source?step=${step}`),
      ]);

      const preview = await previewRes.json();
      const source = await sourceRes.json();

      if (preview.error) { setError(preview.error); return; }
      if (source.error) { setError(`Source read failed: ${source.error}`); return; }

      // System prompt: use raw source (identical to rendered — no interpolation)
      setSystemPrompt(source.system ?? preview.system);
      // User message: raw template for editing, rendered for preview
      setUserMessageTemplate(source.userMessage ?? '');
      setUserMessageRendered(preview.userMessage);
      setWebSearch(preview.webSearch);
      setDependencies(preview.dependencies ?? {});
      setPromptLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompt');
    } finally {
      setLoadingPreview(false);
    }
  }, [step, ticker]);

  const runStep = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/prompt-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          ticker,
          mode: 'run',
          // Send edited system prompt (no interpolation, safe to override)
          customSystem: systemPrompt || undefined,
          // User message uses the builder's rendered version (template has ${...} placeholders)
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);
      setOutputTab('parsed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run step');
    } finally {
      setLoading(false);
    }
  }, [step, ticker, systemPrompt]);

  const saveToSource = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/prompt-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          systemPrompt,
          userMessageTemplate,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setSaveResult({ ok: false, message: data.error });
      } else {
        setSaveResult({ ok: true, message: `Saved to ${data.file}` });
      }
    } catch (err) {
      setSaveResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }, [step, systemPrompt, userMessageTemplate]);

  const stepInfo = STEPS.find((s) => s.value === step);
  const hasDeps = DEPENDENT_STEPS.has(step);

  return (
    <div className="space-y-4 max-w-6xl pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-100">Prompt Lab</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Test individual pipeline steps — one API call at a time
          </p>
        </div>
        <Link
          href="/settings"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Back to Settings
        </Link>
      </div>

      {/* Controls bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-end gap-3 flex-wrap">
          {/* Step dropdown */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[12px] text-gray-500 uppercase tracking-widest mb-1 font-medium">
              Pipeline Step
            </label>
            <select
              value={step}
              onChange={(e) => {
                setStep(e.target.value);
                setPromptLoaded(false);
                setResult(null);
                setSaveResult(null);
              }}
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-gray-500 transition-colors"
            >
              {STEPS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Ticker input */}
          <div className="w-32">
            <label className="block text-[12px] text-gray-500 uppercase tracking-widest mb-1 font-medium">
              Ticker
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value.toUpperCase());
                setPromptLoaded(false);
                setResult(null);
                setSaveResult(null);
              }}
              placeholder="AMZN"
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-md px-3 py-2 font-mono focus:outline-none focus:border-gray-500 transition-colors"
            />
          </div>

          {/* Load Prompt button */}
          <button
            onClick={loadPrompt}
            disabled={loadingPreview}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-200 text-sm rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {loadingPreview ? 'Loading...' : 'Load Prompt'}
          </button>

          {/* Run Step button */}
          <button
            onClick={runStep}
            disabled={loading || !promptLoaded}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-indigo-300/50 border-t-white rounded-full animate-spin" />
                Running...
              </span>
            ) : (
              'Run Step'
            )}
          </button>
        </div>

        {/* Step info badges */}
        <div className="flex items-center gap-2 mt-3">
          {stepInfo?.webSearch && (
            <span className="text-[12px] px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-400 border border-amber-800/50">
              Web Search Enabled
            </span>
          )}
          {hasDeps && (
            <span className="text-[12px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-400 border border-blue-800/50">
              Uses Cached Prior Steps
            </span>
          )}
          {step === 'regime' && (
            <span className="text-[12px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
              Portfolio-level (ticker ignored)
            </span>
          )}
          {step === 'anomaly' && (
            <span className="text-[12px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
              Portfolio-level (all holdings)
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/50 border border-red-900 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Dependencies notice */}
      {promptLoaded && Object.keys(dependencies).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <p className="text-[12px] text-gray-500 uppercase tracking-widest font-medium mb-2">
            Data Sources
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {Object.entries(dependencies).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[12px] text-gray-400 font-mono">{key}:</span>
                <span className="text-[12px] text-gray-500 truncate">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt editors */}
      {promptLoaded && (
        <div className="space-y-3">
          {/* System prompt */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/60">
              <span className="text-[12px] text-gray-500 uppercase tracking-widest font-medium">
                System Prompt
              </span>
              <span className="text-[12px] text-gray-600 font-mono">
                {systemPrompt.length.toLocaleString()} chars
              </span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full bg-transparent text-gray-300 text-xs font-mono p-4 focus:outline-none resize-y leading-relaxed"
              rows={8}
              spellCheck={false}
            />
          </div>

          {/* User message template */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/60">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-gray-500 uppercase tracking-widest font-medium">
                  User Message Template
                </span>
                <span className="text-[12px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-500 border border-amber-800/30 font-mono">
                  {'${...}'} = dynamic data
                </span>
              </div>
              <span className="text-[12px] text-gray-600 font-mono">
                {userMessageTemplate.length.toLocaleString()} chars
              </span>
            </div>
            <textarea
              value={userMessageTemplate}
              onChange={(e) => setUserMessageTemplate(e.target.value)}
              className="w-full bg-transparent text-gray-300 text-xs font-mono p-4 focus:outline-none resize-y leading-relaxed"
              rows={12}
              spellCheck={false}
            />
          </div>

          {/* Rendered preview (collapsible) */}
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowRendered(!showRendered)}
              className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-gray-600 uppercase tracking-widest font-medium">
                  Rendered Preview
                </span>
                <span className="text-[12px] text-gray-700">
                  User message with data injected
                </span>
              </div>
              <span className="text-[12px] text-gray-600">{showRendered ? '\u25BC' : '\u25B6'}</span>
            </button>
            {showRendered && (
              <div className="border-t border-gray-800/50 px-4 py-3 max-h-[300px] overflow-auto">
                <pre className="text-xs font-mono text-gray-500 whitespace-pre-wrap leading-relaxed">
                  {userMessageRendered || '(no rendered preview)'}
                </pre>
              </div>
            )}
          </div>

          {/* Save to Source bar */}
          <div className="flex items-center justify-between bg-gray-900/50 border border-gray-800/50 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-3">
              <button
                onClick={saveToSource}
                disabled={saving || (!systemPrompt && !userMessageTemplate)}
                className="text-[12px] px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : 'Save to Source'}
              </button>
              {saveResult && (
                <span className={`text-[12px] ${saveResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {saveResult.message}
                </span>
              )}
            </div>
            <span className="text-[12px] text-gray-600">
              Writes both prompts back to the template file
            </span>
          </div>
        </div>
      )}

      {/* Output panel */}
      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          {/* Output header with stats */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60">
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-gray-500 uppercase tracking-widest font-medium">
                Output
              </span>
              {/* Tabs */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOutputTab('parsed')}
                  className={`text-[12px] px-2 py-0.5 rounded transition-colors ${
                    outputTab === 'parsed'
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Parsed JSON
                </button>
                <button
                  onClick={() => setOutputTab('raw')}
                  className={`text-[12px] px-2 py-0.5 rounded transition-colors ${
                    outputTab === 'raw'
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Raw Text
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-gray-500 font-mono">
                {result.model}
              </span>
              <span className="text-[12px] text-gray-500 font-mono">
                {result.inputTokens.toLocaleString()} in / {result.outputTokens.toLocaleString()} out
              </span>
              <span className="text-[12px] text-gray-500 font-mono">
                {(result.durationMs / 1000).toFixed(1)}s
              </span>
              {result.parseError && (
                <span className="text-[12px] text-amber-400">
                  Parse error: {result.parseError}
                </span>
              )}
            </div>
          </div>

          {/* Output content */}
          <div className="max-h-[600px] overflow-auto">
            <pre className="text-xs font-mono text-gray-300 p-4 whitespace-pre-wrap break-words leading-relaxed">
              {outputTab === 'parsed' && result.parsed
                ? JSON.stringify(result.parsed, null, 2)
                : outputTab === 'parsed' && !result.parsed
                  ? result.parseError
                    ? `⚠ Could not parse JSON: ${result.parseError}\n\nSwitch to "Raw Text" tab to see full response.`
                    : '(no output)'
                  : result.rawText || '(empty response)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
