'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Holding, AnalysisScan, ThesisStatus, AnomalyFlag } from '@/types';
import { QuoteData } from '@/lib/fmp/quotes';
import type { ScanState } from './ScanButton';
import { AddTickerModal } from './AddTickerModal';
import { formatCurrency, fmtB } from '@/utils/format';
import { BUCKET_COLORS } from '@/lib/config/constants';

// ── Column system ───────────────────────────────────────────────────────────

type ColumnKey =
  | 'company' | 'price' | 'buckets' | 'change'
  | 'thesis' | 'nextCatalyst' | 'beta' | 'driver'
  | 'shares' | 'marketValue' | 'costBasis' | 'pnl'
  | 'sector' | 'industry' | 'sectorEtf' | 'mktCap'
  | 'anomalyFlag';

// Orderable keys: 'ticker' always first; 'driver' has no header; 'price' merged into 'company' cell; 'anomalyFlag' is fixed position
type OrderableKey = Exclude<ColumnKey, 'driver' | 'price' | 'anomalyFlag'>;

interface ColDef { key: ColumnKey; label: string; defaultOn: boolean; group: 'default' | 'optional' }

const COL_DEFS: ColDef[] = [
  { key: 'company',      label: 'Company Name',   defaultOn: true,  group: 'default'  },
  { key: 'price',        label: 'Current Price',  defaultOn: true,  group: 'default'  },
  { key: 'change',       label: 'Daily Change',   defaultOn: true,  group: 'default'  },
  { key: 'marketValue',  label: 'Market Value',   defaultOn: true,  group: 'default'  },
  { key: 'beta',         label: 'Beta',           defaultOn: true,  group: 'default'  },
  { key: 'buckets',      label: 'Driver Buckets', defaultOn: true,  group: 'default'  },
  { key: 'thesis',       label: 'Thesis Status',  defaultOn: true,  group: 'default'  },
  { key: 'anomalyFlag',  label: 'Anomaly Flag',   defaultOn: true,  group: 'default'  },
  { key: 'nextCatalyst', label: 'Next Catalyst',  defaultOn: false, group: 'optional' },
  { key: 'driver',       label: 'Driver Summary', defaultOn: true,  group: 'default'  },
  { key: 'mktCap',       label: 'Market Cap',     defaultOn: false, group: 'optional' },
  { key: 'shares',       label: 'Shares',         defaultOn: false, group: 'optional' },
  { key: 'costBasis',    label: 'Cost Basis',     defaultOn: false, group: 'optional' },
  { key: 'pnl',          label: 'P&L %',          defaultOn: false, group: 'optional' },
  { key: 'sector',       label: 'Sector',         defaultOn: false, group: 'optional' },
  { key: 'industry',     label: 'Industry',       defaultOn: false, group: 'optional' },
  { key: 'sectorEtf',    label: 'Sector ETF',     defaultOn: false, group: 'optional' },
];

const DEFAULT_COLS = new Set<ColumnKey>(COL_DEFS.filter((c) => c.defaultOn).map((c) => c.key));
const STORAGE_KEY = 'pm:columns-v4';
const ORDER_KEY   = 'pm:col-order-v4';

function loadCols(): Set<ColumnKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLS;
    return new Set(JSON.parse(raw) as ColumnKey[]);
  } catch { return DEFAULT_COLS; }
}
function saveCols(s: Set<ColumnKey>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])); } catch {}
}

const DEFAULT_ORDER: OrderableKey[] = [
  'company', 'change', 'marketValue', 'beta', 'buckets', 'thesis',
  'mktCap', 'shares', 'costBasis', 'pnl', 'nextCatalyst', 'sector', 'industry', 'sectorEtf',
];

function loadOrder(): OrderableKey[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as OrderableKey[];
    const known = new Set(DEFAULT_ORDER);
    const valid = parsed.filter((k) => known.has(k));
    const extra = DEFAULT_ORDER.filter((k) => !valid.includes(k));
    return [...valid, ...extra];
  } catch { return DEFAULT_ORDER; }
}
function saveOrder(o: OrderableKey[]) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(o)); } catch {}
}

