'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

export interface RelativePerfPoint {
  date: string;
  stock: number;
  sectorEtf: number;
  spy: number;
}

interface Props {
  data: RelativePerfPoint[];
  intradayData?: RelativePerfPoint[];
  ticker: string;
  sectorEtf: string;
}

type RangeLabel = '1D' | '5D' | '30D' | '60D' | '90D' | '6M' | '1Y';

const RANGES: Array<{ label: RangeLabel; days: number }> = [
  { label: '1D', days: 1 },
  { label: '5D', days: 5 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
  { label: '6M', days: 126 },
  { label: '1Y', days: 252 },
];

const DEFAULT_RANGE: RangeLabel = '1D';

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimeShort(dateStr: string): string {
  if (dateStr.includes(' ')) {
    const timePart = dateStr.split(' ')[1];
    return timePart.slice(0, 5); // "HH:MM"
  }
  return formatDateShort(dateStr);
}

/** Re-normalize a slice of data so the first point = 100 for each series */
function renormalize(data: RelativePerfPoint[]): RelativePerfPoint[] {
  if (data.length === 0) return data;
  const first = data[0];
  if (first.stock === 0 || first.sectorEtf === 0 || first.spy === 0) return data;
  return data.map((d) => ({
    date: d.date,
    stock: (d.stock / first.stock) * 100,
    sectorEtf: (d.sectorEtf / first.sectorEtf) * 100,
    spy: (d.spy / first.spy) * 100,
  }));
}

export function SectorRelativeChart({ data, intradayData, ticker, sectorEtf }: Props) {
  const [range, setRange] = useState<RangeLabel>(DEFAULT_RANGE);
  const hasIntraday = (intradayData?.length ?? 0) >= 2;

  const chartData = useMemo(() => {
    if (range === '1D' && hasIntraday) {
      // Filter to today's timestamps only
      const today = new Date().toISOString().slice(0, 10);
      const todayData = intradayData!.filter((d) => d.date.startsWith(today));
      return todayData.length >= 2 ? renormalize(todayData) : renormalize(intradayData!.slice(-78)); // fallback: last ~6.5 hours
    }
    if (range === '5D' && hasIntraday) {
      // Filter to last 5 unique trading days only
      const uniqueDays = [...new Set(intradayData!.map((d) => d.date.split(' ')[0]))];
      const last5Days = new Set(uniqueDays.slice(-5));
      const filtered = intradayData!.filter((d) => last5Days.has(d.date.split(' ')[0]));
      return filtered.length >= 2 ? renormalize(filtered) : renormalize(intradayData!);
    }
    const selectedDays = RANGES.find((r) => r.label === range)?.days ?? 60;
    const sliced = data.slice(-selectedDays);
    return renormalize(sliced);
  }, [data, intradayData, range, hasIntraday]);

  if (data.length < 2) {
    return (
      <p className="text-[13px] text-gray-500 text-center py-4">
        Insufficient price history for relative performance chart
      </p>
    );
  }

  const allVals = chartData.flatMap((d) => [d.stock, d.sectorEtf, d.spy]);
  const yMin = Math.floor(Math.min(...allVals) - 1);
  const yMax = Math.ceil(Math.max(...allVals) + 1);

  // 1D = show times, 5D+ = show dates
  const xFormatter = range === '1D' ? formatTimeShort : formatDateShort;

  return (
    <div className="mb-2">
      {/* Range toggle */}
      <div className="flex items-center gap-1 mb-2">
        {RANGES.map((r) => {
          const available = r.label === '1D' || r.label === '5D'
            ? hasIntraday
            : data.length >= r.days * 0.5; // show if we have at least half the data
          return (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              disabled={!available}
              className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                range === r.label
                  ? 'bg-gray-700 text-gray-200 font-semibold'
                  : available
                    ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 cursor-not-allowed'
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tickFormatter={xFormatter}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
              }}
              labelFormatter={range === '1D' ? formatTimeShort : formatDateShort}
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}`,
                name,
              ]}
            />
            <ReferenceLine y={100} stroke="#374151" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="stock"
              name={ticker}
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#34d399' }}
            />
            <Line
              type="monotone"
              dataKey="sectorEtf"
              name={sectorEtf}
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#60a5fa' }}
            />
            <Line
              type="monotone"
              dataKey="spy"
              name="SPY"
              stroke="#6b7280"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
              activeDot={{ r: 3, fill: '#6b7280' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1.5">
        <LegendChip color="bg-emerald-400" label={ticker} />
        <LegendChip color="bg-blue-400" label={sectorEtf} />
        <LegendChip color="bg-gray-500" label="SPY" />
      </div>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[13px] text-gray-500">
      <span className={`w-4 h-0.5 ${color} inline-block rounded-full`} />
      {label}
    </span>
  );
}
