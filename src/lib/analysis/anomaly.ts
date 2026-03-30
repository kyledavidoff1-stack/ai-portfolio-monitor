// Regime divergence detection — used in Sprint 6

import { ANOMALY_THRESHOLD } from '@/lib/config/constants';

export function detectAnomaly(
  stockReturn: number,
  marketReturn: number,
  stockBeta: number,
  threshold: number = ANOMALY_THRESHOLD,
): { isAnomaly: boolean; divergence: number } {
  const expectedReturn = stockBeta * marketReturn;
  const divergence = stockReturn - expectedReturn;
  return {
    isAnomaly: Math.abs(divergence) > threshold,
    divergence,
  };
}