const COL_META: Record<OrderableKey, { width: string; label: (cols: Set<ColumnKey>) => string }> = {
  company:      { width: 'w-28', label: (c) => c.has('company') && c.has('price') ? 'Company / Price' : c.has('company') ? 'Company' : 'Price' },
  buckets:      { width: 'w-28', label: () => 'Drivers' },
  change:       { width: 'w-14', label: () => 'Change' },
  thesis:       { width: 'w-14', label: () => 'Thesis' },
  nextCatalyst: { width: 'w-24', label: () => 'Next Event' },
  beta:         { width: 'w-10', label: () => 'Beta' },
  shares:       { width: 'w-16', label: () => 'Shares' },
  marketValue:  { width: 'w-20', label: () => 'Mkt Val' },
  costBasis:    { width: 'w-20', label: () => 'Cost Basis' },
  pnl:          { width: 'w-16', label: () => 'P&L %' },
  sector:       { width: 'w-24', label: () => 'Sector' },
  industry:     { width: 'w-24', label: () => 'Industry' },
  sectorEtf:    { width: 'w-14', label: () => 'ETF' },
  mktCap:       { width: 'w-20', label: () => 'Mkt Cap' },
};

const BUCKETS = ['Market Beta', 'Sector/Macro', 'Sentiment', 'Fundamental'];

function truncateWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  if (words.length <= max) return text;
  return words.slice(0, max).join(' ') + '…';
}

const BUCKET_DOT_COLORS = BUCKET_COLORS;

const BUCKET_SHORT_LABELS: Record<number, string> = {
  1: 'Beta',
  2: 'Sector',
  3: 'Sent.',
  4: 'Fund.',
};

const THESIS_STATUS_STYLES: Record<string, string> = {
  confirmed:  'bg-emerald-500 border-emerald-400',
  neutral:    'bg-amber-500 border-amber-400',
  challenged: 'bg-red-500 border-red-400',
};

const THESIS_STATUS_LABELS: Record<string, string> = {
  confirmed:  'Confirmed',
  neutral:    'Pressure',
  challenged: 'Challenged',
};

// ── Open panel state ─────────────────────────────────────────────────────────
type OpenPanel = { ticker: string; panel: 'thesis' | 'edit' } | null;

// ── Main component ──────────────────────────────────────────────────────────

