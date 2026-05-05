'use client';

import { useState, useCallback, useEffect } from 'react';
import { HoldingsList } from './HoldingsList';
import { CorrelationHeatmap } from './CorrelationHeatmap';
import { useScanState } from './ScanContext';
import Link from 'next/link';
import { Holding, AnalysisScan, RegimeSnapshot, AnomalyFlag, Catalyst } from '@/types';
import { QuoteData } from '@/lib/fmp/quotes';
import type { CorrelationMatrix } from '@/lib/analysis/correlation';
import { BUCKET_LABELS } from '@/lib/config/constants';


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
  const { scanState } = useScanState();

  // Collapsible panels
  const [catalystsCollapsed, toggleCatalysts] = useDashCollapse('catalysts', true);
  const [holdingsCollapsed, toggleHoldings]   = useDashCollapse('holdings', false);
  const [heatmapCollapsed, toggleHeatmap]     = useDashCollapse('heatmap', true);

  const scanComplete = scanState && !scanState.scanning && scanState.completedTickers.size > 0;
  const scanActive = scanState?.scanning;
  const scanPct = scanState && scanState.totalTickers > 0
    ? (scanState.completedTickers.size / scanState.totalTickers) * 100
    : 0;

  return (
    <div>
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
                <span className="text-[12px] text-gray-500 font-mono shrink-0 ml-2">
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

      <div className="grid grid-cols-12 gap-3">
        {/* Row 1: Portfolio Drivers (left) + Thesis Tracker (right) */}
        <div className="col-span-6">
          <DraggablePanel title="Today's Portfolio Drivers">
            <PortfolioDriversContent latestScans={latestScans} />
          </DraggablePanel>
        </div>
        <div className="col-span-6">
          <DraggablePanel title="Thesis Tracker">
            <ThesisTrackerContent holdings={holdings} latestScans={latestScans} />
          </DraggablePanel>
        </div>

        {/* Row 2: Upcoming Catalysts full width */}
        <div className="col-span-12">
          <DraggablePanel title="Upcoming Catalysts" subtitle="next 30 days across all holdings" collapsed={catalystsCollapsed} onToggle={toggleCatalysts}>
            <PortfolioCatalystsContent latestScans={latestScans} />
          </DraggablePanel>
        </div>

        {/* Row 3: Holdings + Correlation Heatmap */}
        <div className="col-span-7">
          <DraggablePanel title="Holdings" collapsed={holdingsCollapsed} onToggle={toggleHoldings}>
            <HoldingsList holdings={holdings} quotes={quotes} scanState={scanState} latestScans={latestScans} anomalies={anomalies} />
          </DraggablePanel>
        </div>
        <div className="col-span-5">
          <DraggablePanel title="Correlation Heatmap" subtitle="90-day rolling" collapsed={heatmapCollapsed} onToggle={toggleHeatmap}>
            <CorrelationHeatmap data={correlationData} />
          </DraggablePanel>
        </div>
      </div>
    </div>
  );
}

// ── Collapse persistence ─────────────────────────────────────────────────���────

const COLLAPSE_PREFIX = 'pm:dash-collapse:';

