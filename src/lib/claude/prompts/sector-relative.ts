/**
 * Step 3: Sector-Relative Context (no web search)
 * Assesses stock positioning within its sector using peer data and relative performance.
 */

import type { PeerRow } from '@/types';

function buildPeerTable(peerRows: PeerRow[]): string {
  const header = 'Ticker | Rev Growth YoY | Op Margin | FCF Margin | Fwd P/E | Is Self';
  const rows = peerRows.map((r) =>
    `${r.ticker} | ${r.revGrowthYoY != null ? (r.revGrowthYoY * 100).toFixed(1) + '%' : 'N/A'} | ${r.opMargin != null ? (r.opMargin * 100).toFixed(1) + '%' : 'N/A'} | ${r.fcfMargin != null ? (r.fcfMargin * 100).toFixed(1) + '%' : 'N/A'} | ${r.forwardPeRatio?.toFixed(1) ?? r.peRatio?.toFixed(1) ?? 'N/A'} | ${r.isSelf ? 'YES' : 'no'}`
  );
  return [header, ...rows].join('\n');
}

export function buildSectorRelativePrompt(params: {
  ticker: string;
  sectorEtf: string;
  peerRows: PeerRow[];
  pePercentile: number | null;
  relativePerf30d: { stock: number; sector: number; spy: number } | null;
  relativePerf90d: { stock: number; sector: number; spy: number } | null;
}) {
  const { ticker, sectorEtf, peerRows, pePercentile, relativePerf30d, relativePerf90d } = params;

  const peerTable = buildPeerTable(peerRows);

  const perfInfo: string[] = [];
  if (relativePerf30d) {
    perfInfo.push(`30-day: ${ticker} ${(relativePerf30d.stock).toFixed(1)}% vs ${sectorEtf} ${(relativePerf30d.sector).toFixed(1)}% vs SPY ${(relativePerf30d.spy).toFixed(1)}%`);
  }
  if (relativePerf90d) {
    perfInfo.push(`90-day: ${ticker} ${(relativePerf90d.stock).toFixed(1)}% vs ${sectorEtf} ${(relativePerf90d.sector).toFixed(1)}% vs SPY ${(relativePerf90d.spy).toFixed(1)}%`);
  }

  const system = `You are a sector analyst assessing a stock's positioning relative to its sector and peers. Given peer comparison metrics and relative performance data, provide a forward-looking assessment.

Respond with a single JSON object:
{
  "forwardOutlook": "2-3 sentence forward relative outlook — will this stock outperform or underperform its sector?",
  "premiumTrend": "expanding" | "compressing" | "stable",
  "relativeStrength": "1 sentence on whether the stock is gaining or losing relative strength vs sector"
}

Be specific about the drivers of relative performance.`;

  const userMessage = `Assess ${ticker}'s position relative to sector (${sectorEtf}) and peers:

Peer Comparison:
${peerTable}

${pePercentile != null ? `P/E Percentile among peers: ${pePercentile}th` : ''}

Relative Performance:
${perfInfo.length > 0 ? perfInfo.join('\n') : 'Insufficient data for relative performance comparison'}`;

  return { system, userMessage };
}
