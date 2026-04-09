'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GridLayout, useContainerWidth, Layout, LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { FiveNumbers, MetricCardData } from './FiveNumbers';
import { SankeyChart } from './SankeyChart';
import type { RawNode, RawLink } from './SankeyChart';
import type { IncomeQ, CashFlowQ, BalanceSheetQ, AnalystEstimate } from '@/lib/fmp/financials';
import { SectorRelativeChart, RelativePerfPoint } from './SectorRelativeChart';
import type { PeerRow, RevenueSegment, AnalysisScan, NewsSentiment, DriverAnalysis, ThesisCheck, Catalyst, Bucket, BucketConfidence } from '@/types';
import { fmtB, pctAbs } from '@/utils/format';
import { BUCKET_LABELS } from '@/lib/config/constants';

// Bump key to force-reset any cached layouts when the default arrangement changes
const STORAGE_KEY = 'pm:company-layout-v7';
const ROW_HEIGHT = 50;
const MARGIN: [number, number] = [12, 12];

// ── Default layout — no dead-space gaps between rows ──────────────────────────
//
// Pixel height of panel = h * (ROW_HEIGHT + MARGIN) - MARGIN = h*62 - 12
//
// Row 1: Driver (left, h=8, ends y=8) | Thesis (right, h=6, ends y=6)
// Row 2: Sentiment (left, y=8, h=4, ends y=12) | SectorRel (right, y=6, h=6, ends y=12)
//         ↑ both columns end at y=12
// Row 3: Catalysts full-width at y=12, h=4, ends y=16
// Row 4: 5Numbers (left, h=8, ends y=24) | RevenueFlow (right, h=8, ends y=24)
//         ↑ 5Numbers stretched to match RevenueFlow bottom edge — both end at y=24
// Row 5: Fundamentals full-width at y=24, h=4 (snug fit for table content)