function useDashCollapse(panelId: string, defaultCollapsed: boolean) {
  const key = `${COLLAPSE_PREFIX}${panelId}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return saved === '1';
    } catch {}
    return defaultCollapsed;
  });

  useEffect(() => {
    try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch {}
  }, [key, collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  return [collapsed, toggle] as const;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
    >
      <path d="M5 3l4 4-4 4" />
    </svg>
  );
}

// ── DraggablePanel ────────────────────────────────────────────────────────────

function DraggablePanel({
  title,
  subtitle,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const isCollapsible = onToggle != null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg flex flex-col">
      <div className="panel-drag-handle flex items-center gap-2 px-4 h-9 border-b border-gray-800/60 select-none shrink-0">
        <PanelGripIcon />
        <h3 className="text-[13px] font-semibold text-gray-300 uppercase tracking-widest">{title}</h3>
        {subtitle && <span className="text-[13px] text-gray-400">{subtitle}</span>}
        {isCollapsible && (
          <button
            onClick={onToggle}
            className="ml-auto p-1 rounded hover:bg-gray-800 transition-colors"
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          >
            <ChevronIcon expanded={!collapsed} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="p-4">
          {children}
        </div>
      )}
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
            <span className="text-[12px] font-mono font-semibold text-gray-200 shrink-0 w-12 pt-px">
              {item.ticker}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
              item.status === 'confirmed' ? 'bg-emerald-500' :
              item.status === 'challenged' ? 'bg-red-500' :
              item.status === 'neutral' ? 'bg-amber-500' :
              'bg-gray-600'
            }`} />
            <span className="text-[12px] text-gray-400 leading-relaxed line-clamp-1 flex-1">{item.analysis}</span>
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

  // Find an AI summary line from the highest-confidence scan
  const topScan = scans
    .filter((s) => s.bucketRationale)
    .sort((a, b) => {
      const confOrder = { high: 0, medium: 1, low: 2 };
      return (confOrder[a.bucketConfidence ?? 'low'] ?? 2) - (confOrder[b.bucketConfidence ?? 'low'] ?? 2);
    })[0];

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
              <span className="text-[12px] text-gray-500 w-8 text-right">{counts[bucket]}</span>
            </div>
          );
        })}
      </div>
      {topScan?.bucketRationale && (
        <p className="mt-3 text-[12px] text-gray-400 leading-relaxed line-clamp-2">{topScan.bucketRationale}</p>
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
  // Aggregate catalysts: max 2 per company (highest impact first)
  const allCatalysts: Array<Catalyst & { ticker: string }> = [];
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

  for (const [ticker, scan] of Object.entries(latestScans)) {
    if (scan.catalysts && scan.catalysts.length > 0) {
      // Sort by thesis relevance + category priority, take top 2
      const sorted = [...scan.catalysts].sort((a, b) => {
        if (a.thesisRelevance && !b.thesisRelevance) return -1;
        if (!a.thesisRelevance && b.thesisRelevance) return 1;
        // Prefer thesis/fundamental categories as higher impact
        const catPriority: Record<string, number> = { thesis: 0, fundamental: 1, sector: 2, macro: 3, sentiment: 4 };
        return (catPriority[a.category] ?? 5) - (catPriority[b.category] ?? 5);
      });
      for (const c of sorted.slice(0, 2)) {
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

  // Filter to next 30 days
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allCatalysts.filter((c) => c.date >= today);

  // Deduplicate: group by normalized description (first part before " - ") + date
  // If the same event hits multiple tickers, merge them into one row
  const deduped: Array<{ description: string; date: string; category: string; tickers: string[] }> = [];
  const seen = new Map<string, number>(); // key -> index in deduped

  for (const c of upcoming) {
    const shortDesc = c.description.split(' - ')[0].trim().toLowerCase();
    const key = `${c.date}::${shortDesc}`;
    const existing = seen.get(key);
    if (existing != null) {
      if (!deduped[existing].tickers.includes(c.ticker)) {
        deduped[existing].tickers.push(c.ticker);
      }
    } else {
      seen.set(key, deduped.length);
      deduped.push({
        description: c.description.split(' - ')[0].trim(),
        date: c.date,
        category: c.category,
        tickers: [c.ticker],
      });
    }
  }

  // Sort by date, limit total
  const sorted = deduped.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);

  return (
    <div className="space-y-2">
      {sorted.map((c, i) => {
        const daysUntil = Math.ceil((new Date(c.date).getTime() - Date.now()) / 86400000);
        // Truncate to ~100 chars
        const desc = c.description.length > 100 ? c.description.slice(0, 97) + '…' : c.description;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[12px] font-mono text-gray-500 w-14 shrink-0">{c.date.slice(5)}</span>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_COLORS[c.category] ?? 'bg-gray-500'}`} />
            <span className="text-[12px] font-mono font-semibold text-gray-200 shrink-0">{c.tickers.join(', ')}</span>
            <span className="text-[12px] text-gray-400 flex-1 truncate">{desc}</span>
            <span className="text-[12px] text-gray-600 shrink-0">{daysUntil}d</span>
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
