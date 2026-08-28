'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
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
import { BUCKET_LABELS, BUCKET_COLORS } from '@/lib/config/constants';
import { StepRefreshButton } from './StepRefreshButton';

// Bump key to force-reset any cached layouts when the default arrangement changes
const STORAGE_KEY = 'pm:company-layout-v9';
const ROW_HEIGHT = 50;
const MARGIN: [number, number] = [12, 12];

// ── Default layout ────────────────────────────────────────────────────────────
//
// Pixel height of panel = h * (ROW_HEIGHT + MARGIN) - MARGIN = h*62 - 12
// Usable content height = that minus the ~38px panel header.
//
// Heights below were measured against the seeded demo portfolio so a first-run
// panel shows its content rather than opening pre-scrolled with a line of text
// sliced at the bottom edge. Columns still end level so no dead-space gaps open
// between rows:
//
// Row 1: Driver (left, h=10, ends y=10) | Thesis (right, h=9, ends y=9)
// Row 2: Sentiment (y=10, h=10, ends y=20) | SectorRel (y=9, h=11, ends y=20)
// Row 3: Catalysts full-width at y=20, h=6, ends y=26
// Row 4: Metrics (h=15) | Revenue Flow (h=15) — both end at y=41
// Row 5: Fundamentals full-width at y=41, h=6

