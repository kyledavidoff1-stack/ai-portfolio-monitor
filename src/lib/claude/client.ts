// Claude API client wrapper
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/config/constants';

let _client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error('CLAUDE_API_KEY is not set. Add it to .env.local');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export { CLAUDE_MODEL };

// ── callClaude<T> — main wrapper for all AI pipeline calls ────────────────────

export interface CallClaudeOptions {
  system: string;
  userMessage: string;
  webSearch?: boolean;
  maxSearches?: number;
  maxTokens?: number;
}

const GLOBAL_SYSTEM_PREFIX = `Be extremely concise. Every output should be scannable in under 5 seconds. Use short punchy phrases rather than full paragraphs. Full sentences are acceptable when needed to explain something nuanced, but default to brevity. No filler words. No hedging language. No "it is worth noting" or "it should be mentioned." Get to the point immediately. The user is a busy investor checking their portfolio, not reading a research report.`;

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 4000, 16000];

/**
 * Extract JSON from Claude's text response blocks.
 * Concatenates all text blocks, then finds the first JSON object or array.
 */
function extractJSON(text: string): unknown {
  // Try to find a JSON code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }
  // Find the first { or [ and match to its closing bracket
  const start = text.search(/[{\[]/);
  if (start === -1) throw new Error('No JSON found in response');
  const openChar = text[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) depth--;
    if (depth === 0) {
      return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('Unterminated JSON in response');
}

export async function callClaude<T>(options: CallClaudeOptions): Promise<T> {
  const client = getClaudeClient();
  const {
    system,
    userMessage,
    webSearch = false,
    maxSearches = 5,
    maxTokens = 4096,
  } = options;

  // Build tools array — web search tool uses a server-tool shape, not the standard Tool type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [];
  if (webSearch) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: maxSearches,
    });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: `${GLOBAL_SYSTEM_PREFIX}\n\n${system}`,
        messages: [{ role: 'user', content: userMessage }],
        ...(tools.length > 0 ? { tools } : {}),
      });

      // Concatenate all text blocks
      const textParts: string[] = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        }
      }
      const fullText = textParts.join('\n');

      try {
        return extractJSON(fullText) as T;
      } catch (parseErr) {
        // On parse failure, try a follow-up to fix the JSON
        if (attempt < MAX_RETRIES - 1) {
          console.warn(`[Claude] JSON parse failed on attempt ${attempt + 1}, retrying with fix prompt`);
          try {
            const fixResponse = await client.messages.create({
              model: CLAUDE_MODEL,
              max_tokens: maxTokens,
              system: 'You previously produced invalid JSON. Return ONLY the corrected JSON, no explanation.',
              messages: [
                { role: 'user', content: `Fix this JSON and return only valid JSON:\n\n${fullText.slice(0, 8000)}` },
              ],
            });
            const fixText = fixResponse.content
              .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
              .map((b) => b.text)
              .join('\n');
            return extractJSON(fixText) as T;
          } catch {
            // Fix attempt failed, continue to next retry
          }
        }
        lastError = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRateLimit = lastError.message.includes('rate_limit') || lastError.message.includes('429');
      const isOverloaded = lastError.message.includes('overloaded') || lastError.message.includes('529');
      if (!isRateLimit && !isOverloaded && attempt >= 1) {
        // Non-transient error after first retry — bail
        throw lastError;
      }
    }

    // Wait before retrying
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }

  throw lastError ?? new Error('callClaude failed after retries');
}