export function HoldingsList({
  holdings,
  quotes,
  scanState,
  latestScans = {},
  anomalies = [],
}: {
  holdings: Holding[];
  quotes: Record<string, QuoteData>;
  scanState?: ScanState | null;
  latestScans?: Record<string, AnalysisScan>;
  anomalies?: AnomalyFlag[];
}) {
  const router = useRouter();
  const [showModal, setShowModal]       = useState(false);
  const [deletingTicker, setDeletingTicker] = useState<string | null>(null);
  const [openPanel, setOpenPanel]       = useState<OpenPanel>(null);
  const [showColMenu, setShowColMenu]   = useState(false);
  const [cols, setCols]                 = useState<Set<ColumnKey>>(DEFAULT_COLS);
  const [colOrder, setColOrder]         = useState<OrderableKey[]>(DEFAULT_ORDER);
  const [dragOver, setDragOver]         = useState<OrderableKey | null>(null);
  const dragKey = useRef<OrderableKey | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Build per-ticker anomaly lookup
  const anomalyByTicker = new Map<string, AnomalyFlag[]>();
  for (const flag of anomalies) {
    const arr = anomalyByTicker.get(flag.ticker) ?? [];
    arr.push(flag);
    anomalyByTicker.set(flag.ticker, arr);
  }

  useEffect(() => {
    setCols(loadCols());
    setColOrder(loadOrder());
  }, []);

  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowColMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColMenu]);

  function toggleCol(key: ColumnKey) {
    const next = new Set(cols);
    next.has(key) ? next.delete(key) : next.add(key);
    setCols(next);
    saveCols(next);
  }

  function reorder(from: OrderableKey, to: OrderableKey) {
    const fi = colOrder.indexOf(from);
    const ti = colOrder.indexOf(to);
    if (fi === -1 || ti === -1 || fi === ti) return;
    const next = [...colOrder];
    next.splice(fi, 1);
    next.splice(ti, 0, from);
    setColOrder(next);
    saveOrder(next);
  }

  const visibleOrdered = colOrder.filter((k) =>
    k === 'company' ? cols.has('company') || cols.has('price') : cols.has(k)
  );

  function togglePanel(ticker: string, panel: 'thesis' | 'edit') {
    setOpenPanel((p) =>
      p?.ticker === ticker && p.panel === panel ? null : { ticker, panel }
    );
  }

  async function handleDelete(ticker: string) {
    if (!confirm(`Remove ${ticker} from your holdings?`)) return;
    setDeletingTicker(ticker);
    try {
      await fetch(`/api/holdings/${ticker}`, { method: 'DELETE' });
      router.refresh();
    } finally { setDeletingTicker(null); }
  }

  async function handleThesisSave(ticker: string, thesis: string) {
    await fetch(`/api/holdings/${ticker}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thesis }),
    });
    router.refresh();
  }

  async function handleCostBasisSave(ticker: string, costBasis: number | null) {
    await fetch(`/api/holdings/${ticker}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ costBasis }),
    });
    router.refresh();
  }

  async function handleEditSave(
    ticker: string,
    data: { shares: number | null; costBasis: number | null }
  ) {
    await fetch(`/api/holdings/${ticker}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    router.refresh();
  }

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest">Holdings</span>
          {holdings.length > 0 && (
            <span className="text-[13px] text-gray-500 font-mono">{holdings.length}</span>
          )}

          {/* Column visibility toggle */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowColMenu((v) => !v)}
              className={`ml-0.5 transition-colors ${showColMenu ? 'text-gray-300' : 'text-gray-600 hover:text-gray-400'}`}
              title="Configure columns"
            >
              <ColumnsIcon />
            </button>
            {showColMenu && (
              <div className="absolute left-0 top-7 z-30 w-52 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-2">
                <p className="px-3 pb-1 text-[13px] text-gray-400 uppercase tracking-widest font-semibold">
                  Configure Columns
                </p>
                <div className="px-1.5">
                  <div className="flex items-center gap-2 px-2 py-1 opacity-40 select-none">
                    <div className="w-3 h-3 rounded-sm bg-gray-600 border border-gray-500 flex items-center justify-center shrink-0">
                      <span className="text-white text-[7px] leading-none">✓</span>
                    </div>
                    <span className="text-xs text-gray-400">Ticker (always on)</span>
                  </div>

                  <p className="px-2 pt-2 pb-0.5 text-[13px] text-gray-500 uppercase tracking-widest">Default</p>
                  {COL_DEFS.filter((c) => c.group === 'default').map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="w-3 h-3 rounded-sm accent-blue-500 cursor-pointer"
                      />
                      <span className="text-xs text-gray-300">{col.label}</span>
                    </label>
                  ))}

                  <p className="px-2 pt-2 pb-0.5 text-[13px] text-gray-500 uppercase tracking-widest">Optional</p>
                  {COL_DEFS.filter((c) => c.group === 'optional').map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="w-3 h-3 rounded-sm accent-blue-500 cursor-pointer"
                      />
                      <span className="text-xs text-gray-300">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="text-[12px] text-gray-400 hover:text-gray-100 font-medium px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
        >
          + Add ticker
        </button>
      </div>

      {holdings.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-200 text-sm">No holdings yet</p>
          <p className="text-gray-400 text-xs mt-1">Add tickers or upload a CSV to get started</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm rounded-lg transition-colors"
          >
            Add ticker
          </button>
        </div>
      ) : (
        <div className="space-y-px">
          <ColHeader
            cols={cols}
            visibleOrdered={visibleOrdered}
            dragKey={dragKey}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onReorder={reorder}
          />
          {holdings.map((h) => (
            <HoldingRow
              key={h.ticker}
              holding={h}
              quote={quotes[h.ticker] ?? null}
              scan={latestScans[h.ticker] ?? null}
              cols={cols}
              visibleOrdered={visibleOrdered}
              thesisExpanded={openPanel?.ticker === h.ticker && openPanel.panel === 'thesis'}
              editExpanded={openPanel?.ticker === h.ticker && openPanel.panel === 'edit'}
              onThesisToggle={() => togglePanel(h.ticker, 'thesis')}
              onEdit={() => togglePanel(h.ticker, 'edit')}
              onDelete={() => handleDelete(h.ticker)}
              onThesisSave={(thesis) => handleThesisSave(h.ticker, thesis)}
              onCostBasisSave={(v) => handleCostBasisSave(h.ticker, v)}
              onEditSave={(data) => handleEditSave(h.ticker, data)}
              deleting={deletingTicker === h.ticker}
              scanState={scanState}
              anomalyFlags={anomalyByTicker.get(h.ticker) ?? []}
            />
          ))}
        </div>
      )}

      {showModal && <AddTickerModal onClose={() => setShowModal(false)} />}
    </>
  );
}

// ── Column header row (draggable) ────────────────────────────────────────────

function ColHeader({
  cols,
  visibleOrdered,
  dragKey,
  dragOver,
  setDragOver,
  onReorder,
}: {
  cols: Set<ColumnKey>;
  visibleOrdered: OrderableKey[];
  dragKey: React.MutableRefObject<OrderableKey | null>;
  dragOver: OrderableKey | null;
  setDragOver: (k: OrderableKey | null) => void;
  onReorder: (from: OrderableKey, to: OrderableKey) => void;
}) {
  return (
    <div className="flex items-center px-3 pb-1.5 gap-3 select-none">
      <div className="w-12 shrink-0 text-[12px] text-gray-500 uppercase tracking-widest font-medium">
        Ticker
      </div>

      {visibleOrdered.map((key) => {
        const { width, label } = COL_META[key];
        const isDragging = dragKey.current === key;
        const isOver = dragOver === key && dragKey.current !== key;

        return (
          <div
            key={key}
            draggable
            className={`${width} shrink-0 relative group/col cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-30' : ''}`}
            onDragStart={(e) => {
              dragKey.current = key;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', key);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOver !== key) setDragOver(key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragKey.current && dragKey.current !== key) onReorder(dragKey.current, key);
              setDragOver(null);
              dragKey.current = null;
            }}
            onDragEnd={() => {
              setDragOver(null);
              dragKey.current = null;
            }}
          >
            {isOver && (
              <span className="absolute -left-1.5 top-0 bottom-0 w-0.5 rounded-full bg-blue-500" />
            )}
            <div className="flex items-center gap-1 text-[12px] text-gray-500 uppercase tracking-widest font-medium">
              <GripIcon />
              <span>{label(cols)}</span>
            </div>
          </div>
        );
      })}

      <div className="flex-1" />
      {/* Anomaly flag header */}
      {cols.has('anomalyFlag') && (
        <div className="w-16 shrink-0">
          <div className="flex items-center gap-1 text-[12px] text-gray-500 uppercase tracking-widest font-medium">
            ANOMALY
          </div>
        </div>
      )}
      {/* Spacer for action buttons */}
      <div className="w-12 shrink-0" />
    </div>
  );
}

