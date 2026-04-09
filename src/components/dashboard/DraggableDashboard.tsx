'use client';

import { useState, useCallback } from 'react';
import { GridLayout, useContainerWidth, Layout, LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { HoldingsList } from './HoldingsList';
import { CorrelationHeatmap } from './CorrelationHeatmap';
import { useScanState } from './ScanContext';
import Link from 'next/link';
import { Holding, AnalysisScan, RegimeSnapshot, AnomalyFlag, Catalyst } from '@/types';
import { QuoteData } from '@/lib/fmp/quotes';
import type { CorrelationMatrix } from '@/lib/analysis/correlation';
import { BUCKET_LABELS } from '@/lib/config/constants';

const STORAGE_KEY = 'pm:dashboard-layout';
const ROW_HEIGHT = 50;
const MARGIN: [number, number] = [12, 12];

const DEFAULT_LAYOUT: LayoutItem[] = [
  // Row 1: Portfolio Drivers (left) + Thesis Tracker (right), ~50/50
  { i: 'drivers',   x: 0, y: 0,  w: 6,  h: 6,  minW: 3, minH: 3 },
  { i: 'thesis',    x: 6, y: 0,  w: 6,  h: 6,  minW: 3, minH: 3 },
  // Row 2: Upcoming Catalysts full width
  { i: 'catalysts', x: 0, y: 6,  w: 12, h: 4,  minW: 4, minH: 2 },
  // Row 3: Holdings (~60%) + Correlation Heatmap (~40%)
  { i: 'holdings',  x: 0, y: 10, w: 7,  h: 12, minW: 4, minH: 5 },
  { i: 'heatmap',   x: 7, y: 10, w: 5,  h: 12, minW: 3, minH: 3 },
];

function loadLayout(): LayoutItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(saved) as LayoutItem[];
    const savedKeys = new Set(parsed.map((l) => l.i));
    const missing = DEFAULT_LAYOUT.filter((d) => !savedKeys.has(d.i));
    return [...parsed, ...missing];
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveLayout(layout: Layout) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch {}
}

export interface DraggableDashboardProps {
  holdings: Holding[];
  quotes: Record<string, QuoteData>;
  totalHoldings: number;
  thesisConfirmed: number;
  thesisPressure: number;
  thesisChallenged: number;
  thesisUnset: number;
  thesisAtRisk: Array<{ ticker: string; analysis: string }>;
  correlationData: CorrelationMatrix | null;
  latestScans?: Record<string, AnalysisScan>;
  regime?: RegimeSnapshot | null;
  anomalies?: AnomalyFlag[];
}

