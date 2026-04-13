/**
 * Step 1: News & Sentiment Scan (web search enabled)
 * Searches for recent news, social media discussion, and analyst opinions.
 * Returns structured NewsSentiment data.
 */

export function buildNewsSentimentPrompt(params: {
  ticker: string;
  companyName: string;
  sector: string;
}) {
  const { ticker, companyName, sector } = params;
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are a financial news and sentiment analyst. Search for the latest news, social media discussion, and analyst opinions about a given stock.
Always respond with a single JSON object matching this exact schema:
{
  "overall_tone": "bullish" | "bearish" | "neutral",
  "today_summary": "single punchy line — what's driving sentiment today",
  "institutional_today": "2-3 short phrases max. What are media and analysts saying today. No filler.",
  "social_today": "2-3 short phrases max. Twitter/X and Reddit tone, any trending narratives.",
  "key_headlines": [
    { "headline": "...", "source": "Bloomberg", "date": "2026-04-12" }
  ],
  "analyst_ratings": [
    { "firm": "Morgan Stanley", "action": "Upgrade to Overweight", "priceTarget": "$180 → $220" }
  ],
  "context_30_60": "2 short phrases max. How sentiment evolved, what shifted, were institutional and retail views aligned or divergent. No paragraphs.",
  "score": number between -1.0 and 1.0,
  "twitterScore": number -1.0 to 1.0 or null,
  "redditScore": number -1.0 to 1.0 or null,
  "mediaScore": number -1.0 to 1.0 or null,
  "analystScore": number -1.0 to 1.0 or null
}
Rules:
- key_headlines: 3 most important recent headlines with source and date.
- analyst_ratings: upgrades, downgrades, initiations from the past week. Empty array if none.
- Every text field: short phrases separated by semicolons, not full paragraphs. Only use a full sentence if something is genuinely complex.
- Be specific about what's driving sentiment. No generic observations.`;

  const userMessage = `Search for the latest news and sentiment about ${ticker} (${companyName}), a ${sector} company. Today's date is ${today}.

Search for:
1. Recent news articles and press releases (last 1 day)
2. Social media discussion on Twitter/X and Reddit today
3. Recent analyst ratings changes or price target updates in the past week
4. How sentiment has evolved over the past 30-60 days

Then synthesize into the JSON format specified. Focus on what's actually moving the narrative right now.`;

  return { system, userMessage, webSearch: true, maxSearches: 5 };
}