// ── Holding row ──────────────────────────────────────────────────────────────

function HoldingRow({
  holding: h,
  quote,
  scan,
  cols,
  visibleOrdered,
  thesisExpanded,
  editExpanded,
  onThesisToggle,
  onEdit,
  onDelete,
  onThesisSave,
  onCostBasisSave,
  onEditSave,
  deleting,
  scanState,
  anomalyFlags = [],
}: {
  holding: Holding;
  quote: QuoteData | null;
  scan: AnalysisScan | null;
  cols: Set<ColumnKey>;
  visibleOrdered: OrderableKey[];
  thesisExpanded: boolean;
  editExpanded: boolean;
  onThesisToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onThesisSave: (thesis: string) => void;
  onCostBasisSave: (v: number | null) => void;
  onEditSave: (data: { shares: number | null; costBasis: number | null }) => void;
  deleting: boolean;
  scanState?: ScanState | null;
  anomalyFlags?: AnomalyFlag[];
}) {
  const router = useRouter();
  const liveQuote = quote && !quote.unavailable ? quote : null;
  const mktVal = h.shares && liveQuote ? h.shares * liveQuote.price : null;
  const pnlPct = h.costBasis && liveQuote
    ? ((liveQuote.price - h.costBasis) / h.costBasis) * 100
    : null;

  // Derive per-row scan status
  const isScanning = scanState?.currentTicker === h.ticker;
  const isCompleted = scanState?.completedTickers.has(h.ticker) ?? false;
  const scanActive = scanState?.scanning;

  return (
    <div className="relative group bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg transition-colors overflow-hidden">
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
        onClick={() => router.push(`/company/${h.ticker}`)}
      >
        {/* Ticker — always first */}
        <div className="w-12 shrink-0 flex items-center gap-1.5">
          <span className="font-mono font-bold text-white text-sm tracking-wide">{h.ticker}</span>
          {isScanning && (
            <span className="w-2.5 h-2.5 border-[1.5px] border-gray-600 border-t-blue-400 rounded-full animate-spin shrink-0" title={scanState?.currentStep ?? 'Analyzing...'} />
          )}
          {!isScanning && isCompleted && scanActive && (
            <svg className="w-3 h-3 text-emerald-400 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
          )}
        </div>

        {/* Data columns in user-defined order */}
        {visibleOrdered.map((key) => {
          const { width } = COL_META[key];

          if (key === 'company') {
            return (
              <div key="company" className={`${width} shrink-0 min-w-0`}>
                {cols.has('company') && (
                  <p className="text-gray-200 text-xs truncate leading-tight">{h.companyName ?? '—'}</p>
                )}
                {cols.has('price') && (
                  <p className={`text-xs font-mono ${cols.has('company') ? 'mt-0.5' : ''} ${
                    liveQuote ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {quote?.unavailable
                      ? <UnavailableLabel />
                      : liveQuote
                      ? `$${liveQuote.price.toFixed(2)}`
                      : '—'}
                  </p>
                )}
              </div>
            );
          }

          if (key === 'buckets') {
            const activeBucket = scan?.bucketPrimary ?? null;
            return (
              <div key="buckets" className={`${width} shrink-0 flex items-center gap-1.5`}>
                {activeBucket ? (
                  <>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${BUCKET_DOT_COLORS[activeBucket]}`} />
                    <span className="text-gray-300 text-[12px] truncate">{BUCKETS[activeBucket - 1]}</span>
                  </>
                ) : (
                  <span className="text-gray-600 text-xs">—</span>
                )}
              </div>
            );
          }

          if (key === 'change') {
            return (
              <div key="change" className={`${width} shrink-0`}>
                {quote?.unavailable ? (
                  <UnavailableLabel />
                ) : liveQuote ? (
                  <span className={`text-xs font-mono font-semibold ${liveQuote.changePercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {liveQuote.changePercentage >= 0 ? '+' : ''}{liveQuote.changePercentage.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-gray-600 text-xs font-mono">—</span>
                )}
              </div>
            );
          }

          if (key === 'thesis') {
            return (
              <div
                key="thesis"
                className={`${width} flex items-center shrink-0`}
                onClick={(e) => { e.stopPropagation(); onThesisToggle(); }}
              >
                <ThesisIndicator thesis={h.thesis} thesisStatus={scan?.thesisStatus ?? null} active={thesisExpanded} />
              </div>
            );
          }

          if (key === 'nextCatalyst') {
            const today = new Date().toISOString().slice(0, 10);
            const nextCat = scan?.catalysts
              ?.filter((c) => c.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
            return (
              <div key="nextCatalyst" className={`${width} shrink-0`}>
                {nextCat ? (
                  <div className="min-w-0">
                    <p className="text-[12px] text-gray-500 font-mono">{nextCat.date.slice(5)}</p>
                    <p className="text-[12px] text-gray-400 truncate" title={nextCat.description}>{nextCat.description}</p>
                  </div>
                ) : (
                  <span className="text-gray-600 text-xs">—</span>
                )}
              </div>
            );
          }

          if (key === 'beta') {
            return (
              <div key="beta" className={`${width} shrink-0`}>
                {h.beta != null ? (
                  <span className={`text-xs font-mono font-semibold ${h.beta > 1.5 ? 'text-amber-400' : h.beta < 0.7 ? 'text-blue-400' : 'text-gray-200'}`}>
                    {h.beta.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-gray-600 text-xs">—</span>
                )}
              </div>
            );
          }

          if (key === 'shares') {
            return (
              <div key="shares" className={`${width} shrink-0`}>
                {h.shares != null ? (
                  <span className="text-gray-200 text-xs font-mono">{h.shares.toLocaleString()}</span>
                ) : (
                  <span className="text-gray-600 text-[13px]">—</span>
                )}
              </div>
            );
          }

          if (key === 'marketValue') {
            return (
              <div key="marketValue" className={`${width} shrink-0`}>
                {mktVal != null ? (
                  <span className="text-gray-200 text-xs font-mono">{formatCurrency(mktVal)}</span>
                ) : (
                  <span className="text-gray-600 text-[13px]">—</span>
                )}
              </div>
            );
          }

          if (key === 'costBasis') {
            return (
              <CostBasisCell
                key="costBasis"
                holding={h}
                width={width}
                onSave={onCostBasisSave}
              />
            );
          }

          if (key === 'pnl') {
            return (
              <div key="pnl" className={`${width} shrink-0`}>
                {pnlPct != null ? (
                  <span className={`text-xs font-mono font-semibold ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-gray-600 text-[13px]">—</span>
                )}
              </div>
            );
          }

          if (key === 'sector') {
            return (
              <div key="sector" className={`${width} shrink-0`}>
                <span className="text-gray-300 text-xs truncate block">{h.sector ?? '—'}</span>
              </div>
            );
          }

          if (key === 'industry') {
            return (
              <div key="industry" className={`${width} shrink-0`}>
                <span className="text-gray-300 text-xs truncate block">{h.industry ?? '—'}</span>
              </div>
            );
          }

          if (key === 'sectorEtf') {
            return (
              <div key="sectorEtf" className={`${width} shrink-0`}>
                <span className="text-gray-400 text-xs font-mono">{h.sectorEtf ?? '—'}</span>
              </div>
            );
          }

          if (key === 'mktCap') {
            const cap = liveQuote?.marketCap;
            return (
              <div key="mktCap" className={`${width} shrink-0`}>
                {cap != null && cap > 0 ? (
                  <span className="text-gray-200 text-xs font-mono">{formatCurrency(cap)}</span>
                ) : (
                  <span className="text-gray-600 text-[13px]">—</span>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Anomaly flag indicator */}
        <div className="flex-1" />
        {cols.has('anomalyFlag') && (
          <div className="w-16 shrink-0 flex">
            {anomalyFlags.length > 0 ? (
              <AnomalyIndicator flags={anomalyFlags} />
            ) : null}
          </div>
        )}
      </div>

      {/* Driver summary — second line */}
      {cols.has('driver') && (
        <div
          className="flex items-center gap-3 px-3 pb-2 cursor-pointer"
          onClick={() => router.push(`/company/${h.ticker}`)}
        >
          <div className="w-12 shrink-0" />
          {scan?.bucketRationale ? (
            <p className="text-gray-400 text-xs truncate flex-1">{truncateWords(scan.bucketRationale!, 15)}</p>
          ) : (
            <p className="text-gray-500 text-xs italic truncate flex-1">
              Run scan to analyze what&apos;s driving this position
            </p>
          )}
        </div>
      )}

      {/* Thesis panel */}
      {thesisExpanded && (
        <ThesisPanel holding={h} onSave={onThesisSave} />
      )}

      {/* Edit panel */}
      {editExpanded && (
        <EditRowPanel
          holding={h}
          onSave={onEditSave}
          onClose={onEdit}
        />
      )}

      {/* Action buttons — visible on hover */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all z-10">
        {/* Edit (pencil) */}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className={`p-1 rounded transition-colors ${
            editExpanded
              ? 'text-blue-400'
              : 'text-gray-600 hover:text-gray-300'
          }`}
          title={`Edit ${h.ticker}`}
        >
          <PencilIcon />
        </button>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={deleting}
          className="p-1 text-gray-600 hover:text-red-400 text-base leading-none transition-colors disabled:opacity-30"
          title={`Remove ${h.ticker}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Edit row panel ────────────────────────────────────────────────────────────

function EditRowPanel({
  holding,
  onSave,
  onClose,
}: {
  holding: Holding;
  onSave: (data: { shares: number | null; costBasis: number | null }) => void;
  onClose: () => void;
}) {
  const [shares, setShares]       = useState(holding.shares?.toString() ?? '');
  const [costBasis, setCostBasis] = useState(holding.costBasis?.toFixed(2) ?? '');
  const [saving, setSaving]       = useState(false);

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    setSaving(true);
    const sharesNum = parseFloat(shares);
    const costNum   = parseFloat(costBasis);
    await onSave({
      shares:    isNaN(sharesNum) || sharesNum <  0 ? null : sharesNum,
      costBasis: isNaN(costNum)   || costNum   <= 0 ? null : costNum,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="border-t border-gray-800 px-4 py-3 bg-gray-950/60"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[13px] text-gray-400 uppercase tracking-widest mb-2.5 font-semibold">
        Edit Position — {holding.ticker}
      </p>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-[13px] text-gray-500 block mb-1">Shares</label>
          <input
            type="number"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="0"
            className="w-24 bg-gray-800 border border-gray-700 focus:border-gray-500 rounded text-xs text-gray-200 px-2 py-1.5 font-mono focus:outline-none transition-colors"
            min="0"
            step="any"
          />
        </div>
        <div>
          <label className="text-[13px] text-gray-500 block mb-1">Cost Basis ($/share)</label>
          <input
            type="number"
            value={costBasis}
            onChange={(e) => setCostBasis(e.target.value)}
            placeholder="0.00"
            className="w-28 bg-gray-800 border border-gray-700 focus:border-gray-500 rounded text-xs text-gray-200 px-2 py-1.5 font-mono focus:outline-none transition-colors"
            min="0"
            step="any"
          />
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cost basis inline edit cell ───────────────────────────────────────────────

function CostBasisCell({
  holding: h,
  width,
  onSave,
}: {
  holding: Holding;
  width: string;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(h.costBasis?.toFixed(2) ?? '');

  function commit() {
    setEditing(false);
    const num = parseFloat(value);
    const next = isNaN(num) || num <= 0 ? null : num;
    if (next !== h.costBasis) onSave(next);
  }

  if (editing) {
    return (
      <div className={`${width} shrink-0`} onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setValue(h.costBasis?.toFixed(2) ?? ''); setEditing(false); }
          }}
          className="w-full bg-gray-800 border border-gray-500 rounded text-xs text-gray-100 font-mono px-1.5 py-0.5 focus:outline-none focus:border-gray-300"
          placeholder="0.00"
          min="0"
          step="any"
        />
      </div>
    );
  }

  return (
    <div
      className={`${width} shrink-0 cursor-text group/cost`}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {h.costBasis != null ? (
        <span className="text-gray-200 text-xs font-mono group-hover/cost:text-white transition-colors">
          ${h.costBasis.toFixed(2)}
        </span>
      ) : (
        <span className="text-gray-600 text-[13px] group-hover/cost:text-gray-400 transition-colors" title="Click to set cost basis">
          set
        </span>
      )}
    </div>
  );
}

// ── Thesis indicator ─────────────────────────────────────────────────────────

function ThesisIndicator({ thesis, thesisStatus, active }: { thesis: string | null; thesisStatus: ThesisStatus | null; active: boolean }) {
  if (!thesis) {
    return (
      <span
        className="text-gray-600 hover:text-gray-400 text-xs leading-none cursor-pointer transition-colors select-none"
        title="No thesis — click to add"
      >
        —
      </span>
    );
  }

  const statusStyle = thesisStatus ? THESIS_STATUS_STYLES[thesisStatus] : 'bg-gray-500 border-gray-400';
  const statusLabel = thesisStatus ? THESIS_STATUS_LABELS[thesisStatus] : 'Not scanned';

  return (
    <div className="flex items-center gap-1.5 cursor-pointer" title={active ? 'Click to collapse' : statusLabel}>
      <div className={`w-2 h-2 rounded-full border transition-colors ${active ? 'bg-blue-400 border-blue-300' : statusStyle}`} />
      {thesisStatus && (
        <span className={`text-[12px] ${
          thesisStatus === 'confirmed' ? 'text-emerald-400' :
          thesisStatus === 'challenged' ? 'text-red-400' :
          'text-amber-400'
        }`}>
          {THESIS_STATUS_LABELS[thesisStatus]}
        </span>
      )}
    </div>
  );
}

// ── Thesis panel ─────────────────────────────────────────────────────────────

function ThesisPanel({ holding, onSave }: { holding: Holding; onSave: (t: string) => void }) {
  const [text, setText] = useState(holding.thesis ?? '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    setSaving(true);
    await onSave(text);
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  return (
    <div
      className="border-t border-gray-800 px-4 py-3 bg-gray-950/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[13px] text-gray-400 uppercase tracking-widest mb-1.5 font-semibold">
            Investment Thesis — {holding.ticker}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Why are you holding ${holding.ticker}? What's your bull case?`}
            className="w-full bg-gray-800 border border-gray-700 focus:border-gray-500 rounded-md text-xs text-gray-200 placeholder-gray-600 p-2.5 resize-none focus:outline-none transition-colors leading-relaxed"
            rows={3}
          />
          <div className="flex items-center gap-2.5 mt-1.5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save thesis'}
            </button>
            {savedMsg && <span className="text-emerald-400 text-xs">Saved ✓</span>}
          </div>
        </div>

        <div>
          <p className="text-[13px] text-gray-400 uppercase tracking-widest mb-1.5 font-semibold">
            Thesis Check
          </p>
          <div className="bg-gray-800 border border-gray-700 rounded-md p-3 min-h-[80px] flex items-center justify-center">
            <p className="text-gray-500 text-xs italic text-center leading-relaxed">
              Run scan to check thesis against recent developments
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Anomaly flag indicator ────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { icon: string; bg: string; border: string }> = {
  high:   { icon: 'text-red-400',    bg: 'bg-red-950',    border: 'border-red-800'    },
  medium: { icon: 'text-amber-400',  bg: 'bg-amber-950',  border: 'border-amber-800'  },
  low:    { icon: 'text-yellow-500', bg: 'bg-yellow-950', border: 'border-yellow-800' },
};

function AnomalyIndicator({ flags }: { flags: AnomalyFlag[] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const highest = flags.find((f) => f.severity === 'high')
    ?? flags.find((f) => f.severity === 'medium')
    ?? flags[0];
  const colors = SEVERITY_COLORS[highest.severity] ?? SEVERITY_COLORS.low;

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-50" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
      </span>

      {showTooltip && (
        <div className={`absolute right-6 top-1/2 -translate-y-1/2 z-50 w-64 ${colors.bg} border ${colors.border} rounded-lg shadow-2xl p-2.5`}>
          {flags.map((flag, i) => (
            <div key={flag.id} className={i > 0 ? 'mt-2 pt-2 border-t border-gray-800' : ''}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[12px] font-semibold uppercase tracking-wider ${SEVERITY_COLORS[flag.severity]?.icon ?? 'text-gray-400'}`}>
                  {flag.severity}
                </span>
                <span className="text-[12px] text-gray-500">{flag.flagType.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-[12px] text-gray-300 leading-relaxed">{flag.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Unavailable data indicator ────────────────────────────────────────────────

function UnavailableLabel() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-gray-600 text-[13px] italic">Unavailable</span>
      <span
        title="Price data for this ticker requires a premium FMP subscription"
        className="cursor-help"
      >
        <InfoIcon />
      </span>
    </span>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg
      width="6" height="10" viewBox="0 0 6 10"
      className="shrink-0 opacity-0 group-hover/col:opacity-40 transition-opacity"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="1.5" cy="1.5" r="1" />
      <circle cx="4.5" cy="1.5" r="1" />
      <circle cx="1.5" cy="5" r="1" />
      <circle cx="4.5" cy="5" r="1" />
      <circle cx="1.5" cy="8.5" r="1" />
      <circle cx="4.5" cy="8.5" r="1" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 1.5a1.414 1.414 0 012 2L3.5 10.5H1.5v-2L8.5 1.5z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <circle cx="5" cy="5" r="4.25" stroke="currentColor" strokeWidth="1" className="text-gray-700" />
      <rect x="4.5" y="4.25" width="1" height="3" rx="0.5" fill="currentColor" className="text-gray-600" />
      <circle cx="5" cy="2.75" r="0.6" fill="currentColor" className="text-gray-600" />
    </svg>
  );
}
