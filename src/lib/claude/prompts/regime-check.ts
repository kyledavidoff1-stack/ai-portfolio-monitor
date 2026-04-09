/**
 * Step 7: Regime Check (portfolio-level, web search enabled)
 * Classifies the current market regime.
 */

export function buildRegimeCheckPrompt(params: {
  spyPrice: number;
  spyChange: number;         // daily % change
  spyChangePercent: number;  // daily % change
}) {
  const { spyPrice, spyChange, spyChangePercent } = params;
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are a macro strategist classifying the current market regime. Based on market data and a web search for current conditions, classify the regime.

Respond with a single JSON object:
{
  "regime": "risk_on" | "risk_off" | "rotation" | "dislocation",
  "rationale": "2-3 sentence explanation of why this regime classification applies",
  "spyChange": number (SPY daily % change),
  "vix": number (current VIX level, from your web search)
}

Regime definitions:
- risk_on: Broad market rally, low VIX (<18), risk assets outperforming. Money flowing into growth, high-beta.
- risk_off: Broad market selloff or defensive posture. VIX elevated (>22), flight to quality. Treasuries, utilities, staples outperforming.
- rotation: Market flat but sectors rotating. Some sectors up, others down. Factor rotation (value↔growth, large↔small).
- dislocation: Extreme stress. VIX >30, credit spreads widening, correlations spiking. Liquidity crisis indicators.`;

  const userMessage = `Classify today's market regime. Today is ${today}.

SPY: $${spyPrice.toFixed(2)}, daily change: ${spyChange >= 0 ? '+' : ''}$${spyChange.toFixed(2)} (${spyChangePercent >= 0 ? '+' : ''}${spyChangePercent.toFixed(2)}%)

Search for:
1. Current VIX level
2. Sector performance today (which sectors up vs down)
3. Any major market-moving news today
4. Treasury yields / credit spread changes`;

  return { system, userMessage, webSearch: true, maxSearches: 3 };
}
