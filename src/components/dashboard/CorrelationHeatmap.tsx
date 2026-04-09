'use client';

import { useState } from 'react';
import type { CorrelationMatrix } from '@/lib/analysis/correlation';

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Color interpolation for correlation values:
 * -1 (green) → 0 (dark gray) → +1 (red)
 * Power curve 0.7 boosts mid-range contrast so 0.3–0.7 values are clearly visible.
 */
function corrColor(val: number): string {
  if (isNaN(val)) return '#1f2937';
  const clamped = Math.max(-1, Math.min(1, val));
  const t = Math.pow(Math.abs(clamped), 0.7);

  if (clamped > 0) {
    return `rgb(${lerp(31, 239, t)},${lerp(41, 68, t)},${lerp(55, 68, t)})`;
  } else if (clamped < 0) {
    return `rgb(${lerp(31, 34, t)},${lerp(41, 197, t)},${lerp(55, 94, t)})`;
  }
  return '#1f2937';
}

function corrTextColor(val: number): string {
  return Math.abs(val) > 0.3 ? '#f9fafb' : '#9ca3af';
}

export function CorrelationHeatmap({ data }: { data: CorrelationMatrix | null }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  if (!data || data.tickers.length < 2) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[13px] text-gray-500 text-center">
          {!data || data.tickers.length === 0
            ? 'Add 2+ holdings to view correlations'
            : 'Need at least 2 holdings for correlations'}
        </p>
      </div>
    );
  }

  const { tickers, matrix } = data;
  const n = tickers.length;
  const hoverInfo = hover ? {
    a: tickers[hover.i],
    b: tickers[hover.j],
    val: matrix[hover.i][hover.j],
  } : null;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Tooltip */}
      <div className="h-5 text-center">
        {hoverInfo ? (
          <span className="text-[13px] font-mono text-gray-300">
            {hoverInfo.a} / {hoverInfo.b}: <span className="font-semibold">{hoverInfo.val.toFixed(2)}</span>
          </span>
        ) : (
          <span className="text-[13px] text-gray-600">hover for details</span>
        )}
      </div>

      {/* Grid — all items use explicit gridRow/gridColumn to avoid auto-placement issues */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid gap-px" style={{
          gridTemplateColumns: `3.5rem repeat(${n}, minmax(2rem, 1fr))`,
          gridTemplateRows: `1.5rem repeat(${n}, minmax(2rem, 1fr))`,
          width: '100%',
        }}>
          {/* Column headers — row 1, columns 2..n+1 */}
          {tickers.map((t, j) => (
            <div
              key={`h-${t}`}
              className="text-[11px] font-mono text-gray-500 text-center truncate px-0.5"
              style={{ gridRow: 1, gridColumn: j + 2 }}
              title={t}
            >
              {t}
            </div>
          ))}

          {/* Row headers — rows 2..n+1, column 1 */}
          {tickers.map((t, i) => (
            <div
              key={`r-${t}`}
              className="text-[11px] font-mono text-gray-500 flex items-center justify-end pr-1 truncate"
              style={{ gridRow: i + 2, gridColumn: 1 }}
              title={t}
            >
              {t}
            </div>
          ))}

          {/* Data cells — explicit gridRow/gridColumn ensures i,j always match position */}
          {tickers.map((_, i) =>
            tickers.map((_, j) => {
              const val = matrix[i][j];
              const isSelf = i === j;
              const isHovered = hover?.i === i && hover?.j === j;
              return (
                <div
                  key={`${i}-${j}`}
                  className="rounded-sm flex items-center justify-center cursor-default"
                  style={{
                    gridRow: i + 2,
                    gridColumn: j + 2,
                    backgroundColor: isSelf ? '#374151' : corrColor(val),
                    opacity: hover && hover.i !== i && hover.j !== j ? 0.3 : 1,
                    outline: isHovered && !isSelf ? '2px solid #ffffff' : 'none',
                    outlineOffset: '-1px',
                    filter: isHovered && !isSelf ? 'brightness(1.3)' : 'none',
                  }}
                  onMouseEnter={() => setHover({ i, j })}
                  onMouseLeave={() => setHover(null)}
                >
                  {n <= 8 && (
                    <span
                      className="text-[10px] font-mono font-medium leading-none"
                      style={{ color: isSelf ? '#6b7280' : corrTextColor(val) }}
                    >
                      {isSelf ? '—' : val.toFixed(2)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <span className="text-[11px] text-gray-500">-1.0</span>
        <div className="flex h-2 w-32 rounded-full overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: corrColor((i / 19) * 2 - 1) }} />
          ))}
        </div>
        <span className="text-[11px] text-gray-500">+1.0</span>
      </div>
    </div>
  );
}
