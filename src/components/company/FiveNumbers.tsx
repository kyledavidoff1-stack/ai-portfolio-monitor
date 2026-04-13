'use client';

import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';

// Lookup table — full literal strings, safe for Tailwind JIT scanner
const CARD_COLORS = {
  emerald: { stroke: '#34d399', border: 'border-l-emerald-500' },
  blue:    { stroke: '#60a5fa', border: 'border-l-blue-500'    },
  cyan:    { stroke: '#22d3ee', border: 'border-l-cyan-500'    },
  violet:  { stroke: '#a78bfa', border: 'border-l-violet-500'  },
  amber:   { stroke: '#fbbf24', border: 'border-l-amber-500'   },
} as const;

export type CardColor = keyof typeof CARD_COLORS;

export interface MetricCardData {
  id: string;
  label: string;
  color: CardColor;
  /** Main value, e.g. "$638B" */
  primary: string;
  /** Small suffix beside primary, e.g. "TTM" */
  primarySuffix: string;
  /** Change metric, e.g. "+11.3%" */
  secondary: string;
  /** Label for secondary, e.g. "YoY" */
  secondaryLabel: string;
  /** true = green, false = red, null = neutral */
  secondaryPositive: boolean | null;
  /** Oldest-first data points for sparkline */
  spark: { v: number }[];
  /** e.g. "Q2 '23 – Q2 '25" */
  dateRange?: string;
  noData: boolean;
  forwardOutlook?: string;
}

interface Props {
  cards: MetricCardData[];
  /** Set to false when rendering inside a panel that already has a header */
  showHeader?: boolean;
}

export function FiveNumbers({ cards, showHeader = true }: Props) {
  return (
    <div>
      {showHeader && (
        <h2 className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Metrics That Matter
        </h2>
      )}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <MetricCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

/** Show dots only on first and last points, using the card's own color */
function sparkDot(card: MetricCardData) {
  if (card.spark.length < 2) return false;
  const lastIdx = card.spark.length - 1;
  const color = CARD_COLORS[card.color].stroke;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any) => {
    if (props.index !== 0 && props.index !== lastIdx) {
      return <circle key={props.index} cx={0} cy={0} r={0} fill="none" />;
    }
    return (
      <circle
        key={props.index}
        cx={props.cx}
        cy={props.cy}
        r={2.5}
        fill={color}
        stroke="#111827"
        strokeWidth={1}
      />
    );
  };
}

function MetricCard({ card }: { card: MetricCardData }) {
  const c = CARD_COLORS[card.color];

  return (
    <div
      className={`bg-gray-900 border border-gray-800 border-l-4 ${c.border} rounded-lg p-4 flex flex-col gap-2.5`}
    >
      {/* Label */}
      <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest leading-none">
        {card.label}
      </p>

      {card.noData ? (
        <p className="text-xs text-gray-400 italic">Scan to load financial data</p>
      ) : (
        <>
          {/* Primary value */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-gray-100 leading-none tracking-tight">
              {card.primary}
            </span>
            {card.primarySuffix && (
              <span className="text-[13px] text-gray-500 leading-none">{card.primarySuffix}</span>
            )}
          </div>

          {/* Secondary metric */}
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xs font-mono font-semibold leading-none ${
                card.secondaryPositive === true  ? 'text-emerald-400' :
                card.secondaryPositive === false ? 'text-red-400'     :
                'text-gray-400'
              }`}
            >
              {card.secondary}
            </span>
            {card.secondaryLabel && (
              <span className="text-[13px] text-gray-500">{card.secondaryLabel}</span>
            )}
          </div>

          {/* Sparkline */}
          {card.spark.length > 1 ? (
            <div>
              <div className="h-14 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={card.spark} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <defs>
                      <linearGradient id={`grad-${card.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c.stroke} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={c.stroke} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <ReferenceLine y={card.spark[0].v} stroke="#374151" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={c.stroke}
                      fill={`url(#grad-${card.id})`}
                      strokeWidth={1.5}
                      dot={sparkDot(card)}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {card.dateRange && (
                <p className="text-[12px] text-gray-600 text-center mt-0.5">{card.dateRange}</p>
              )}
            </div>
          ) : (
            <div className="h-14 flex items-center">
              <div className="h-px w-full bg-gray-800" />
            </div>
          )}
        </>
      )}

      {/* Forward context */}
      <p className="text-[13px] text-gray-500 italic mt-auto leading-relaxed">
        {card.forwardOutlook || 'Run scan for forward outlook'}
      </p>
    </div>
  );
}
