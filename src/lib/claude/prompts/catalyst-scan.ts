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

  const system = `You are a financial events analyst. Search for all upcoming catalysts in the next 60 days that could actually move the stock price for the given company. Focus on events with real price impact potential.

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

CATALYST QUALITY RULES:
- PRIORITIZE: earnings dates, product launches, regulatory decisions, major partnership or deal announcements, CEO/executive appearances on high-profile platforms (Joe Rogan, CNBC, Bloomberg TV, major keynotes), executive changes, meaningful insider transactions, macro policy deadlines (FOMC, tariff deadlines), and geopolitical events directly relevant to the company.
- DEPRIORITIZE: routine industry conferences and trade shows. Do NOT include generic listings like "Company attending Morgan Stanley Tech Conference" or "Company presenting at JP Morgan Healthcare Conference" UNLESS the company has specifically announced a major keynote, product unveiling, guidance update, or significant new disclosure at that event. A company merely "attending" or "presenting" at a conference is not a catalyst.
- Each catalyst must have a clear, specific hypothesis for why it could move the stock. "Could provide updates" is not specific enough — explain what update and why it matters.

Return 5-10 catalysts sorted by date. Quality over quantity — 5 strong catalysts beats 10 weak ones.`;

  const userMessage = `Search for upcoming catalysts in the next 60 days for ${ticker} (${companyName}), a ${sector} company. Today is ${today}.
${thesisContext}

Search for:
1. ${companyName} earnings date, product launches, regulatory filings, executive changes
2. Macro events (Fed meetings, CPI, jobs reports, GDP, tariff deadlines) relevant to ${sector}
3. Sector events (competitor earnings, regulatory changes, major deals)
4. High-profile CEO/executive appearances (mainstream media, major keynotes — not routine conferences)
5. Insider transaction patterns or upcoming lockup expirations`;

  return { system, userMessage, webSearch: true, maxSearches: 5 };
}
