// Portfolio beta calculation — used in Sprint 6

export function portfolioBeta(holdings: { beta: number; marketValue: number }[]): number {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  if (totalValue === 0) return 0;
  return holdings.reduce((sum, h) => sum + (h.beta * h.marketValue) / totalValue, 0);
}
