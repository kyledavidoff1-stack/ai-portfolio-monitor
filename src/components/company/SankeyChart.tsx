'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeGroup = 'segment' | 'revenue' | 'cost' | 'profit' | 'tax';

export interface RawNode {
  name: string;
  group: NodeGroup;
  yoy: string;
  yoyPositive: boolean | null;
}

export interface RawLink {
  source: number;
  target: number;
  value: number; // billions USD
}

// ── Fallback: hardcoded Amazon Q1 FY2024 data ─────────────────────────────────

const FALLBACK_NODES: RawNode[] = [
  // Revenue segments (indices 0–6)
  { name: 'Online stores',    group: 'segment', yoy: '+7%',   yoyPositive: true  },
  { name: 'Physical stores',  group: 'segment', yoy: '+6%',   yoyPositive: true  },
  { name: '3P Sellers',       group: 'segment', yoy: '+16%',  yoyPositive: true  },
  { name: 'Advertising',      group: 'segment', yoy: '+24%',  yoyPositive: true  },
  { name: 'Subscriptions',    group: 'segment', yoy: '+13%',  yoyPositive: true  },
  { name: 'AWS',              group: 'segment', yoy: '+17%',  yoyPositive: true  },
  { name: 'Other',            group: 'segment', yoy: '+3%',   yoyPositive: true  },
  // Aggregates (indices 7–18)
  { name: 'Revenue',          group: 'revenue', yoy: '+13%',  yoyPositive: true  },
  { name: 'Cost of sales',    group: 'cost',    yoy: '+6%',   yoyPositive: false },
  { name: 'Gross profit',     group: 'profit',  yoy: '+22%',  yoyPositive: true  },
  { name: 'Fulfillment',      group: 'cost',    yoy: '+8%',   yoyPositive: false },
  { name: 'Technology',       group: 'cost',    yoy: '+5%',   yoyPositive: false },
  { name: 'Sales & mktg',     group: 'cost',    yoy: '+4%',   yoyPositive: false },
  { name: 'G&A',              group: 'cost',    yoy: '-5%',   yoyPositive: true  },
  { name: 'Other ops',        group: 'cost',    yoy: '+42%',  yoyPositive: false },
  { name: 'Op. profit',       group: 'profit',  yoy: '+221%', yoyPositive: true  },
  { name: 'Tax',              group: 'tax',     yoy: 'n/a',   yoyPositive: null  },
  { name: 'Interest & other', group: 'tax',     yoy: 'n/a',   yoyPositive: null  },
  { name: 'Net income',       group: 'profit',  yoy: '+216%', yoyPositive: true  },
];

const FALLBACK_LINKS: RawLink[] = [
  { source: 0,  target: 7,  value: 54.7 },
  { source: 1,  target: 7,  value: 5.2  },
  { source: 2,  target: 7,  value: 34.6 },
  { source: 3,  target: 7,  value: 11.8 },
  { source: 4,  target: 7,  value: 10.7 },
  { source: 5,  target: 7,  value: 25.0 },
  { source: 6,  target: 7,  value: 1.3  },
  { source: 7,  target: 8,  value: 72.6 },
  { source: 7,  target: 9,  value: 70.7 },
  { source: 9,  target: 10, value: 22.3 },
  { source: 9,  target: 11, value: 20.4 },
  { source: 9,  target: 12, value: 9.7  },
  { source: 9,  target: 13, value: 2.7  },
  { source: 9,  target: 14, value: 0.2  },
  { source: 9,  target: 15, value: 15.4 },
  { source: 15, target: 16, value: 2.6  },
  { source: 15, target: 17, value: 2.3  },
  { source: 15, target: 18, value: 10.5 },
];

// ── Color config (hex — used in SVG style, not Tailwind) ─────────────────────

const NODE_FILL: Record<NodeGroup, string> = {
  segment: '#0d9488',
  revenue: '#059669',
  profit:  '#10b981',
  cost:    '#be123c',
  tax:     '#e11d48',
};

const LINK_STROKE: Record<NodeGroup, string> = {
  segment: '#14b8a6',
  revenue: '#34d399',
  profit:  '#34d399',
  cost:    '#f43f5e',
  tax:     '#f43f5e',
};

