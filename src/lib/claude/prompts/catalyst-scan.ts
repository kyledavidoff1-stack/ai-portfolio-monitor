/**
 * Step 6: Catalyst Scan (web search enabled)
 * Searches for upcoming catalysts in the next 60 days.
 */

export function buildCatalystScanPrompt(params: {
  ticker: string;
  companyName: string;
  sector: string;
  thesis: string | null;
}) {
  const { ticker, companyName, sector, thesis } = params;
  const today = new Date().toISOString().slice(0, 10);

  const thesisContext = thesis
    ? `\nThe user's investment thesis: "${thesis}"\nFlag each catalyst for thesis relevance.`
    : '\nNo user thesis set — set thesisRelevance to false for all catalysts.';

  const system = `You are a financial events analyst. Search for all upcoming catalysts in the next 60 days that could affect the given stock. Include company-specific events AND macro/sector events relevant to this specific stock.

Respond with a JSON array of catalyst objects:
[
  {
    "date": "YYYY-MM-DD" (best estimate, use last day of month if only month known),
    "type": "earnings" | "product_launch" | "conference" | "regulatory" | "macro" | "sector" | "analyst" | "other",
    "description": "concise event description",
    "impactHypothesis": "1-2 sentence hypothesis on how this could affect the stock",
    "horizon": "near" (0-14 days) | "mid" (15-45 days) | "long" (46-60 days),
    "category": "thesis" | "macro" | "sector" | "sentiment" | "fundamental",
    "thesisRelevance": true | false
  }
]

Categories:
- "thesis": directly relevant to user's investment thesis
- "macro": Fed meetings, economic data releases, geopolitical events
- "sector": sector-wide events, competitor earnings, regulatory changes
- "sentiment": analyst days, media events, social media catalysts
- "fundamental": earnings, revenue events, product launches, executive changes

Return 5-10 catalysts sorted by date. Be thorough — include macro events (FOMC, jobs reports) that affect this sector.`;

  const userMessage = `Search for upcoming catalysts in the next 60 days for ${ticker} (${companyName}), a ${sector} company. Today is ${today}.
${thesisContext}

Search for:
1. ${companyName} earnings date, product launches, conferences, regulatory filings
2. Macro events (Fed meetings, CPI, jobs reports, GDP) relevant to ${sector}
3. Sector events (competitor earnings, industry conferences, regulatory changes)
4. Analyst events (rating changes, price target updates, investor days)`;

  return { system, userMessage, webSearch: true, maxSearches: 5 };
}
