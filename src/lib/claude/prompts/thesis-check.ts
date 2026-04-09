/**
 * Step 5: Thesis Check (no web search)
 * Evaluates user's investment thesis against step 1-3 outputs.
 */

import type { NewsSentiment } from '@/types';

export function buildThesisCheckPrompt(params: {
  ticker: string;
  thesis: string;
  newsSentiment: NewsSentiment | null;
  fundamentalOutlook: Record<string, string> | null;
  sectorRelative: { forwardOutlook: string; premiumTrend: string; relativeStrength: string } | null;
}) {
  const { ticker, thesis, newsSentiment, fundamentalOutlook, sectorRelative } = params;

  const sentimentContext = newsSentiment
    ? `News & Sentiment: ${newsSentiment.sentiment} (score: ${newsSentiment.score.toFixed(2)})\n${newsSentiment.summary}`
    : 'News: No data';

  const fundamentalContext = fundamentalOutlook
    ? `Fundamentals:\n${Object.entries(fundamentalOutlook).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    : 'Fundamentals: No data';

  const sectorContext = sectorRelative
    ? `Sector: ${sectorRelative.forwardOutlook} (premium ${sectorRelative.premiumTrend})`
    : 'Sector: No data';

  const system = `You are an investment thesis analyst. Given a user's investment thesis and recent market data, evaluate whether the thesis is being confirmed, challenged, or remains neutral.

Respond with a single JSON object:
{
  "status": "confirmed" | "challenged" | "neutral",
  "past": {
    "summary": "2-3 sentences on how evidence has accumulated for or against the thesis over the past 30-60 days",
    "evidence": ["evidence point 1", "evidence point 2", ...] (3-5 items)
  },
  "today": {
    "explanation": "2-3 sentence assessment of thesis status right now"
  },
  "forward": {
    "outlook": "2-3 sentence forward-looking thesis outlook for next 30-60 days",
    "keyEvents": ["upcoming event 1", "event 2", ...] (2-4 items that could validate or challenge)
  }
}

"confirmed" = evidence supports thesis assumptions
"challenged" = evidence contradicts thesis assumptions
"neutral" = no strong evidence either way

Be specific and reference actual data points.`;

  const userMessage = `Evaluate the investment thesis for ${ticker}:

THESIS: "${thesis}"

${sentimentContext}

${fundamentalContext}

${sectorContext}`;

  return { system, userMessage };
}
