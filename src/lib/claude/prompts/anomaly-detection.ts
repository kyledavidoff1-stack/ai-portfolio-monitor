/**
 * Step 8: Anomaly Detection (portfolio-level, no web search)
 * Identifies divergences and thesis challenges across the portfolio.
 */

import type { Regime, AnalysisScan } from '@/types';

function buildScanSummary(scan: AnalysisScan): string {
  const parts: string[] = [`${scan.ticker}:`];
  if (scan.bucketPrimary) parts.push(`bucket=${scan.bucketPrimary}`);
  if (scan.bucketConfidence) parts.push(`confidence=${scan.bucketConfidence}`);
  if (scan.thesisStatus) parts.push(`thesis=${scan.thesisStatus}`);
  if (scan.newsSentiment) parts.push(`sentiment=${scan.newsSentiment.overall_tone ?? scan.newsSentiment.sentiment}(${scan.newsSentiment.score.toFixed(2)})`);
  return parts.join(' ');
}

export function buildAnomalyDetectionPrompt(params: {
  regime: Regime;
  regimeRationale: string;
  scans: AnalysisScan[];
  priceChanges: Record<string, number>;  // ticker → daily % change
}) {
  const { regime, regimeRationale, scans, priceChanges } = params;

  const scanSummaries = scans.map(buildScanSummary).join('\n');
  const priceInfo = Object.entries(priceChanges)
    .map(([t, c]) => `${t}: ${c >= 0 ? '+' : ''}${c.toFixed(2)}%`)
    .join(', ');

  const system = `You are a risk analyst identifying anomalies in a stock portfolio. Given per-stock analysis and the current market regime, flag any divergences that warrant attention.

Respond with a JSON array of anomaly flags (empty array [] if no anomalies):
[
  {
    "ticker": "AAPL",
    "flagType": "regime_divergence" | "sector_divergence" | "thesis_challenge",
    "description": "1-2 sentence description of the anomaly",
    "severity": "high" | "medium" | "low"
  }
]

Flag types:
- regime_divergence: Stock moving opposite to market regime (e.g., stock down 3% in risk-on regime)
- sector_divergence: Stock diverging significantly from its sector peers
- thesis_challenge: Evidence accumulating against the user's investment thesis

Only flag genuine anomalies — not normal market behavior. Use "high" severity sparingly (material risk to portfolio). Most flags should be "medium" or "low".`;

  const userMessage = `Analyze this portfolio for anomalies:

Market Regime: ${regime} — ${regimeRationale}

Today's Price Changes: ${priceInfo}

Per-Stock Analysis:
${scanSummaries}`;

  return { system, userMessage };
}
