'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface AddTickerModalProps {
  onClose: () => void;
}

type Tab = 'ticker' | 'csv';

interface CsvResult {
  ticker: string;
  status: 'added' | 'skipped' | 'error';
  message?: string;
}

export function AddTickerModal({ onClose }: AddTickerModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('ticker');

  // Single ticker form
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [tickerError, setTickerError] = useState('');
  const [tickerLoading, setTickerLoading] = useState(false);

  // CSV form
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResults, setCsvResults] = useState<CsvResult[] | null>(null);
  const [csvError, setCsvError] = useState('');

  async function handleAddTicker(e: React.FormEvent) {
    e.preventDefault();
    setTickerError('');
    const t = ticker.trim().toUpperCase();
    if (!t) { setTickerError('Enter a ticker symbol'); return; }

    setTickerLoading(true);
    try {
      const body: Record<string, unknown> = { ticker: t };
      if (shares) body.shares = Number(shares);
      if (costBasis) body.costBasis = Number(costBasis);

      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setTickerError(data.error ?? 'Failed to add ticker'); return; }
      router.refresh();
      onClose();
    } catch {
      setTickerError('Network error — please try again');
    } finally {
      setTickerLoading(false);
    }
  }

  async function handleCsvUpload(e: React.FormEvent) {
    e.preventDefault();
    setCsvError('');
    setCsvResults(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setCsvError('Select a CSV file first'); return; }

    setCsvLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/holdings/csv', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setCsvError(data.error ?? 'Import failed'); return; }
      setCsvResults(data.results as CsvResult[]);
      router.refresh();
    } catch {
      setCsvError('Network error — please try again');
    } finally {
      setCsvLoading(false);
    }
  }

  const added = csvResults?.filter((r) => r.status === 'added').length ?? 0;
  const allDone = csvResults !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-gray-100">Add Holdings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setTab('ticker')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'ticker'
                ? 'text-gray-100 border-b-2 border-gray-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Single Ticker
          </button>
          <button
            onClick={() => setTab('csv')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'csv'
                ? 'text-gray-100 border-b-2 border-gray-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Upload CSV
          </button>
        </div>

        <div className="px-6 py-5">
          {tab === 'ticker' ? (
            <form onSubmit={handleAddTicker} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Ticker symbol <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. NVDA"
                  maxLength={10}
                  autoFocus
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 focus:border-gray-500 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none transition-colors font-mono uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Shares <span className="text-gray-600 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="any"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 focus:border-gray-500 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Cost basis <span className="text-gray-600 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={costBasis}
                    onChange={(e) => setCostBasis(e.target.value)}
                    placeholder="$0.00"
                    min="0"
                    step="any"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 focus:border-gray-500 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {tickerError && (
                <p className="text-sm text-red-400">{tickerError}</p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={tickerLoading}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {tickerLoading ? 'Looking up…' : 'Add ticker'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {!allDone ? (
                <form onSubmit={handleCsvUpload} className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-3">
                      Upload a CSV with columns: <code className="bg-gray-800 border border-gray-700 px-1 rounded text-xs text-gray-300">ticker, shares (optional), cost_basis (optional)</code>
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="block w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-800 file:text-gray-300 hover:file:bg-gray-700 cursor-pointer"
                    />
                  </div>

                  {csvError && <p className="text-sm text-red-400">{csvError}</p>}

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={csvLoading}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {csvLoading ? 'Importing…' : 'Import CSV'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300 font-medium">
                    Import complete — {added} of {csvResults!.length} tickers added.
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {csvResults!.map((r) => (
                      <div key={r.ticker} className="flex items-center justify-between text-sm">
                        <span className="font-mono font-medium text-gray-200">{r.ticker}</span>
                        <span className={
                          r.status === 'added' ? 'text-emerald-400' :
                          r.status === 'skipped' ? 'text-gray-500' :
                          'text-red-400'
                        }>
                          {r.status === 'added' ? '✓ Added' :
                           r.status === 'skipped' ? `Skipped${r.message ? ` (${r.message})` : ''}` :
                           `Error${r.message ? `: ${r.message}` : ''}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