const YOY_FILL: Record<string, string> = {
  true:  '#4ade80',
  false: '#f87171',
  null:  '#6b7280',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface SankeyChartProps {
  /** Override nodes — if omitted, falls back to Amazon Q1 FY2024 placeholder */
  nodes?: RawNode[];
  /** Override links — if omitted, falls back to Amazon Q1 FY2024 placeholder */
  links?: RawLink[];
}

export function SankeyChart({ nodes: propNodes, links: propLinks }: SankeyChartProps = {}) {
  const NODES = propNodes ?? FALLBACK_NODES;
  const LINKS = propLinks ?? FALLBACK_LINKS;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setDims({ w, h });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes: laidOutNodes, links: laidOutLinks } = useMemo(() => {
    const { w: W, h: H } = dims;
    if (W < 80 || H < 50) return { nodes: [], links: [] };

    // Adaptive label margins — wider panels get more room for longer labels
    const lrMargin = Math.min(W * 0.13, 92);
    const tbMargin = 4;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layout = (sankey as any)()
      .nodeWidth(Math.max(8, Math.round(W * 0.016)))
      .nodePadding(Math.max(4, Math.round(H * 0.022)))
      .extent([[lrMargin, tbMargin], [W - lrMargin, H - tbMargin]]);

    return layout({
      nodes: NODES.map((n) => ({ ...n })),
      links: LINKS.map((l) => ({ ...l })),
    });
  }, [dims, NODES, LINKS]);

  const pathGen = useMemo(() => sankeyLinkHorizontal(), []);

  return (
    <div ref={containerRef} className="w-full h-full">
      {laidOutNodes.length > 0 && (
        <svg
          width={dims.w}
          height={dims.h}
          aria-label="Revenue flow Sankey diagram"
        >
          {/* ── Links ── */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(laidOutLinks as any[]).map((link: any, i: number) => {
            const targetGroup = (link.target as { group: NodeGroup }).group;
            const stroke = LINK_STROKE[targetGroup] ?? '#6b7280';
            return (
              <path
                key={i}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                d={(pathGen as any)(link) ?? ''}
                fill="none"
                stroke={stroke}
                strokeWidth={Math.max(1, link.width ?? 0)}
                strokeOpacity={0.18}
              />
            );
          })}

          {/* ── Nodes ── */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(laidOutNodes as any[]).map((node: any, i: number) => {
            const x0: number = node.x0 ?? 0;
            const x1: number = node.x1 ?? 0;
            const y0: number = node.y0 ?? 0;
            const y1: number = node.y1 ?? 0;
            const h = y1 - y0;
            const midY = (y0 + y1) / 2;

            const isFirst = node.depth === 0;
            const labelX = isFirst ? x0 - 6 : x1 + 6;
            const anchor: 'end' | 'start' = isFirst ? 'end' : 'start';

            const showValue = h > 10;
            const showYoy   = h > 26;

            const fill = NODE_FILL[node.group as NodeGroup] ?? '#6b7280';
            const value: number = node.value ?? 0;
            const yoyFill = YOY_FILL[String(node.yoyPositive)] ?? '#6b7280';

            const nameY  = showValue ? midY - (showYoy ? 9 : 5) : midY;
            const valueY = nameY + (showYoy ? 9 : 10);
            const yoyY   = valueY + 9;

            // Tall intermediate nodes get a brief inside label
            const isIntermediate = !isFirst && !!node.sourceLinks?.length;
            const showInside = isIntermediate && h > 45;

            return (
              <g key={i}>
                <rect x={x0} y={y0} width={x1 - x0} height={h} fill={fill} rx={2} />

                {showInside ? (
                  <>
                    <text
                      x={(x0 + x1) / 2} y={midY - (h > 60 ? 7 : 0)}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} fill="#f9fafb" fontFamily="ui-monospace, monospace"
                    >
                      {node.name}
                    </text>
                    {h > 60 && (
                      <text
                        x={(x0 + x1) / 2} y={midY + 7}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={7.5} fill="#d1d5db" fontFamily="ui-monospace, monospace"
                      >
                        ${value.toFixed(1)}B
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    <text
                      x={labelX} y={nameY}
                      textAnchor={anchor} dominantBaseline="middle"
                      fontSize={8.5} fill="#e5e7eb" fontFamily="ui-monospace, monospace"
                    >
                      {node.name}
                    </text>
                    {showValue && (
                      <text
                        x={labelX} y={valueY}
                        textAnchor={anchor} dominantBaseline="middle"
                        fontSize={8} fill="#9ca3af" fontFamily="ui-monospace, monospace"
                      >
                        ${value.toFixed(1)}B
                      </text>
                    )}
                    {showYoy && (
                      <text
                        x={labelX} y={yoyY}
                        textAnchor={anchor} dominantBaseline="middle"
                        fontSize={7.5} fill={yoyFill} fontFamily="ui-monospace, monospace"
                      >
                        {node.yoy}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