export default function DraggableDashboard({
  holdings,
  quotes,
  totalHoldings,
  thesisConfirmed,
  thesisPressure,
  thesisChallenged,
  thesisUnset,
  thesisAtRisk,
  correlationData,
  latestScans = {},
  anomalies = [],
}: DraggableDashboardProps) {
  const [layout, setLayout] = useState<LayoutItem[]>(loadLayout);
  const { scanState } = useScanState();
  const { width, containerRef, mounted } = useContainerWidth();

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayout([...newLayout]);
    saveLayout(newLayout);
  }, []);

  const scanComplete = scanState && !scanState.scanning && scanState.completedTickers.size > 0;
  const scanActive = scanState?.scanning;
  const scanPct = scanState && scanState.totalTickers > 0
    ? (scanState.completedTickers.size / scanState.totalTickers) * 100
    : 0;

  return (
    <div ref={containerRef}>
      {/* ── Scan progress bar ── */}
      {scanState && (scanActive || scanComplete) && (
        <div className="mb-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 flex items-center gap-3">
          {scanActive && (
            <span className="w-3.5 h-3.5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin shrink-0" />
          )}
          {scanComplete && (
            <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" />
            </svg>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-300 font-medium truncate">
                {scanComplete
                  ? 'Scan complete'
                  : scanState.message || 'Starting scan...'}
              </span>
              {scanState.totalTickers > 0 && (
                <span className="text-[11px] text-gray-500 font-mono shrink-0 ml-2">
                  {scanState.completedTickers.size} of {scanState.totalTickers}
                </span>
              )}
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${scanComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${scanPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{
            cols: 12,
            rowHeight: ROW_HEIGHT,
            margin: MARGIN,
            containerPadding: [0, 0],
          }}
          dragConfig={{
            enabled: true,
            handle: '.panel-drag-handle',
            threshold: 4,
          }}
          resizeConfig={{
            enabled: true,
            handles: ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'],
          }}
          onLayoutChange={handleLayoutChange}
        >
          {/* ── Holdings ── */}
          <div key="holdings">
            <div className="h-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
              <div className="panel-drag-handle flex items-center justify-center h-6 border-b border-gray-800/50 cursor-grab active:cursor-grabbing select-none shrink-0">
                <PanelGripIcon />
              </div>
              <div className="flex-1 overflow-y-auto p-3 pt-2">
                <HoldingsList holdings={holdings} quotes={quotes} scanState={scanState} latestScans={latestScans} />
              </div>
            </div>
          </div>

          {/* ── Correlation Heatmap ── */}
          <div key="heatmap">
            <DraggablePanel title="Correlation Heatmap" subtitle="90-day rolling">
              <CorrelationHeatmap data={correlationData} />
            </DraggablePanel>
          </div>

          {/* ── Portfolio Drivers ── */}
          <div key="drivers">
            <DraggablePanel title="Portfolio Drivers">
              <PortfolioDriversContent latestScans={latestScans} />
            </DraggablePanel>
          </div>

          {/* ── Thesis Tracker ── */}
          <div key="thesis">
            <DraggablePanel title="Thesis Tracker">
              <ThesisTrackerContent
                holdings={holdings}
                latestScans={latestScans}
              />
            </DraggablePanel>
          </div>

          {/* ── Upcoming Catalysts ── */}
          <div key="catalysts">
            <DraggablePanel title="Upcoming Catalysts" subtitle="next 30 days across all holdings">
              <PortfolioCatalystsContent latestScans={latestScans} />
            </DraggablePanel>
          </div>
        </GridLayout>
      )}
    </div>
  );
}

// ── DraggablePanel ────────────────────────────────────────────────────────────

function DraggablePanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
      <div className="panel-drag-handle flex items-center gap-2 px-4 h-9 border-b border-gray-800/60 cursor-grab active:cursor-grabbing select-none shrink-0">
        <PanelGripIcon />
        <h3 className="text-[13px] font-semibold text-gray-300 uppercase tracking-widest">{title}</h3>
        {subtitle && <span className="text-[13px] text-gray-400">{subtitle}</span>}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  );
}

// ── ThesisTrackerContent ──────────────────────────────────────────────────────

