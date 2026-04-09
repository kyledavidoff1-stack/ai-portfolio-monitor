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

  const system = `You are a financial news and sentiment analyst. Your job is to search for the latest news, social media discussion, and analyst opinions about a given stock and synthesize them into structured sentiment data.

Always respond with a single JSON object matching this exact schema:
{
  "socialBuzz": "1 sentence summary of social media discussion themes from today", 
  "summary": "1 sentence summary of overall sentiment and key narratives",
  "sentiment": "bullish" | "bearish" | "neutral",
  "score": number between -1.0 (extremely bearish) and 1.0 (extremely bullish),
  "keyHeadlines": ["headline 1", "headline 2", ...] (3 most impactful headlines from today),
  "twitterScore": number -1.0 to 1.0 or null if no data,
  "redditScore": number -1.0 to 1.0 or null if no data,
  "mediaScore": number -1.0 to 1.0 or null if no data,
  "analystScore": number -1.0 to 1.0 or null if no data
}

Write like a smart friend explaining over coffee — no jargon on the surface. Be specific about what's driving sentiment.`;

  const userMessage = `Search for the latest news and sentiment about AMZN (Amazon.com, Inc.), a Consumer Cyclical company. Today's date is 2026-04-06.

Search for:
1. Recent news articles and press releases (last 1 day)
2. Social media discussion on Twitter/X and Reddit today
3. Recent analyst ratings changes or price target updates in the past day

Then synthesize into the JSON format specified. Focus on what's actually moving the narrative right now.`;

  return { system, userMessage, webSearch: true, maxSearches: 5 };
}
