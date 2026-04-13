/**
 * Step 4: Bucket Assignment (no web search)
 * Uses outputs from steps 1-3 to classify the stock's driver and provide past/today/forward analysis.
 */

import type { NewsSentiment } from '@/types';

export function buildBucketAssignmentPrompt(params: {
  ticker: string;
  dailyChange: number;       // stock daily % change
  spyChange: number;         // SPY daily % change
  sectorEtfChange: number;   // sector ETF daily % change
  newsSentiment: NewsSentiment | null;
  fundamentalOutlook: Record<string, string> | null;
  sectorRelative: { forwardOutlook: string; premiumTrend: string; relativeStrength: string } | null;
}) {
  const { ticker, dailyChange, spyChange, sectorEtfChange, newsSentiment, fundamentalOutlook, sectorRelative } = params;

  const priceContext = `Today's moves: ${ticker} ${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(2)}% | SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}% | Sector ETF ${sectorEtfChange >= 0 ? '+' : ''}${sectorEtfChange.toFixed(2)}%`;

  const headlines = newsSentiment?.key_headlines?.map(h => h.headline) ?? newsSentiment?.keyHeadlines ?? [];
  const sentimentContext = newsSentiment
    ? `News & Sentiment: ${newsSentiment.overall_tone ?? newsSentiment.sentiment} (score: ${newsSentiment.score.toFixed(2)})\nSummary: ${newsSentiment.today_summary ?? newsSentiment.summary}\nKey headlines: ${headlines.join('; ')}`
    : 'News & Sentiment: No data available';

  const fundamentalContext = fundamentalOutlook
    ? `Fundamental Outlook:\n${Object.entries(fundamentalOutlook).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    : 'Fundamental data: Not available';

  const sectorContext = sectorRelative
    ? `Sector Relative: ${sectorRelative.forwardOutlook}\nPremium trend: ${sectorRelative.premiumTrend}\nRelative strength: ${sectorRelative.relativeStrength}`
    : 'Sector data: Not available';

  const system = `You are a portfolio analyst specializing in the four-bucket driver classification framework:
1 = Market Beta — stock is simply moving with the broad market (high correlation to SPY)
2 = Sector / Factor Rotation — stock is moving with its sector cohort (sector ETF driving)
3 = Sentiment / Positioning / Virality — narrative-driven or mechanical/positioning moves. ALWAYS specify sub-type: retail narrative, analyst rating change, index rebalance, short squeeze, gamma effects, earnings whisper, etc.
4 = Fundamental Change — earnings, guidance revision, product launch, regulatory, executive change

Given news sentiment, fundamental outlook, sector-relative data, and price action, classify what is driving this stock.

Respond with a single JSON object:
{
  "bucketPrimary": 1|2|3|4,
  "bucketSecondary": 1|2|3|4 or null,
  "bucketRationale": "2-3 sentence rationale explaining the classification",
  "bucketConfidence": "high" | "medium" | "low",
  "past": {
    "summary": "2-3 sentence summary of what drove the stock over past 30-60 days",
    "dominantBucket": 1|2|3|4,
    "evolution": "1-2 sentence description of how the driver evolved over time"
  },
  "today": {
    "primaryBucket": 1|2|3|4,
    "secondaryBucket": 1|2|3|4 or null,
    "rationale": "2-3 sentence rationale for today's driver",
    "confidence": "high" | "medium" | "low"
  },
  "forward": {
    "summary": "2-3 sentence forward outlook on expected dominant driver",
    "expectedBucket": 1|2|3|4,
    "keyFactors": ["factor 1", "factor 2", "factor 3"]
  }
}`;

  const userMessage = `Classify the driver for ${ticker}:

${priceContext}

${sentimentContext}

${fundamentalContext}

${sectorContext}`;

  return { system, userMessage };
}