function ThesisTrackerContent({
  holdings,
  latestScans,
}: {
  holdings: Holding[];
  latestScans: Record<string, AnalysisScan>;
}) {
  // Extract the "today" explanation from the thesis check JSON
  function extractThesisSummary(raw: string | null, fallback: string): string {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      // ThesisCheck shape: { status, past, today: { explanation }, forward }
      if (parsed?.today?.explanation) return parsed.today.explanation;
      if (typeof parsed === 'string') return parsed;
      return fallback;
    } catch {
      // If it's already a plain string (not JSON), use it directly
      return raw;
    }
  }

  // Compute counts and per-stock statuses
  let confirmed = 0, pressure = 0, challenged = 0, unset = 0;
  const stockStatuses: Array<{ ticker: string; status: string | null; analysis: string }> = [];

  for (const h of holdings) {
    const scan = latestScans[h.ticker];
    const hasThesis = !!h.thesis?.trim();

    if (!hasThesis || !scan?.thesisStatus) {
      unset++;
      stockStatuses.push({ ticker: h.ticker, status: null, analysis: hasThesis ? 'Not scanned' : 'No thesis set' });
    } else if (scan.thesisStatus === 'confirmed') {
      confirmed++;
      stockStatuses.push({ ticker: h.ticker, status: 'confirmed', analysis: extractThesisSummary(scan.thesisAnalysis, 'Thesis confirmed') });
    } else if (scan.thesisStatus === 'challenged') {
      challenged++;
      stockStatuses.push({ ticker: h.ticker, status: 'challenged', analysis: extractThesisSummary(scan.thesisAnalysis, 'Thesis challenged') });
    } else {
      pressure++;
      stockStatuses.push({ ticker: h.ticker, status: 'neutral', analysis: extractThesisSummary(scan.thesisAnalysis, 'Under pressure') });
    }
  }

  const total = confirmed + pressure + challenged + unset;
  const segments =
    total > 0
      ? [
          { pct: (confirmed  / total) * 100, color: 'bg-emerald-500' },
          { pct: (pressure   / total) * 100, color: 'bg-amber-400'   },
          { pct: (challenged / total) * 100, color: 'bg-red-500'     },
          { pct: (unset      / total) * 100, color: 'bg-gray-700'    },
        ].filter((s) => s.pct > 0)
      : [{ pct: 100, color: 'bg-gray-700' }];

  // Sort: challenged first, then pressure, then confirmed, then unset
  const statusOrder: Record<string, number> = { challenged: 0, neutral: 1, confirmed: 2 };
  const sorted = [...stockStatuses].sort((a, b) => {
    const aOrder = a.status ? (statusOrder[a.status] ?? 3) : 3;
    const bOrder = b.status ? (statusOrder[b.status] ?? 3) : 3;
    return aOrder - bOrder;
  });

  return (
    <>
      <div className="h-2 flex rounded-full overflow-hidden bg-gray-800">
        {segments.map((seg, i) => (
          <div key={i} className={`${seg.color} h-full`} style={{ width: `${seg.pct}%` }} />
        ))}
      </div>

      <p className="text-[13px] mt-2 leading-relaxed">
        <span className="text-emerald-400">{confirmed} confirmed</span>
        <span className="text-gray-500"> · </span>
        <span className="text-amber-400">{pressure} pressure</span>
        <span className="text-gray-500"> · </span>
        <span className="text-red-400">{challenged} challenged</span>
        <span className="text-gray-500"> · </span>
        <span className="text-gray-400">{unset} unset</span>
      </p>

      <div className="mt-3 space-y-1">
        {sorted.map((item) => (
          <Link
            key={item.ticker}
            href={`/company/${item.ticker}`}
            className="flex items-start gap-2 hover:bg-gray-800/50 rounded px-1 py-0.5 -mx-1 transition-colors"
          >
            <span className="text-[11px] font-mono font-semibold text-gray-200 shrink-0 w-12 pt-px">
              {item.ticker}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
              item.status === 'confirmed' ? 'bg-emerald-500' :
              item.status === 'challenged' ? 'bg-red-500' :
              item.status === 'neutral' ? 'bg-amber-500' :
              'bg-gray-600'
            }`} />
            <span className="text-[11px] text-gray-400 leading-relaxed line-clamp-1 flex-1">{item.analysis}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

// ── PortfolioDriversContent ───────────────────────────────────────────────────

const BUCKET_BAR_COLORS: Record<number, string> = {
  1: 'bg-indigo-400',
  2: 'bg-blue-500',
  3: 'bg-amber-500',
  4: 'bg-emerald-500',
};

function PortfolioDriversContent({ latestScans }: { latestScans: Record<string, AnalysisScan> }) {
  const scans = Object.values(latestScans).filter((s) => s.bucketPrimary != null);
  if (scans.length === 0) {
    return (
      <>
        <Placeholder text="Run scan to see what's driving your portfolio" />
        <div className="mt-4 space-y-2 opacity-20">
          {[
            { label: 'Market Beta',  w: 'w-3/4', color: 'bg-indigo-400'  },
            { label: 'Sector/Macro', w: 'w-1/2', color: 'bg-blue-500'    },
            { label: 'Sentiment',    w: 'w-1/4', color: 'bg-amber-500'   },
            { label: 'Fundamental',  w: 'w-1/3', color: 'bg-emerald-500' },
          ].map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="text-gray-400 text-xs w-28 shrink-0">{b.label}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full">
                <div className={`${b.w} ${b.color} h-full rounded-full`} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // Count bucket distribution
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const s of scans) counts[s.bucketPrimary!]++;
  const total = scans.length;

  // Top drivers
  const topDrivers = scans
    .filter((s) => s.bucketRationale)
    .sort((a, b) => {
      const confOrder = { high: 0, medium: 1, low: 2 };
      return (confOrder[a.bucketConfidence ?? 'low'] ?? 2) - (confOrder[b.bucketConfidence ?? 'low'] ?? 2);
    })
    .slice(0, 5);

  return (
    <>
      <div className="space-y-2">
        {([1, 2, 3, 4] as const).map((bucket) => {
          const pct = total > 0 ? (counts[bucket] / total) * 100 : 0;
          return (
            <div key={bucket} className="flex items-center gap-2">
              <span className="text-gray-400 text-xs w-28 shrink-0">{BUCKET_LABELS[bucket]}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full">
                <div className={`${BUCKET_BAR_COLORS[bucket]} h-full rounded-full transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
              <span className="text-[11px] text-gray-500 w-8 text-right">{counts[bucket]}</span>
            </div>
          );
        })}
      </div>
      {topDrivers.length > 0 && (
        <div className="mt-3 space-y-2">
          {topDrivers.map((s) => (
            <div key={s.ticker} className="flex gap-2 items-start">
              <span className="text-[11px] font-mono font-semibold text-gray-200 shrink-0 pt-px w-12">{s.ticker}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 shrink-0">
                {BUCKET_LABELS[s.bucketPrimary!]}
              </span>
              <span className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{s.bucketRationale}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── PortfolioCatalystsContent ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  thesis: 'bg-violet-500',
  macro: 'bg-indigo-400',
  sector: 'bg-blue-500',
  sentiment: 'bg-cyan-500',
  fundamental: 'bg-emerald-500',
};

function PortfolioCatalystsContent({ latestScans }: { latestScans: Record<string, AnalysisScan> }) {
  // Aggregate all catalysts from all scans
  const allCatalysts: Array<Catalyst & { ticker: string }> = [];
  for (const [ticker, scan] of Object.entries(latestScans)) {
    if (scan.catalysts) {
      for (const c of scan.catalysts) {
        allCatalysts.push({ ...c, ticker });
      }
    }
  }

  if (allCatalysts.length === 0) {
    return (
      <>
        <Placeholder text="Run scan to detect upcoming earnings, events, and catalysts across your portfolio" />
        <div className="mt-4 flex items-end gap-1.5 opacity-20">
          {[12,18,10,24,14,8,20,16,22,10,18,14,26,12,20,8,16,22,14,18,10,24,16,12,20,8,18,22,14,16].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-gray-700" style={{ height: `${h}px` }} />
          ))}
        </div>
      </>
    );
  }

  // Sort by date, take next 30 days
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allCatalysts
    .filter((c) => c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  return (
    <div className="space-y-2">
      {upcoming.map((c, i) => {
        const daysUntil = Math.ceil((new Date(c.date).getTime() - Date.now()) / 86400000);
        return (
          <div key={`${c.ticker}-${i}`} className="flex items-start gap-2">
            <span className="text-[11px] font-mono text-gray-500 w-14 shrink-0">{c.date.slice(5)}</span>
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${CATEGORY_COLORS[c.category] ?? 'bg-gray-500'}`} />
            <span className="text-[11px] font-mono font-semibold text-gray-200 w-12 shrink-0">{c.ticker}</span>
            <span className="text-[11px] text-gray-400 leading-relaxed flex-1 line-clamp-1">{c.description}</span>
            <span className="text-[10px] text-gray-600 shrink-0">{daysUntil}d</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Placeholder ───────────────────────────────────────────────────────────────

function Placeholder({ text }: { text: string }) {
  return <p className="text-xs text-gray-300 text-center py-2">{text}</p>;
}

// ── PanelGripIcon ─────────────────────────────────────────────────────────────

function PanelGripIcon() {
  return (
    <svg
      width="12" height="8" viewBox="0 0 12 8"
      fill="currentColor"
      className="text-gray-600 shrink-0"
      aria-hidden="true"
    >
      <rect x="0" y="0"    width="12" height="1.5" rx="0.75" />
      <rect x="0" y="3.25" width="12" height="1.5" rx="0.75" />
      <rect x="0" y="6.5"  width="12" height="1.5" rx="0.75" />
    </svg>
  );
}