const DEFAULT_LAYOUT: LayoutItem[] = [
  // Row 1: Driver (left, 40%) | Thesis (right, 60%)
  { i: 'driver',       x: 0,  y: 0,  w: 5,  h: 10, minW: 3, minH: 3 },
  { i: 'thesis',       x: 5,  y: 0,  w: 7,  h: 9,  minW: 4, minH: 4 },
  // Row 2: Sentiment & SectorRel — both end at y=20
  { i: 'sentiment',    x: 0,  y: 10, w: 5,  h: 10, minW: 3, minH: 5 },
  { i: 'sectorrel',    x: 5,  y: 9,  w: 7,  h: 11, minW: 4, minH: 5 },
  // Row 3: Catalysts full-width, y=20
  { i: 'catalysts',    x: 0,  y: 20, w: 12, h: 6,  minW: 6, minH: 3 },
  // Row 4: Metrics & Revenue Flow — both end at y=41
  { i: '5numbers',     x: 0,  y: 26, w: 5,  h: 15, minW: 3, minH: 5 },
  { i: 'revenueflow',  x: 5,  y: 26, w: 7,  h: 15, minW: 5, minH: 5 },
  // Row 5: Fundamentals full-width
  { i: 'fundamentals', x: 0,  y: 41, w: 12, h: 6,  minW: 6, minH: 3 },
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
  const stepErrors = latestScan?.stepErrors ?? {};
  const sentiment: NewsSentiment | null = latestScan?.newsSentiment ?? null;
  const driverAnalysis: DriverAnalysis | null = latestScan?.driverAnalysis ?? null;
  const thesisCheck: ThesisCheck | null = latestScan?.thesisAnalysis ?? null;
  const catalysts: Catalyst[] = latestScan?.catalysts ?? [];
  const sectorRelForward: string | null = latestScan?.sectorRelative?.forwardOutlook ?? null;

  const [thesisText, setThesisText]         = useState(initialThesis ?? '');
  const [thesisModified, setThesisModified] = useState(false);
  const [thesisSaving, setThesisSaving]     = useState(false);

  // Panel collapse state (persisted per ticker)
  const [driverCollapsed, toggleDriver]         = usePanelCollapse(ticker, 'driver', false);
  const [thesisCollapsed, toggleThesis]         = usePanelCollapse(ticker, 'thesis', false);
  const [sentimentCollapsed, toggleSentiment]   = usePanelCollapse(ticker, 'sentiment', false);
  const [sectorRelCollapsed, toggleSectorRel]   = usePanelCollapse(ticker, 'sectorrel', false);
  const [catalystsCollapsed, toggleCatalysts]   = usePanelCollapse(ticker, 'catalysts', false);
  const [metricsCollapsed, toggleMetrics]       = usePanelCollapse(ticker, '5numbers', false);
  const [revenueCollapsed, toggleRevenue]       = usePanelCollapse(ticker, 'revenueflow', false);
  const [fundCollapsed, toggleFund]             = usePanelCollapse(ticker, 'fundamentals', false);

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
          // Bottom/right handles only. The n/w/nw/ne/sw handles render as stray
          // marks along the top and left edges of every panel, and resizing from
          // those edges fights the grid's top-left anchoring anyway.
          resizeConfig={{ enabled: true, handles: ['s', 'e', 'se'] }}
          onLayoutChange={handleLayoutChange}
        >
          {/* ── Today's Sentiment ── */}
          <div key="sentiment">
            <DraggablePanel
              title="Today's Sentiment"
              badge={sentiment ? (sentiment.overall_tone ?? sentiment.sentiment) : undefined}
              headerRight={<StepRefreshButton ticker={ticker} step="news" />}
              collapsed={sentimentCollapsed}
              onToggle={toggleSentiment}
              collapsedContent={
                sentiment ? (
                  <p className="text-xs text-gray-300 line-clamp-2">{sentiment.today_summary ?? sentiment.summary}</p>
                ) : (
                  <p className="text-xs text-gray-500 italic">Run scan for sentiment</p>
                )
              }
            >
              {stepErrors.news && <StepFailed message={stepErrors.news} />}
              {sentiment ? (
                <div className="space-y-3 overflow-y-auto max-h-[calc(100%-2rem)]">
                  {/* Summary */}
                  <div>
                    <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Summary</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{sentiment.today_summary ?? sentiment.summary}</p>
                  </div>

                  {/* Institutional */}
                  {sentiment.institutional_today && (
                    <div>
                      <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Institutional</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{sentiment.institutional_today}</p>
                    </div>
                  )}

                  {/* Social */}
                  {sentiment.social_today && (
                    <div>
                      <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Social</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{sentiment.social_today}</p>
                    </div>
                  )}

                  {/* Key Headlines */}
                  {((sentiment.key_headlines && sentiment.key_headlines.length > 0) || (sentiment.keyHeadlines && sentiment.keyHeadlines.length > 0)) && (
                    <div>
                      <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Key Headlines</p>
                      <ul className="space-y-1">
                        {sentiment.key_headlines ? (
                          sentiment.key_headlines.slice(0, 5).map((h, i) => (
                            <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                              <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                              <span>{h.headline} <span className="text-gray-600">— {h.source}, {h.date}</span></span>
                            </li>
                          ))
                        ) : (
                          sentiment.keyHeadlines!.slice(0, 4).map((h, i) => (
                            <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                              <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                              {h}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Analyst Ratings */}
                  {sentiment.analyst_ratings && sentiment.analyst_ratings.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Analyst Ratings</p>
                      <ul className="space-y-1">
                        {sentiment.analyst_ratings.map((r, i) => (
                          <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                            <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                            <span><span className="text-gray-300 font-medium">{r.firm}</span> — {r.action} {r.priceTarget && <span className="text-gray-500">({r.priceTarget})</span>}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Sentiment Bars */}
                  <div className="space-y-1.5">
                    <SentimentBar label="Overall" score={sentiment.score} />
                    <SentimentBar label="Twitter/X" score={sentiment.twitterScore} />
                    <SentimentBar label="Reddit" score={sentiment.redditScore} />
                    <SentimentBar label="Media" score={sentiment.mediaScore} />
                    <SentimentBar label="Analysts" score={sentiment.analystScore} />
                  </div>

                  {/* Context 30-60 day */}
                  {sentiment.context_30_60 && (
                    <div className="border-t border-gray-800 pt-2">
                      <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Context</p>
                      <p className="text-xs text-gray-500 leading-relaxed italic">{sentiment.context_30_60}</p>
                    </div>
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
            <DraggablePanel
              title="Thesis"
              headerRight={<StepRefreshButton ticker={ticker} step="thesis" />}
              collapsed={thesisCollapsed}
              onToggle={toggleThesis}
              collapsedContent={
                thesisCheck ? (
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      thesisCheck.status === 'confirmed' ? 'bg-emerald-400' :
                      thesisCheck.status === 'challenged' ? 'bg-red-400' : 'bg-gray-500'
                    }`} />
                    <p className="text-xs text-gray-300 line-clamp-1">{thesisCheck.today.explanation}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">Set thesis and run scan</p>
                )
              }
            >
              {stepErrors.thesis && <StepFailed message={stepErrors.thesis} />}
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
            <DraggablePanel
              title="Driver Analysis"
              headerRight={<StepRefreshButton ticker={ticker} step="bucket" />}
              collapsed={driverCollapsed}
              onToggle={toggleDriver}
              collapsedContent={
                <div>
                  <BucketDots active={driverAnalysis?.today.primaryBucket ?? null} />
                  {driverAnalysis?.today ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[12px] text-gray-500">Dominant:</span>
                      <span className="text-[12px] font-mono text-gray-300">{BUCKET_LABELS[driverAnalysis.today.primaryBucket]}</span>
                      <span className="text-xs text-gray-400 ml-2 line-clamp-1">{driverAnalysis.today.rationale}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic mt-2">Run scan to identify drivers</p>
                  )}
                </div>
              }
            >
              {stepErrors.bucket && <StepFailed message={stepErrors.bucket} />}
              <div className="divide-y divide-gray-800/50">
                <TimeSection period="Today" label="Current drivers">
                  <BucketDots active={driverAnalysis?.today.primaryBucket ?? null} />
                  {driverAnalysis?.today ? (
                    <div className="mt-2.5 space-y-2">
                      <p className="text-xs text-gray-300">{driverAnalysis.today.rationale}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-gray-500">Dominant:</span>
                        <span className="text-[12px] font-mono text-gray-300">{BUCKET_LABELS[driverAnalysis.today.primaryBucket]}</span>
                        {driverAnalysis.today.secondaryBucket && (
                          <>
                            <span className="text-[12px] text-gray-600">·</span>
                            <span className="text-[12px] text-gray-500">Secondary:</span>
                            <span className="text-[12px] font-mono text-gray-300">{BUCKET_LABELS[driverAnalysis.today.secondaryBucket]}</span>
                          </>
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
                        <span className="text-[12px] text-gray-500">Dominant:</span>
                        <span className="text-[12px] font-mono text-gray-300">{BUCKET_LABELS[driverAnalysis.past.dominantBucket]}</span>
                      </div>
                      <p className="text-[12px] text-gray-500 italic">{driverAnalysis.past.evolution}</p>
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
                        <span className="text-[12px] text-gray-500">Expected:</span>
                        <span className="text-[12px] font-mono text-gray-300">{BUCKET_LABELS[driverAnalysis.forward.expectedBucket]}</span>
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
            <DraggablePanel
              title="Competitive Landscape"
              collapsed={sectorRelCollapsed}
              onToggle={toggleSectorRel}
              collapsedContent={
                relativePerfData.length >= 2 ? (
                  <SectorRelativeChart data={relativePerfData} intradayData={intradayPerfData} ticker={ticker} sectorEtf={sectorEtf} />
                ) : (
                  <p className="text-xs text-gray-500 italic">Loading performance data...</p>
                )
              }
            >
              {stepErrors.sector && <StepFailed message={stepErrors.sector} />}
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
            <DraggablePanel
              title="Upcoming Catalysts"
              subtitle="next 60 days"
              headerRight={<StepRefreshButton ticker={ticker} step="catalysts" />}
              collapsed={catalystsCollapsed}
              onToggle={toggleCatalysts}
              collapsedContent={
                catalysts.length > 0 ? (
                  <>
                    <CatalystTimelineReal catalysts={catalysts} />
                    <div className="space-y-1.5">
                      {[...catalysts].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2).map((c, i) => {
                        const mmdd = c.date.length >= 10
                          ? `${c.date.slice(5, 7)}/${c.date.slice(8, 10)}`
                          : c.date;
                        const daysUntil = Math.ceil(
                          (new Date(c.date).getTime() - Date.now()) / 86_400_000,
                        );
                        const daysLabel = daysUntil >= 0 ? `${daysUntil}d` : `${Math.abs(daysUntil)}d ago`;
                        const tagLabel = c.category.charAt(0).toUpperCase() + c.category.slice(1);
                        return (
                          <div key={i} className="flex items-start gap-2">
                            <BucketTag bucket={tagLabel} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-300 line-clamp-1">{c.description}</p>
                            </div>
                            <span className="text-[12px] font-mono text-gray-500 shrink-0">{mmdd} — {daysLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <CatalystTimeline />
                )
              }
            >
              {stepErrors.catalysts && <StepFailed message={stepErrors.catalysts} />}
              {catalysts.length > 0 ? (
                <>
                  <CatalystTimelineReal catalysts={catalysts} />
                  <div className="space-y-1.5">
                    {[...catalysts].sort((a, b) => a.date.localeCompare(b.date)).map((c, i) => {
                      const mmdd = c.date.length >= 10
                        ? `${c.date.slice(5, 7)}/${c.date.slice(8, 10)}`
                        : c.date;
                      const daysUntil = Math.ceil(
                        (new Date(c.date).getTime() - Date.now()) / 86_400_000,
                      );
                      const daysLabel = daysUntil >= 0 ? `${daysUntil}d` : `${Math.abs(daysUntil)}d ago`;
                      const tagLabel = c.category.charAt(0).toUpperCase() + c.category.slice(1);
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <BucketTag bucket={tagLabel} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-300">{c.description}</p>
                            <p className="text-[12px] text-gray-500 italic mt-0.5">{c.impactHypothesis}</p>
                          </div>
                          <span className="text-[12px] font-mono text-gray-500 shrink-0">{mmdd} — {daysLabel}</span>
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
            <DraggablePanel
              title="Metrics That Matter"
              collapsed={metricsCollapsed}
              onToggle={toggleMetrics}
              collapsedContent={
                <div className="flex flex-wrap gap-3">
                  {fiveCards.map((c) => (
                    <span key={c.id} className="text-xs text-gray-300 font-mono">
                      <span className="text-gray-500 mr-1">{c.label}:</span>
                      {c.primary} <span className={c.secondaryPositive ? 'text-emerald-400' : c.secondaryPositive === false ? 'text-red-400' : 'text-gray-500'}>{c.secondary}</span> {c.secondaryLabel}
                    </span>
                  ))}
                </div>
              }
            >
              {stepErrors.fundamentals && <StepFailed message={stepErrors.fundamentals} />}
              <FiveNumbers cards={fiveCards} showHeader={false} />
            </DraggablePanel>
          </div>

          {/* ── Revenue Flow (Sankey) — inline panel for proper flex sizing ── */}
          <div key="revenueflow">
            <div className="h-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
              <div className={`panel-drag-handle flex items-center gap-2 px-4 h-9 ${revenueCollapsed ? '' : 'border-b border-gray-800/60'} cursor-grab active:cursor-grabbing select-none shrink-0`}>
                <PanelGripIcon />
                <h3 className="text-[13px] font-semibold text-gray-300 uppercase tracking-widest">Revenue Flow</h3>
                {income.length > 0 ? (
                  <span className="text-[13px] text-gray-400">
                    {ticker} {income[0].period} FY{income[0].date.slice(0, 4)}
                  </span>
                ) : (
                  <span className="text-[13px] text-gray-500 italic">no data</span>
                )}
                <button
                  onClick={toggleRevenue}
                  className="ml-auto p-1 rounded hover:bg-gray-800 transition-colors"
                  aria-label={revenueCollapsed ? 'Expand panel' : 'Collapse panel'}
                >
                  <ChevronIcon expanded={!revenueCollapsed} />
                </button>
              </div>
              <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out flex-1 min-h-0 ${
                revenueCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
              }`}>
                <div className={`min-h-0 flex flex-col ${revenueCollapsed ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                  <div className="flex-1 min-h-[320px] flex flex-col px-4 pt-2 pb-3">
                    <div className="flex-1 min-h-0">
                      <SankeyChart nodes={sankeyData?.nodes} links={sankeyData?.links} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Fundamentals ── */}
          <div key="fundamentals">
            <DraggablePanel
              title="Fundamentals"
              collapsed={fundCollapsed}
              onToggle={toggleFund}
              collapsedContent={null}
            >
              <FundamentalsPanel income={income} cashFlow={cashFlow} balanceSheet={balanceSheet} annualIncome={annualIncome} annualCashFlow={annualCashFlow} analystEstimates={analystEstimates} quarterlyEstimates={quarterlyEstimates} />
            </DraggablePanel>
          </div>
        </GridLayout>
      )}
    </div>
  );
}

// ── Collapse persistence ──────────────────────────────────────────────────────

const COLLAPSE_STORAGE_PREFIX = 'pm:panel-collapse:';

function usePanelCollapse(ticker: string, panelId: string, defaultCollapsed: boolean) {
  const key = `${COLLAPSE_STORAGE_PREFIX}${ticker}:${panelId}`;
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function DraggablePanel({
  title,
  subtitle,
  badge,
  headerRight,
  collapsed,
  onToggle,
  collapsedContent,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  headerRight?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  collapsedContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isCollapsible = onToggle != null;
  return (
    <div className="h-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
      <div className={`panel-drag-handle flex items-center gap-2 px-4 h-9 ${collapsed ? '' : 'border-b border-gray-800/60'} cursor-grab active:cursor-grabbing select-none shrink-0`}>
        <PanelGripIcon />
        <h3 className="text-[13px] font-semibold text-gray-300 uppercase tracking-widest">{title}</h3>
        {subtitle && <span className="text-[13px] text-gray-400">{subtitle}</span>}
        {!isCollapsible && badge && (
          <span className="ml-auto text-[13px] text-gray-500 border border-gray-700 rounded px-1.5 py-px">
            {badge}
          </span>
        )}
        {isCollapsible && badge && (
          <span className="text-[13px] text-gray-500 border border-gray-700 rounded px-1.5 py-px">
            {badge}
          </span>
        )}
        {headerRight && !badge && !isCollapsible && <span className="ml-auto" />}
        {headerRight && <span className={badge ? 'ml-1.5' : ''}>{headerRight}</span>}
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
      <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out flex-1 min-h-0 ${
        collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
      }`}>
        <div className={`min-h-0 ${collapsed ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className="p-4">
            {children}
          </div>
        </div>
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
      <span className="text-[12px] text-gray-500 w-16 shrink-0">{label}</span>
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
      <span className={`text-[12px] font-mono w-8 text-right ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
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
    <span className={`text-[12px] font-semibold px-1.5 py-px rounded border ${style}`}>
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

const CATEGORY_HEX_COLORS: Record<string, string> = {
  thesis:      '#8b5cf6',
  macro:       '#818cf8',
  sector:      '#3b82f6',
  sentiment:   '#f59e0b',
  fundamental: '#10b981',
};

function CatalystTimelineReal({ catalysts }: { catalysts: Catalyst[] }) {
  // Use calendar days (midnight-to-midnight local) for consistent positioning
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayMs = todayMidnight.getTime();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

  // Group catalysts by date
  const grouped = new Map<string, Catalyst[]>();
  for (const c of catalysts) {
    const existing = grouped.get(c.date) ?? [];
    existing.push(c);
    grouped.set(c.date, existing);
  }

  return (
    <div className="mb-4">
      {/* Extra top padding so tooltips aren't clipped by the panel */}
      <div className="relative h-8 mt-16">
        {/* Main line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-800 -translate-y-1/2" />
        {/* Tick marks */}
        {[25, 50, 75].map((pct) => (
          <div key={pct} className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-gray-700" style={{ left: `${pct}%` }} />
        ))}
        {/* Start/end markers */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-500" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gray-700" />
        {/* Catalyst dots — grouped by date */}
        {Array.from(grouped.entries()).map(([date, group]) => {
          const [y, m, d] = date.split('-').map(Number);
          const catDate = new Date(y, m - 1, d).getTime();
          const pct = Math.max(0, Math.min(100, ((catDate - todayMs) / sixtyDaysMs) * 100));
          const hasThesisRelevance = group.some((c) => c.thesisRelevance);

          if (group.length === 1) {
            // Single catalyst — solid dot
            const c = group[0];
            const dotColor = CATEGORY_DOT_COLORS[c.category] ?? 'bg-gray-500';
            return (
              <div
                key={date}
                className="group/dot absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                style={{ left: `${pct}%` }}
              >
                <div
                  className={`rounded-full border-2 border-gray-950 w-4 h-4 ${dotColor} ${hasThesisRelevance ? 'ring-2 ring-violet-500/40' : ''} transition-transform group-hover/dot:scale-125`}
                />
                {/* Tooltip */}
                <div className="hidden group-hover/dot:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 shadow-xl pointer-events-none z-20">
                  <p className="text-xs font-medium text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">{c.description.split(' - ')[0]}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{c.date} · {c.category}</p>
                </div>
              </div>
            );
          }

          // Multiple catalysts on same day — split circle with conic gradient
          const colors = group.map((c) => CATEGORY_HEX_COLORS[c.category] ?? '#6b7280');
          const sliceAngle = 360 / colors.length;
          const gradientStops = colors.map((color, idx) =>
            `${color} ${idx * sliceAngle}deg ${(idx + 1) * sliceAngle}deg`
          ).join(', ');

          return (
            <div
              key={date}
              className="group/dot absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${pct}%` }}
            >
              <div
                className={`rounded-full border-2 border-gray-950 w-4 h-4 ${hasThesisRelevance ? 'ring-2 ring-violet-500/40' : ''} transition-transform group-hover/dot:scale-125`}
                style={{ background: `conic-gradient(${gradientStops})` }}
              />
              {/* Tooltip — lists each catalyst with its color */}
              <div className="hidden group-hover/dot:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 shadow-xl pointer-events-none z-20">
                {group.map((c, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 mb-1 last:mb-0">
                    <span
                      className="inline-block w-2 h-2 rounded-full mt-0.5 shrink-0"
                      style={{ backgroundColor: CATEGORY_HEX_COLORS[c.category] ?? '#6b7280' }}
                    />
                    <p className="text-xs font-medium text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">{c.description.split(' - ')[0]}</p>
                  </div>
                ))}
                <p className="text-[12px] text-gray-500 mt-0.5">{date}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative h-4 mt-1">
        <span className="absolute left-0 text-[12px] text-gray-400 font-medium">Today</span>
        <span className="absolute text-[12px] text-gray-500 -translate-x-1/2" style={{ left: '25%' }}>+15d</span>
        <span className="absolute text-[12px] text-gray-500 -translate-x-1/2" style={{ left: '50%' }}>+30d</span>
        <span className="absolute text-[12px] text-gray-500 -translate-x-1/2" style={{ left: '75%' }}>+45d</span>
        <span className="absolute right-0 text-[12px] text-gray-400 font-medium">+60d</span>
      </div>
    </div>
  );
}

// ── Bucket indicator dots ──────────────────────────────────────────────────────

const BUCKETS = [
  { label: 'Market Beta', activeDot: BUCKET_COLORS[1] },
  { label: 'Sector',      activeDot: BUCKET_COLORS[2] },
  { label: 'Sentiment',   activeDot: BUCKET_COLORS[3] },
  { label: 'Fundamental', activeDot: BUCKET_COLORS[4] },
];

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

// Full literal strings for Tailwind JIT scanner
const BUCKET_TAG_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Macro:       { bg: 'bg-indigo-950',  text: 'text-indigo-300',  border: 'border-indigo-800'  },
  Sector:      { bg: 'bg-blue-950',    text: 'text-blue-400',    border: 'border-blue-800'    },
  Sentiment:   { bg: 'bg-amber-950',   text: 'text-amber-400',   border: 'border-amber-800'   },
  Fundamental: { bg: 'bg-emerald-950', text: 'text-emerald-400', border: 'border-emerald-800' },
  Thesis:      { bg: 'bg-violet-950',  text: 'text-violet-300',  border: 'border-violet-700'  },
  default:     { bg: 'bg-gray-800',    text: 'text-gray-400',    border: 'border-gray-700'    },
};

function BucketTag({ bucket }: { bucket: string }) {
  const s = BUCKET_TAG_STYLES[bucket] ?? BUCKET_TAG_STYLES['default'];
  return (
    <span className={`text-[13px] font-semibold px-1.5 py-px rounded border ${s.bg} ${s.text} ${s.border}`}>
      {bucket}
    </span>
  );
}

// ── Catalyst timeline ──────────────────────────────────────────────────────────

// Full literal strings for Tailwind JIT scanner
const BUCKET_DOT_COLORS: Record<string, string> = {
  Macro:       'bg-indigo-400',
  Sector:      'bg-blue-500',
  Sentiment:   'bg-amber-500',
  Fundamental: 'bg-emerald-500',
  Thesis:      'bg-violet-500',
};

const GHOST_DOTS: Array<{ pct: number; bucket: string; prominent?: boolean }> = [
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
        <span className="absolute left-0 text-[12px] text-gray-400">Today</span>
        <span className="absolute text-[12px] text-gray-600 -translate-x-1/2" style={{ left: '25%' }}>+15d</span>
        <span className="absolute text-[12px] text-gray-600 -translate-x-1/2" style={{ left: '50%' }}>+30d</span>
        <span className="absolute text-[12px] text-gray-600 -translate-x-1/2" style={{ left: '75%' }}>+45d</span>
        <span className="absolute right-0 text-[12px] text-gray-400">+60d</span>
      </div>
    </div>
  );
}

// ── CatalystCategorySection ────────────────────────────────────────────────────

function CatalystCategorySection({ bucket }: { bucket: string }) {
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
          <span className="ml-0.5 text-[12px] text-gray-600 font-normal">TTM</span>
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

/** Shown when the pipeline step that fills a panel threw on the last scan.
 *  Without this, a failed step and a step that genuinely found nothing both
 *  render as an empty panel. */
function StepFailed({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-900/60 bg-amber-950/30 px-2.5 py-2">
      <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M8 16A8 8 0 108 0a8 8 0 000 16zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-amber-300">This step failed on the last scan</p>
        <p className="text-[12px] text-gray-400 leading-relaxed break-words">{message}</p>
        <p className="text-[12px] text-gray-500 mt-1">Re-run it with the refresh button in this panel&apos;s header.</p>
      </div>
    </div>
  );
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

  // Minimum link width so very small (but real) flows stay visible; also
  // guards d3-sankey against zero/negative values, which break the layout.
  const flow = (n: number) => Math.max(0.1, toB(n));

  const cogsIdx = nodes.length;
  nodes.push({ name: 'Cost of sales', group: 'cost', yoy: 'n/a', yoyPositive: null });
  links.push({ source: revIdx, target: cogsIdx, value: flow(cogs) });

  // Negative gross profit (COGS exceeds revenue): the whole flow ends at cost
  // of sales — adding downstream profit nodes would create unlinked orphans
  // and negative link values that break the layout.
  if (q.grossProfit <= 0) return { nodes, links };

  const gpIdx = nodes.length;
  nodes.push({ name: 'Gross profit', group: 'profit', ...yoyOf(q.grossProfit, py?.grossProfit) });
  links.push({ source: revIdx, target: gpIdx, value: flow(q.grossProfit) });

  if (q.operatingIncome <= 0) {
    // Operating loss: opex consumes all of gross profit and the flow stops.
    const opexIdx = nodes.length;
    nodes.push({ name: 'Op. expenses', group: 'cost', yoy: 'n/a', yoyPositive: null });
    links.push({ source: gpIdx, target: opexIdx, value: flow(q.grossProfit) });
    return { nodes, links };
  }

  const opIncIdx = nodes.length;
  nodes.push({ name: 'Op. income', group: 'profit', ...yoyOf(q.operatingIncome, py?.operatingIncome) });
  links.push({ source: gpIdx, target: opIncIdx, value: flow(q.operatingIncome) });
  if (opex > 0) {
    const opexIdx = nodes.length;
    nodes.push({ name: 'Op. expenses', group: 'cost', yoy: 'n/a', yoyPositive: null });
    links.push({ source: gpIdx, target: opexIdx, value: flow(opex) });
  }

  if (taxOth > 0) {
    const taxIdx = nodes.length;
    nodes.push({ name: 'Tax & other', group: 'tax', yoy: 'n/a', yoyPositive: null });
    links.push({ source: opIncIdx, target: taxIdx, value: flow(taxOth) });
  }
  if (q.netIncome > 0) {
    const niIdx = nodes.length;
    nodes.push({ name: 'Net income', group: 'profit', ...yoyOf(q.netIncome, py?.netIncome) });
    links.push({ source: opIncIdx, target: niIdx, value: flow(q.netIncome) });
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
      className={`px-2.5 py-0.5 text-[12px] font-mono rounded transition-colors ${
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

  // income is newest-first from FMP — take 4 most recent historical quarters
  const histActuals = income.slice(0, 4);
  const cfActuals = cashFlow.slice(0, 4);

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
                      <span className={`ml-0.5 text-[12px] ${change.positive ? 'text-emerald-500' : 'text-red-500'}`}>
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
                      <span className={`ml-0.5 text-[12px] ${change.positive ? 'text-emerald-500' : 'text-red-500'}`}>
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