const DEFAULT_LAYOUT: LayoutItem[] = [
  // Row 1: Driver (left, 40%) | Thesis (right, 60%)
  { i: 'driver',       x: 0,  y: 0,  w: 5,  h: 8,  minW: 3, minH: 3 },
  { i: 'thesis',       x: 5,  y: 0,  w: 7,  h: 6,  minW: 4, minH: 4 },
  // Row 2: Sentiment & SectorRel — both end at y=12, flush with Catalysts below
  { i: 'sentiment',    x: 0,  y: 8,  w: 5,  h: 4,  minW: 3, minH: 3 },
  { i: 'sectorrel',    x: 5,  y: 6,  w: 7,  h: 6,  minW: 4, minH: 5 },
  // Row 3: Catalysts full-width, y=12
  { i: 'catalysts',    x: 0,  y: 12, w: 12, h: 4,  minW: 6, minH: 3 },
  // Row 4: Metrics & Revenue Flow — both end at y=24, flush with Fundamentals below
  { i: '5numbers',     x: 0,  y: 16, w: 5,  h: 8,  minW: 3, minH: 5 },
  { i: 'revenueflow',  x: 5,  y: 16, w: 7,  h: 8,  minW: 5, minH: 5 },
  // Row 5: Fundamentals full-width, h=4 (236px — snug fit for 8-quarter table)
  { i: 'fundamentals', x: 0,  y: 24, w: 12, h: 4,  minW: 6, minH: 3 },
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

export interface CompanyGridProps {
  ticker: string;
  sectorEtf: string;
  initialThesis: string | null;
  fiveCards: MetricCardData[];
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  balanceSheet: BalanceSheetQ[];
  peerRows: PeerRow[];
  segments: RevenueSegment[];
  relativePerfData: RelativePerfPoint[];
  intradayPerfData: RelativePerfPoint[];
  pePercentile: number | null;
  annualIncome: IncomeQ[];
  annualCashFlow: CashFlowQ[];
  analystEstimates: AnalystEstimate[];
  quarterlyEstimates: AnalystEstimate[];
  latestScan?: AnalysisScan | null;
}

export default function CompanyGrid({ ticker, sectorEtf, initialThesis, fiveCards, income, cashFlow, balanceSheet, peerRows, segments, relativePerfData, intradayPerfData, pePercentile, annualIncome, annualCashFlow, analystEstimates, quarterlyEstimates, latestScan }: CompanyGridProps) {
  const router = useRouter();
  const [layout, setLayout] = useState<LayoutItem[]>(loadLayout);
  const sankeyData = useMemo(() => buildSankeyFromIncome(income, segments), [income, segments]);
  const { width, containerRef, mounted } = useContainerWidth();

  // Extract AI scan data
  const sentiment: NewsSentiment | null = latestScan?.newsSentiment ?? null;
  const driverAnalysis: DriverAnalysis | null = latestScan?.driverAnalysis ?? null;
  const thesisCheck: ThesisCheck | null = useMemo(() => {
    if (!latestScan?.thesisAnalysis) return null;
    try { return JSON.parse(latestScan.thesisAnalysis) as ThesisCheck; } catch { return null; }
  }, [latestScan?.thesisAnalysis]);
  const catalysts: Catalyst[] = latestScan?.catalysts ?? [];
  const sectorRelForward: string | null = latestScan?.sectorRelative?.forwardOutlook ?? null;

  const [thesisText, setThesisText]         = useState(initialThesis ?? '');
  const [thesisModified, setThesisModified] = useState(false);
  const [thesisSaving, setThesisSaving]     = useState(false);

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayout([...newLayout]);
    saveLayout(newLayout);
  }, []);

  async function handleThesisSave() {
    setThesisSaving(true);
    try {
      await fetch(`/api/holdings/${ticker}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesis: thesisText }),
      });
      setThesisModified(false);
      router.refresh();
    } finally {
      setThesisSaving(false);
    }
  }

  const thesisSet = !!thesisText.trim();

  return (
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: ROW_HEIGHT, margin: MARGIN, containerPadding: [0, 0] }}
          dragConfig={{ enabled: true, handle: '.panel-drag-handle', threshold: 4 }}
          resizeConfig={{ enabled: true, handles: ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] }}
          onLayoutChange={handleLayoutChange}
        >
          {/* ── Sentiment ── */}
          <div key="sentiment">
            <DraggablePanel title="Sentiment" badge={sentiment ? sentiment.sentiment : undefined}>
              {sentiment ? (
                <div className="space-y-4">
                  <p className="text-xs text-gray-300 leading-relaxed">{sentiment.summary}</p>
                  {sentiment.keyHeadlines.length > 0 && (
                    <div>
                      <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Key Headlines</p>
                      <ul className="space-y-1">
                        {sentiment.keyHeadlines.slice(0, 4).map((h, i) => (
                          <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                            <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="space-y-2">
                    <SentimentBar label="Overall" score={sentiment.score} />
                    <SentimentBar label="Twitter/X" score={sentiment.twitterScore} />
                    <SentimentBar label="Reddit" score={sentiment.redditScore} />
                    <SentimentBar label="Media" score={sentiment.mediaScore} />
                    <SentimentBar label="Analysts" score={sentiment.analystScore} />
                  </div>
                  {sentiment.socialBuzz && (
                    <p className="text-[11px] text-gray-500 italic">{sentiment.socialBuzz}</p>
                  )}
                </div>
              ) : (
                <>
                  <Placeholder text="Run scan to get an AI synthesis of current sentiment across news, social media, and analysts" />
                  <div className="mt-4 space-y-3 opacity-25 pointer-events-none">
                    {[
                      { label: 'Overall',   w: 'w-1/3' },
                      { label: 'Twitter/X', w: 'w-1/2' },
                      { label: 'Reddit',    w: 'w-1/4' },
                      { label: 'Media',     w: 'w-2/5' },
                      { label: 'Analysts',  w: 'w-3/5' },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center gap-2">
                        <span className="text-[13px] text-gray-400 w-20 shrink-0">{row.label}</span>
                        <div className={`h-4 ${row.w} bg-gray-700 rounded-sm`} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </DraggablePanel>
          </div>

          {/* ── Thesis ── */}
          <div key="thesis">
            <DraggablePanel title="Thesis">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest">
                    Your thesis
                  </span>
                  {thesisModified && (
                    <button
                      onClick={handleThesisSave}
                      disabled={thesisSaving}
                      className="text-[13px] px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded transition-colors"
                    >
                      {thesisSaving ? 'Saving…' : 'Save'}
                    </button>
                  )}
                </div>
                <textarea
                  value={thesisText}
                  onChange={(e) => { setThesisText(e.target.value); setThesisModified(true); }}
                  placeholder={`Why do you own ${ticker}? What has to be true for this investment to work?`}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 placeholder:text-gray-500 resize-none focus:outline-none focus:border-gray-600 transition-colors leading-relaxed"
                />
              </div>

              <div className="divide-y divide-gray-800/50">
                <TimeSection period="Today" label="Current thesis status">
                  {thesisCheck ? (
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        thesisCheck.status === 'confirmed' ? 'bg-emerald-400' :
                        thesisCheck.status === 'challenged' ? 'bg-red-400' : 'bg-gray-500'
                      }`} />
                      <p className="text-xs text-gray-300">{thesisCheck.today.explanation}</p>
                    </div>
                  ) : thesisSet ? (
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-gray-700 shrink-0" />
                      <p className="text-xs text-gray-400 italic">Run scan to check thesis status</p>
                    </div>
                  ) : (
                    <Placeholder text="Set thesis above and run scan" />
                  )}
                </TimeSection>

                <TimeSection period="Context" label="Past 30–60 days">
                  {thesisCheck?.past ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-300 leading-relaxed">{thesisCheck.past.summary}</p>
                      {thesisCheck.past.evidence.length > 0 && (
                        <ul className="space-y-1">
                          {thesisCheck.past.evidence.map((e, i) => (
                            <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                              <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                              {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Placeholder text="Set thesis and run scan to track what evidence accumulated for or against it" />
                  )}
                </TimeSection>

                <TimeSection period="Forward Outlook" label="Next 30–60 days">
                  {thesisCheck?.forward ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-300 leading-relaxed">{thesisCheck.forward.outlook}</p>
                      {thesisCheck.forward.keyEvents.length > 0 && (
                        <ul className="space-y-1">
                          {thesisCheck.forward.keyEvents.map((e, i) => (
                            <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                              <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                              {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Placeholder text="Set thesis and run scan for forward thesis outlook — which upcoming catalysts are thesis-relevant" />
                  )}
                </TimeSection>
              </div>
            </DraggablePanel>
          </div>

          {/* ── Driver Analysis ── */}
          <div key="driver">
            <DraggablePanel title="Driver Analysis">
              <div className="divide-y divide-gray-800/50">
                <TimeSection period="Today" label="Current drivers">
                  <BucketDots active={driverAnalysis?.today.primaryBucket ?? null} />
                  {driverAnalysis?.today ? (
                    <div className="mt-2.5 space-y-1">
                      <p className="text-xs text-gray-300">{driverAnalysis.today.rationale}</p>
                      <div className="flex items-center gap-2">
                        <ConfidenceBadge confidence={driverAnalysis.today.confidence} />
                        {driverAnalysis.today.secondaryBucket && (
                          <span className="text-[11px] text-gray-500">
                            Secondary: {BUCKET_LABELS[driverAnalysis.today.secondaryBucket]}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic mt-2.5">
                      Run scan to identify today&apos;s primary driver
                    </p>
                  )}
                </TimeSection>

                <TimeSection period="Context" label="Past 30–60 days">
                  {driverAnalysis?.past ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-300 leading-relaxed">{driverAnalysis.past.summary}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">Dominant:</span>
                        <span className="text-[11px] font-mono text-gray-300">{BUCKET_LABELS[driverAnalysis.past.dominantBucket]}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 italic">{driverAnalysis.past.evolution}</p>
                    </div>
                  ) : (
                    <>
                      <Placeholder text={`Run scan to analyze what drove ${ticker} recently — which bucket was dominant and how it evolved`} />
                      <div className="mt-3 flex items-end gap-1 opacity-20 pointer-events-none">
                        {[10, 16, 12, 20, 14, 18, 8, 22, 16, 12].map((h, i) => (
                          <div key={i} className="flex-1 bg-gray-700 rounded-sm" style={{ height: `${h}px` }} />
                        ))}
                      </div>
                    </>
                  )}
                </TimeSection>

                <TimeSection period="Forward Outlook" label="Next 30–60 days">
                  {driverAnalysis?.forward ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-300 leading-relaxed">{driverAnalysis.forward.summary}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">Expected:</span>
                        <span className="text-[11px] font-mono text-gray-300">{BUCKET_LABELS[driverAnalysis.forward.expectedBucket]}</span>
                      </div>
                      {driverAnalysis.forward.keyFactors.length > 0 && (
                        <ul className="space-y-1">
                          {driverAnalysis.forward.keyFactors.map((f, i) => (
                            <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                              <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Placeholder text="Run scan for forward driver outlook — expected dominant bucket based on known catalysts and macro environment" />
                  )}
                </TimeSection>
              </div>
            </DraggablePanel>
          </div>

          {/* ── Competitive Landscape ── */}
          <div key="sectorrel">
            <DraggablePanel title="Competitive Landscape">
              <div className="divide-y divide-gray-800/50">

                <TimeSection period="Today" label="Relative performance">
                  {relativePerfData.length >= 2 ? (
                    <SectorRelativeChart data={relativePerfData} intradayData={intradayPerfData} ticker={ticker} sectorEtf={sectorEtf} />
                  ) : (
                    <Placeholder text="Loading price history for relative performance chart..." />
                  )}
                </TimeSection>

                <TimeSection period="Context" label="TTM peer comparison">
                  <PeerCompTable peerRows={peerRows} />
                  {pePercentile != null && (
                    <p className="text-[13px] text-gray-500 mt-2">
                      TTM P/E percentile among peers: <span className="font-mono text-gray-300">{pePercentile}th</span>
                      <span className="text-gray-600 ml-1">
                        ({pePercentile >= 75 ? 'expensive' : pePercentile >= 50 ? 'above median' : pePercentile >= 25 ? 'below median' : 'cheap'} vs peers)
                      </span>
                    </p>
                  )}
                  {!peerRows.length && <Placeholder text="Run scan to load peer comparison" />}
                </TimeSection>

                <TimeSection period="Forward Outlook" label="Next 30–60 days">
                  {sectorRelForward ? (
                    <p className="text-xs text-gray-300 leading-relaxed">{sectorRelForward}</p>
                  ) : (
                    <Placeholder text="Run scan for forward relative outlook" />
                  )}
                </TimeSection>

              </div>
            </DraggablePanel>
          </div>

          {/* ── Upcoming Catalysts ── */}
          <div key="catalysts">
            <DraggablePanel title="Upcoming Catalysts" subtitle="next 60 days">
              {catalysts.length > 0 ? (
                <>
                  <CatalystTimelineReal catalysts={catalysts} />
                  <div className="space-y-3">
                    {(['thesis', 'macro', 'sector', 'sentiment', 'fundamental'] as const).map((cat) => {
                      const items = catalysts.filter((c) => c.category === cat);
                      if (!items.length) return null;
                      const tagLabel = (cat.charAt(0).toUpperCase() + cat.slice(1)) as BucketTagType;
                      return (
                        <div key={cat}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <BucketTag bucket={tagLabel} />
                            <span className="text-[11px] text-gray-500">{items.length} event{items.length > 1 ? 's' : ''}</span>
                          </div>
                          <div className="space-y-1.5 ml-1">
                            {items.map((c, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-[11px] font-mono text-gray-500 shrink-0 w-16">{c.date}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-300">{c.description}</p>
                                  <p className="text-[11px] text-gray-500 italic mt-0.5">{c.impactHypothesis}</p>
                                </div>
                                {c.thesisRelevance && (
                                  <span className="text-[10px] text-violet-400 border border-violet-800 bg-violet-950 rounded px-1 py-px shrink-0">thesis</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <CatalystTimeline />
                  <div className="space-y-2">
                    <CatalystCategorySection bucket="Thesis"      />
                    <CatalystCategorySection bucket="Macro"       />
                    <CatalystCategorySection bucket="Sector"      />
                    <CatalystCategorySection bucket="Sentiment"   />
                    <CatalystCategorySection bucket="Fundamental" />
                  </div>
                </>
              )}
            </DraggablePanel>
          </div>

          {/* ── Metrics That Matter ── */}
          <div key="5numbers">
            <DraggablePanel title="Metrics That Matter">
              <FiveNumbers cards={fiveCards} showHeader={false} />
            </DraggablePanel>
          </div>

          {/* ── Revenue Flow (Sankey) — inline panel for proper flex sizing ── */}
          <div key="revenueflow">
            <div className="h-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
              <div className="panel-drag-handle flex items-center gap-2 px-4 h-9 border-b border-gray-800/60 cursor-grab active:cursor-grabbing select-none shrink-0">
                <PanelGripIcon />
                <h3 className="text-[13px] font-semibold text-gray-300 uppercase tracking-widest">Revenue Flow</h3>
                {income.length > 0 ? (
                  <span className="text-[13px] text-gray-400">
                    {ticker} {income[0].period} FY{income[0].date.slice(0, 4)}
                  </span>
                ) : (
                  <span className="text-[13px] text-gray-500 italic">placeholder</span>
                )}
              </div>
              <div className="flex-1 min-h-0 flex flex-col px-4 pt-2 pb-3 overflow-hidden">
                <div className="flex-1 min-h-0">
                  <SankeyChart nodes={sankeyData?.nodes} links={sankeyData?.links} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Fundamentals ── */}
          <div key="fundamentals">
            <DraggablePanel title="Fundamentals">
              <FundamentalsPanel income={income} cashFlow={cashFlow} balanceSheet={balanceSheet} annualIncome={annualIncome} annualCashFlow={annualCashFlow} analystEstimates={analystEstimates} quarterlyEstimates={quarterlyEstimates} />
            </DraggablePanel>
          </div>
        </GridLayout>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DraggablePanel({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
      <div className="panel-drag-handle flex items-center gap-2 px-4 h-9 border-b border-gray-800/60 cursor-grab active:cursor-grabbing select-none shrink-0">
        <PanelGripIcon />
        <h3 className="text-[13px] font-semibold text-gray-300 uppercase tracking-widest">{title}</h3>
        {subtitle && <span className="text-[13px] text-gray-400">{subtitle}</span>}
        {badge && (
          <span className="ml-auto text-[13px] text-gray-500 border border-gray-700 rounded px-1.5 py-px">
            {badge}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  );
}

function TimeSection({
  period,
  label,
  children,
}: {
  period: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest">{period}</span>
        <span className="text-[13px] text-gray-500">— {label}</span>
      </div>
      {children}
    </div>
  );
}

// ── SentimentBar ──────────────────────────────────────────────────────────────

function SentimentBar({ label, score }: { label: string; score: number | null }) {
  if (score == null) return null;
  // score is -1 to 1 — map to 0-100% width, centered at 50%
  const pct = Math.round((score + 1) * 50);
  const isPositive = score >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded-sm relative overflow-hidden">
        <div className="absolute top-0 bottom-0 w-px bg-gray-700" style={{ left: '50%' }} />
        {isPositive ? (
          <div
            className="absolute top-0 bottom-0 bg-emerald-600 rounded-sm"
            style={{ left: '50%', width: `${pct - 50}%` }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 bg-red-600 rounded-sm"
            style={{ left: `${pct}%`, width: `${50 - pct}%` }}
          />
        )}
      </div>
      <span className={`text-[11px] font-mono w-8 text-right ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {score >= 0 ? '+' : ''}{score.toFixed(1)}
      </span>
    </div>
  );
}

// ── ConfidenceBadge ───────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<string, string> = {
  high:   'text-emerald-400 border-emerald-800 bg-emerald-950',
  medium: 'text-amber-400 border-amber-800 bg-amber-950',
  low:    'text-red-400 border-red-800 bg-red-950',
};

function ConfidenceBadge({ confidence }: { confidence: BucketConfidence }) {
  const style = CONFIDENCE_STYLES[confidence] ?? CONFIDENCE_STYLES.medium;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-px rounded border ${style}`}>
      {confidence} confidence
    </span>
  );
}

// ── CatalystTimelineReal ──────────────────────────────────────────────────────

const CATEGORY_DOT_COLORS: Record<string, string> = {
  thesis:      'bg-violet-500',
  macro:       'bg-indigo-400',
  sector:      'bg-blue-500',
  sentiment:   'bg-amber-500',
  fundamental: 'bg-emerald-500',
};

function CatalystTimelineReal({ catalysts }: { catalysts: Catalyst[] }) {
  const now = Date.now();
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;

  return (
    <div className="mb-4">
      <div className="relative h-8">
        {/* Main line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-800 -translate-y-1/2" />
        {/* Tick marks */}
        {[25, 50, 75].map((pct) => (
          <div key={pct} className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-gray-700" style={{ left: `${pct}%` }} />
        ))}
        {/* Start/end markers */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-500" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gray-700" />
        {/* Catalyst dots */}
        {catalysts.map((c, i) => {
          const catDate = new Date(c.date).getTime();
          const pct = Math.max(0, Math.min(100, ((catDate - now) / sixtyDays) * 100));
          const dotColor = CATEGORY_DOT_COLORS[c.category] ?? 'bg-gray-500';
          return (
            <div
              key={i}
              className="group/dot absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${pct}%` }}
            >
              <div
                className={`rounded-full border-2 border-gray-950 w-4 h-4 ${dotColor} ${c.thesisRelevance ? 'ring-2 ring-violet-500/40' : ''} transition-transform group-hover/dot:scale-125`}
              />
              {/* Tooltip */}
              <div className="hidden group-hover/dot:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl pointer-events-none z-20">
                <p className="text-xs font-medium text-gray-200 leading-snug">{c.description}</p>
                <p className="text-[10px] text-gray-500 mt-1">{c.date} · {c.category}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative h-4 mt-1">
        <span className="absolute left-0 text-[11px] text-gray-400 font-medium">Today</span>
        <span className="absolute text-[11px] text-gray-500 -translate-x-1/2" style={{ left: '25%' }}>+15d</span>
        <span className="absolute text-[11px] text-gray-500 -translate-x-1/2" style={{ left: '50%' }}>+30d</span>
        <span className="absolute text-[11px] text-gray-500 -translate-x-1/2" style={{ left: '75%' }}>+45d</span>
        <span className="absolute right-0 text-[11px] text-gray-400 font-medium">+60d</span>
      </div>
    </div>
  );
}

// ── Bucket indicator dots ──────────────────────────────────────────────────────

const BUCKETS = [
  { label: 'Market Beta', activeDot: 'bg-indigo-400'   },
  { label: 'Sector',      activeDot: 'bg-blue-500'    },
  { label: 'Sentiment',   activeDot: 'bg-amber-500'   },
  { label: 'Fundamental', activeDot: 'bg-emerald-500' },
] as const;

function BucketDots({ active }: { active: 1 | 2 | 3 | 4 | null }) {
  return (
    <div className="flex items-center gap-5">
      {BUCKETS.map((b, i) => (
        <div key={b.label} className="flex flex-col items-center gap-1">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              active === i + 1 ? b.activeDot : 'bg-gray-800 border border-gray-700'
            }`}
          />
          <span className="text-[13px] text-gray-400 whitespace-nowrap">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Bucket tags ────────────────────────────────────────────────────────────────

type BucketTagType = 'Macro' | 'Sector' | 'Sentiment' | 'Fundamental' | 'Thesis';

// Full literal strings for Tailwind JIT scanner
const BUCKET_TAG_STYLES = {
  Macro:       { bg: 'bg-indigo-950',  text: 'text-indigo-300',  border: 'border-indigo-800'  },
  Sector:      { bg: 'bg-blue-950',    text: 'text-blue-400',    border: 'border-blue-800'    },
  Sentiment:   { bg: 'bg-amber-950',   text: 'text-amber-400',   border: 'border-amber-800'   },
  Fundamental: { bg: 'bg-emerald-950', text: 'text-emerald-400', border: 'border-emerald-800' },
  Thesis:      { bg: 'bg-violet-950',  text: 'text-violet-300',  border: 'border-violet-700'  },
} as const;

function BucketTag({ bucket }: { bucket: BucketTagType }) {
  const s = BUCKET_TAG_STYLES[bucket];
  return (
    <span className={`text-[13px] font-semibold px-1.5 py-px rounded border ${s.bg} ${s.text} ${s.border}`}>
      {bucket}
    </span>
  );
}

// ── Catalyst timeline ──────────────────────────────────────────────────────────

// Full literal strings for Tailwind JIT scanner
const BUCKET_DOT_COLORS = {
  Macro:       'bg-indigo-400',
  Sector:      'bg-blue-500',
  Sentiment:   'bg-amber-500',
  Fundamental: 'bg-emerald-500',
  Thesis:      'bg-violet-500',
} as const;

const GHOST_DOTS: Array<{ pct: number; bucket: BucketTagType; prominent?: boolean }> = [
  { pct: 9,  bucket: 'Thesis',      prominent: true },
  { pct: 28, bucket: 'Fundamental'                  },
  { pct: 47, bucket: 'Macro'                        },
  { pct: 65, bucket: 'Sector'                       },
  { pct: 82, bucket: 'Sentiment'                    },
];

function CatalystTimeline() {
  return (
    <div className="mb-4">
      <div className="relative h-5">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-800 -translate-y-1/2" />

        {[25, 50, 75].map((pct) => (
          <div
            key={pct}
            className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-gray-800"
            style={{ left: `${pct}%` }}
          />
        ))}

        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gray-500" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1 h-1 rounded-full bg-gray-800" />

        {GHOST_DOTS.map((d, i) => (
          <div
            key={i}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-gray-950 opacity-40 ${BUCKET_DOT_COLORS[d.bucket]} ${d.prominent ? 'w-3.5 h-3.5' : 'w-3 h-3'}`}
            style={{ left: `${d.pct}%` }}
          />
        ))}
      </div>

      <div className="relative h-4 mt-0.5">
        <span className="absolute left-0 text-[13px] text-gray-400">Today</span>
        <span className="absolute text-[13px] text-gray-600 -translate-x-1/2" style={{ left: '25%' }}>+15d</span>
        <span className="absolute text-[13px] text-gray-600 -translate-x-1/2" style={{ left: '50%' }}>+30d</span>
        <span className="absolute text-[13px] text-gray-600 -translate-x-1/2" style={{ left: '75%' }}>+45d</span>
        <span className="absolute right-0 text-[13px] text-gray-400">+60d</span>
      </div>
    </div>
  );
}

// ── CatalystCategorySection ────────────────────────────────────────────────────

function CatalystCategorySection({ bucket }: { bucket: BucketTagType }) {
  return (
    <div className="flex items-center gap-3">
      <BucketTag bucket={bucket} />
      <span className="text-[13px] font-mono text-gray-700">—</span>
    </div>
  );
}

// ── SectorRelChart ─────────────────────────────────────────────────────────────

// ── PeerCompTable ───────────────────────────────────────────────────────────────

function PeerCompTable({ peerRows }: { peerRows: PeerRow[] }) {
  const fmtGrowth = (n: number | null) =>
    n == null ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;

  // Compute sector average from peer data (excluding self)
  const peers = peerRows.filter((r) => !r.isSelf);
  const selfRow = peerRows.find((r) => r.isSelf);
  const avg = (vals: (number | null)[]) => {
    const valid = vals.filter((v): v is number => v != null);
    return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
  };
  // For sector avg P/E: use forward P/E when available, fall back to TTM
  const pePeValues = peers.map((r) => r.forwardPeRatio ?? r.peRatio);
  const sectorAvg = peers.length > 0 ? {
    revGrowthYoY: avg(peers.map((r) => r.revGrowthYoY)),
    opMargin: avg(peers.map((r) => r.opMargin)),
    fcfMargin: avg(peers.map((r) => r.fcfMargin)),
    peRatio: avg(pePeValues),
  } : null;

  // Render a P/E cell: show forward P/E if available, else TTM with "(TTM)" suffix
  const renderPeCell = (row: PeerRow, textClass: string, fallbackClass: string) => {
    if (row.forwardPeRatio != null) {
      return <span className={textClass}>{row.forwardPeRatio.toFixed(1)}x</span>;
    }
    if (row.peRatio != null) {
      return (
        <span className={textClass}>
          {row.peRatio.toFixed(1)}x
          <span className="ml-0.5 text-[10px] text-gray-600 font-normal">TTM</span>
        </span>
      );
    }
    return <span className={fallbackClass}>—</span>;
  };

  // Row order: Sector Avg first, then self, then peers
  const orderedRows: Array<{ type: 'avg' } | { type: 'data'; row: PeerRow }> = [];
  if (sectorAvg) orderedRows.push({ type: 'avg' });
  if (selfRow) orderedRows.push({ type: 'data', row: selfRow });
  for (const row of peers) orderedRows.push({ type: 'data', row });

  return (
    <div className="rounded border border-gray-800 overflow-hidden mb-2">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-950 border-b border-gray-800">
            <th className="py-1.5 pl-2.5 pr-1   text-left  text-[13px] font-semibold text-gray-500 uppercase tracking-wider">Ticker</th>
            <th className="py-1.5 px-1           text-right text-[13px] font-semibold text-gray-500 uppercase tracking-wider">Rev Gr. <span className="normal-case font-normal text-gray-600">(TTM)</span></th>
            <th className="py-1.5 px-1           text-right text-[13px] font-semibold text-gray-500 uppercase tracking-wider">Op Mgn <span className="normal-case font-normal text-gray-600">(TTM)</span></th>
            <th className="py-1.5 px-1           text-right text-[13px] font-semibold text-gray-500 uppercase tracking-wider">FCF Mgn <span className="normal-case font-normal text-gray-600">(TTM)</span></th>
            <th className="py-1.5 pl-1 pr-2.5   text-right text-[13px] font-semibold text-gray-500 uppercase tracking-wider">Fwd P/E</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {orderedRows.length > 0 ? (
            orderedRows.map((entry, idx) => {
              if (entry.type === 'avg') {
                return (
                  <tr key="sector-avg" className="bg-blue-950/20">
                    <td className="py-1 pl-2.5 pr-1 font-mono text-[13px] text-blue-400 font-semibold">Sector Avg</td>
                    <td className={`py-1 px-1 text-right font-mono text-[13px] ${
                      sectorAvg!.revGrowthYoY == null ? 'text-blue-400/50' :
                      sectorAvg!.revGrowthYoY >= 0   ? 'text-blue-300' : 'text-red-400'
                    }`}>
                      {fmtGrowth(sectorAvg!.revGrowthYoY)}
                    </td>
                    <td className={`py-1 px-1 text-right font-mono text-[13px] ${sectorAvg!.opMargin != null ? 'text-blue-300' : 'text-blue-400/50'}`}>
                      {sectorAvg!.opMargin != null ? pctAbs(sectorAvg!.opMargin) : '—'}
                    </td>
                    <td className={`py-1 px-1 text-right font-mono text-[13px] ${sectorAvg!.fcfMargin != null ? 'text-blue-300' : 'text-blue-400/50'}`}>
                      {sectorAvg!.fcfMargin != null ? pctAbs(sectorAvg!.fcfMargin) : '—'}
                    </td>
                    <td className={`py-1 pl-1 pr-2.5 text-right font-mono text-[13px] ${sectorAvg!.peRatio != null ? 'text-blue-300' : 'text-blue-400/50'}`}>
                      {sectorAvg!.peRatio != null ? `${sectorAvg!.peRatio.toFixed(1)}x` : '—'}
                    </td>
                  </tr>
                );
              }
              const row = entry.row;
              return (
                <tr key={row.ticker + idx} className={row.isSelf ? 'bg-gray-800/40' : ''}>
                  <td className={`py-1 pl-2.5 pr-1 font-mono text-[13px] ${row.isSelf ? 'font-bold text-gray-100' : 'text-gray-400'}`}>
                    {row.ticker}
                  </td>
                  <td className={`py-1 px-1 text-right font-mono text-[13px] ${
                    row.revGrowthYoY == null ? 'text-gray-500' :
                    row.revGrowthYoY >= 0   ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {fmtGrowth(row.revGrowthYoY)}
                  </td>
                  <td className={`py-1 px-1 text-right font-mono text-[13px] ${
                    row.opMargin == null ? 'text-gray-500' :
                    row.opMargin >= 0    ? 'text-gray-300' : 'text-red-400'
                  }`}>
                    {row.opMargin != null ? pctAbs(row.opMargin) : '—'}
                  </td>
                  <td className={`py-1 px-1 text-right font-mono text-[13px] ${
                    row.fcfMargin == null ? 'text-gray-500' :
                    row.fcfMargin >= 0    ? 'text-gray-300' : 'text-red-400'
                  }`}>
                    {row.fcfMargin != null ? pctAbs(row.fcfMargin) : '—'}
                  </td>
                  <td className={`py-1 pl-1 pr-2.5 text-right font-mono text-[13px]`}>
                    {renderPeCell(row, row.peRatio == null && row.forwardPeRatio == null ? 'text-gray-500' : 'text-gray-300', 'text-gray-500')}
                  </td>
                </tr>
              );
            })
          ) : (
            /* Ghost rows when no data loaded */
            [0, 1, 2, 3].map((i) => (
              <tr key={i} className="opacity-20">
                <td className="py-1 pl-2.5 pr-1   font-mono text-[13px] text-gray-400">—</td>
                <td className="py-1 px-1           text-right font-mono text-[13px] text-gray-400">—</td>
                <td className="py-1 px-1           text-right font-mono text-[13px] text-gray-400">—</td>
                <td className="py-1 px-1           text-right font-mono text-[13px] text-gray-400">—</td>
                <td className="py-1 pl-1 pr-2.5   text-right font-mono text-[13px] text-gray-400">—</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────────────────

function Placeholder({ text }: { text: string }) {
  return <p className="text-xs text-gray-300 italic leading-relaxed">{text}</p>;
}

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

// ── buildSankeyFromIncome ──────────────────────────────────────────────────────
// Converts the most-recent income statement quarter into a waterfall:
// [Segments] → Revenue → [Cost of Sales, Gross Profit] → [Op. Expenses, Op. Income]
//           → [Tax & Other, Net Income]

function buildSankeyFromIncome(
  income: IncomeQ[],
  segments?: RevenueSegment[],
): { nodes: RawNode[]; links: RawLink[] } | null {
  if (!income.length) return null;
  const q  = income[0];
  const py = income.length >= 5 ? income[4] : undefined;
  if (!q.revenue || q.revenue <= 0) return null;

  const toB = (n: number) => n / 1e9;

  const yoyOf = (curr: number, prev?: number): { yoy: string; yoyPositive: boolean | null } => {
    if (!prev || prev === 0) return { yoy: 'n/a', yoyPositive: null };
    const pct = (curr / prev - 1) * 100;
    return { yoy: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, yoyPositive: pct >= 0 };
  };

  const cogs   = Math.max(0, q.revenue - q.grossProfit);
  const opex   = Math.max(0, q.grossProfit - q.operatingIncome);
  const taxOth = q.operatingIncome > 0 ? Math.max(0, q.operatingIncome - q.netIncome) : 0;

  const nodes: RawNode[] = [];
  const links: RawLink[] = [];

  // If segment data available, add segment nodes feeding into Revenue
  const hasSegments = segments && segments.length > 0;
  const segTotal = hasSegments ? segments!.reduce((s, seg) => s + seg.value, 0) : 0;

  if (hasSegments && segTotal > 0) {
    // Add segment nodes (indices 0..N-1)
    for (const seg of segments!) {
      const yoyPct = seg.yoyGrowth != null ? seg.yoyGrowth * 100 : null;
      nodes.push({
        name: seg.name,
        group: 'segment',
        yoy: yoyPct != null ? `${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(0)}%` : 'n/a',
        yoyPositive: yoyPct != null ? yoyPct >= 0 : null,
      });
    }
  }

  // Revenue node index
  const revIdx = nodes.length;
  nodes.push({ name: 'Revenue', group: 'revenue', ...yoyOf(q.revenue, py?.revenue) });

  // Segment → Revenue links (scaled proportionally to quarterly revenue)
  if (hasSegments && segTotal > 0) {
    for (let i = 0; i < segments!.length; i++) {
      const scaledValue = q.revenue * (segments![i].value / segTotal);
      links.push({ source: i, target: revIdx, value: toB(scaledValue) });
    }
  }

  const cogsIdx = nodes.length;
  nodes.push({ name: 'Cost of sales', group: 'cost', yoy: 'n/a', yoyPositive: null });
  const gpIdx = nodes.length;
  nodes.push({ name: 'Gross profit', group: 'profit', ...yoyOf(q.grossProfit, py?.grossProfit) });
  const opexIdx = nodes.length;
  nodes.push({ name: 'Op. expenses', group: 'cost', yoy: 'n/a', yoyPositive: null });
  const opIncIdx = nodes.length;
  nodes.push({ name: 'Op. income', group: 'profit', ...yoyOf(q.operatingIncome, py?.operatingIncome) });
  const taxIdx = nodes.length;
  nodes.push({ name: 'Tax & other', group: 'tax', yoy: 'n/a', yoyPositive: null });
  const niIdx = nodes.length;
  nodes.push({ name: 'Net income', group: 'profit', ...yoyOf(q.netIncome, py?.netIncome) });

  // Revenue → COGS + Gross Profit
  links.push({ source: revIdx, target: cogsIdx, value: Math.max(0.1, toB(cogs)) });
  links.push({ source: revIdx, target: gpIdx, value: toB(q.grossProfit) });

  if (q.operatingIncome > 0) {
    if (opex > 0) links.push({ source: gpIdx, target: opexIdx, value: toB(opex) });
    links.push({ source: gpIdx, target: opIncIdx, value: toB(q.operatingIncome) });
    if (taxOth > 0) links.push({ source: opIncIdx, target: taxIdx, value: toB(taxOth) });
    if (q.netIncome > 0) links.push({ source: opIncIdx, target: niIdx, value: toB(q.netIncome) });
  }

  return { nodes, links };
}

// ── FundamentalsPanel ──────────────────────────────────────────────────────────

function FundamentalsPanel({
  income,
  cashFlow,
  annualIncome,
  annualCashFlow,
  analystEstimates,
  quarterlyEstimates,
}: {
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  balanceSheet: BalanceSheetQ[];
  annualIncome: IncomeQ[];
  annualCashFlow: CashFlowQ[];
  analystEstimates: AnalystEstimate[];
  quarterlyEstimates: AnalystEstimate[];
}) {
  const [view, setView] = useState<'annual' | 'quarterly'>('annual');

  if (!income.length && !annualIncome.length) {
    return (
      <>
        <Placeholder text="Financial data unavailable — check FMP API key or ticker symbol." />
        <div className="mt-5 space-y-2 opacity-20 pointer-events-none">
          {['Revenue', 'Gross Profit', 'Operating Income', 'Net Income', 'Free Cash Flow'].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-32 shrink-0">{row}</span>
              <div className="flex-1 h-2.5 bg-gray-800 rounded-sm" />
            </div>
          ))}
        </div>
      </>
    );
  }

  const pctChange = (curr: number, prev: number | undefined): { text: string; positive: boolean } | null => {
    if (prev == null || prev === 0) return null;
    const pct = (curr / prev - 1) * 100;
    return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, positive: pct >= 0 };
  };

  const toggleBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`px-2.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
        active ? 'bg-gray-700 text-gray-200 font-semibold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center gap-1 mb-2">
        {toggleBtn('Annual', view === 'annual', () => setView('annual'))}
        {toggleBtn('Quarterly', view === 'quarterly', () => setView('quarterly'))}
      </div>

      {view === 'quarterly' ? (
        <QuarterlyTable income={income} cashFlow={cashFlow} quarterlyEstimates={quarterlyEstimates} pctChange={pctChange} />
      ) : (
        <AnnualTable annualIncome={annualIncome} annualCashFlow={annualCashFlow} analystEstimates={analystEstimates} pctChange={pctChange} />
      )}
    </div>
  );
}

// ── Quarterly fundamentals table ────────────────────────────────────────────

function QuarterlyTable({
  income,
  cashFlow,
  quarterlyEstimates,
  pctChange,
}: {
  income: IncomeQ[];
  cashFlow: CashFlowQ[];
  quarterlyEstimates: AnalystEstimate[];
  pctChange: (curr: number, prev: number | undefined) => { text: string; positive: boolean } | null;
}) {
  const qLabel = (date: string) => {
    const parts = date.split('-');
    const month = parseInt(parts[1], 10);
    const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
    return `Q${q}'${parts[0].slice(2)}`;
  };

  // income is newest-first from FMP — take 8 historical quarters
  const histActuals = income.slice(0, 8);
  const cfActuals = cashFlow.slice(0, 8);

  // Filter estimates to only future quarters (after the latest actual)
  const latestActualDate = income[0]?.date ?? '';
  const futureEstimates = quarterlyEstimates
    .filter((e) => e.date > latestActualDate)
    .slice(0, 2);

  // Column defs: estimates (furthest future first) then actuals (newest first)
  // All reversed so left = furthest future, right = oldest history
  interface QColDef {
    key: string;
    label: string;
    isEstimate: boolean;
    income?: IncomeQ;
    cashFlow?: CashFlowQ;
    estimate?: AnalystEstimate;
  }

  const estimateCols: QColDef[] = [...futureEstimates].reverse().map((est) => ({
    key: `est-${est.date}`,
    label: `${qLabel(est.date)}E`,
    isEstimate: true,
    estimate: est,
  }));

  const actualCols: QColDef[] = histActuals.map((inc, i) => ({
    key: `act-${inc.date}`,
    label: qLabel(inc.date),
    isEstimate: false,
    income: inc,
    cashFlow: cfActuals[i],
  }));

  const columns = [...estimateCols, ...actualCols];

  const rows = [
    { label: 'Revenue',      getValue: (col: QColDef) => col.isEstimate ? col.estimate?.revenueAvg : col.income?.revenue },
    { label: 'Gross Profit', getValue: (col: QColDef) => col.isEstimate ? null : col.income?.grossProfit },
    { label: 'Op. Income',   getValue: (col: QColDef) => col.isEstimate ? col.estimate?.ebitAvg : col.income?.operatingIncome },
    { label: 'Net Income',   getValue: (col: QColDef) => col.isEstimate ? col.estimate?.netIncomeAvg : col.income?.netIncome },
    { label: 'Free CF',      getValue: (col: QColDef) => col.isEstimate ? null : col.cashFlow?.freeCashFlow },
    { label: 'EPS',           getValue: (col: QColDef) => col.isEstimate ? col.estimate?.epsAvg : col.income?.epsDiluted },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="pb-1.5 text-left text-[13px] font-normal text-gray-600 w-28" />
            {columns.map((col) => (
              <th
                key={col.key}
                className={`pb-1.5 text-right text-[13px] font-semibold px-1 tabular-nums ${
                  col.isEstimate ? 'text-blue-400' : 'text-gray-500'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/30">
          {rows.map(({ label, getValue }) => (
            <tr key={label}>
              <td className="py-1 text-[13px] font-mono text-gray-500">{label}</td>
              {columns.map((col, i) => {
                const val = getValue(col) ?? null;
                // For % change, compare to the column to the right (next older period)
                const nextCol = i + 1 < columns.length ? columns[i + 1] : null;
                const prevVal = nextCol ? (getValue(nextCol) ?? null) : null;
                const change = val != null && prevVal != null ? pctChange(val, prevVal) : null;
                const isEps = label === 'EPS';
                return (
                  <td
                    key={col.key}
                    className={`py-1 px-1 text-right font-mono text-[13px] tabular-nums ${
                      col.isEstimate ? 'text-blue-300 bg-blue-950/20' : 'text-gray-300'
                    }`}
                  >
                    {val != null ? (isEps ? `$${val.toFixed(2)}` : fmtB(val)) : '—'}
                    {change && (
                      <span className={`ml-0.5 text-[11px] ${change.positive ? 'text-emerald-500' : 'text-red-500'}`}>
                        ({change.text})
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Annual fundamentals table with estimate columns ─────────────────────────

function AnnualTable({
  annualIncome,
  annualCashFlow,
  analystEstimates,
  pctChange,
}: {
  annualIncome: IncomeQ[];
  annualCashFlow: CashFlowQ[];
  analystEstimates: AnalystEstimate[];
  pctChange: (curr: number, prev: number | undefined) => { text: string; positive: boolean } | null;
}) {
  if (!annualIncome.length) {
    return <Placeholder text="Annual financial data not available." />;
  }

  // annualIncome is newest-first from FMP — take up to 4
  const histNewestFirst = annualIncome.slice(0, 4);
  const cfNewestFirst = annualCashFlow.slice(0, 4);

  const fyLabel = (date: string) => `FY${date.slice(2, 4)}`;

  // Filter estimates to only future years (after the latest actual)
  const latestActualDate = annualIncome[0]?.date ?? '';
  const futureEstimates = analystEstimates
    .filter((e) => e.date > latestActualDate)
    .slice(0, 2);

  // Column definitions: estimates first (furthest future on left), then actuals newest→oldest
  interface ColDef {
    label: string;
    isEstimate: boolean;
    income?: IncomeQ;
    cashFlow?: CashFlowQ;
    estimate?: AnalystEstimate;
  }

  const estimateCols: ColDef[] = [...futureEstimates].reverse().map((est) => ({
    label: `FY${est.date.slice(2, 4)}E`,
    isEstimate: true,
    estimate: est,
  }));

  const actualCols: ColDef[] = histNewestFirst.map((inc, i) => ({
    label: fyLabel(inc.date),
    isEstimate: false,
    income: inc,
    cashFlow: cfNewestFirst[i],
  }));

  const columns: ColDef[] = [...estimateCols, ...actualCols];

  // Row definitions for annual view
  const rows = [
    {
      label: 'Revenue',
      getValue: (col: ColDef) => col.isEstimate ? col.estimate?.revenueAvg : col.income?.revenue,
    },
    {
      label: 'Gross Profit',
      getValue: (col: ColDef) => col.isEstimate ? null : col.income?.grossProfit,
    },
    {
      label: 'Op. Income',
      getValue: (col: ColDef) => col.isEstimate ? col.estimate?.ebitAvg : col.income?.operatingIncome,
    },
    {
      label: 'Net Income',
      getValue: (col: ColDef) => col.isEstimate ? col.estimate?.netIncomeAvg : col.income?.netIncome,
    },
    {
      label: 'Free CF',
      getValue: (col: ColDef) => col.isEstimate ? null : col.cashFlow?.freeCashFlow,
    },
    {
      label: 'EPS',
      getValue: (col: ColDef) => col.isEstimate ? col.estimate?.epsAvg : col.income?.epsDiluted,
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="pb-1.5 text-left text-[13px] font-normal text-gray-600 w-28" />
            {columns.map((col) => (
              <th
                key={col.label}
                className={`pb-1.5 text-right text-[13px] font-semibold px-1 tabular-nums ${
                  col.isEstimate ? 'text-blue-400' : 'text-gray-500'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/30">
          {rows.map(({ label, getValue }) => (
            <tr key={label}>
              <td className="py-1 text-[13px] font-mono text-gray-500">{label}</td>
              {columns.map((col, i) => {
                const val = getValue(col) ?? null;
                // Compare to the column to the right (next older period)
                const nextCol = i + 1 < columns.length ? columns[i + 1] : null;
                const prevVal = nextCol ? (getValue(nextCol) ?? null) : null;
                const change = val != null && prevVal != null ? pctChange(val, prevVal) : null;
                const isEps = label === 'EPS';
                return (
                  <td
                    key={col.label}
                    className={`py-1 px-1 text-right font-mono text-[13px] tabular-nums ${
                      col.isEstimate ? 'text-blue-300 bg-blue-950/20' : 'text-gray-300'
                    }`}
                  >
                    {val != null ? (isEps ? `$${val.toFixed(2)}` : fmtB(val)) : '—'}
                    {change && (
                      <span className={`ml-0.5 text-[11px] ${change.positive ? 'text-emerald-500' : 'text-red-500'}`}>
                        ({change.text})
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
