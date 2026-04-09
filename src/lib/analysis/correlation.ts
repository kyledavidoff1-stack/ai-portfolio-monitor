// Correlation, normalization, and percentile utilities for Sprint 3

/**
 * Compute daily returns from an array of closing prices.
 * Returns an array of length (closes.length - 1).
 */
export function dailyReturns(closes: number[]): number[] {
  return closes.slice(1).map((p, i) => (closes[i] > 0 ? p / closes[i] - 1 : 0));
}

/**
 * Pearson correlation coefficient between two arrays of equal length.
 * Returns 0 if either array has zero variance.
 */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dA = a[i] - meanA;
    const dB = b[i] - meanB;
    cov += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }

  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

export interface CorrelationMatrix {
  tickers: string[];
  matrix: number[][]; // tickers.length x tickers.length, values -1 to 1
}

/**
 * Build a full NxN correlation matrix from aligned price data.
 */
export function buildCorrelationMatrix(
  priceData: Map<string, { date: string; close: number }[]>,
  tickers: string[],
): CorrelationMatrix {
  const returnsMap = new Map<string, number[]>();
  for (const t of tickers) {
    const closes = priceData.get(t)?.map((r) => r.close) ?? [];
    returnsMap.set(t, dailyReturns(closes));
  }

  const n = tickers.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    const retI = returnsMap.get(tickers[i]) ?? [];
    for (let j = i + 1; j < n; j++) {
      const retJ = returnsMap.get(tickers[j]) ?? [];
      const val = Math.round(pearsonCorrelation(retI, retJ) * 100) / 100;
      matrix[i][j] = val;
      matrix[j][i] = val;
    }
  }

  return { tickers, matrix };
}

/**
 * Normalize price series to 100 at the start for relative performance charts.
 */
export function normalizeTo100(
  prices: { date: string; close: number }[],
): { date: string; value: number }[] {
  if (prices.length === 0) return [];
  const base = prices[0].close;
  if (base === 0) return prices.map((p) => ({ date: p.date, value: 0 }));
  return prices.map((p) => ({ date: p.date, value: Math.round((p.close / base) * 10000) / 100 }));
}

/**
 * Calculate percentile rank of a value within an array (0-100).
 */
export function percentileRank(value: number, values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  const equal = sorted.filter((v) => v === value).length;
  return Math.round(((below + equal * 0.5) / sorted.length) * 100);
}
