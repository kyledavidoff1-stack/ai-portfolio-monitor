// AI client wrapper.
//
// The pipeline speaks the Anthropic Messages API. The key, model and base URL
// are resolved from the Settings page first and the environment second, so a
// user can point this at their own account, a self-hosted gateway, or any proxy
// that implements the same API shape without editing files.
import Anthropic from '@anthropic-ai/sdk';
import { getSetting, getAiModel } from '@/lib/config/settings';

let _client: Anthropic | null = null;
let _clientKey = ''; // identity of the config the cached client was built from

export function getClaudeClient(): Anthropic {
  const apiKey = getSetting('AI_API_KEY');
  const baseURL = getSetting('AI_BASE_URL');
  if (!apiKey) {
    throw new Error(
      'No AI API key configured. Add one on the Settings page, or set CLAUDE_API_KEY in .env.local',
    );
  }

  // Rebuild when the configuration changes so a key saved in Settings takes
  // effect immediately rather than after a restart.
  const identity = `${apiKey}::${baseURL ?? ''}`;
  if (!_client || _clientKey !== identity) {
    _client = new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });
    _clientKey = identity;
  }
  return _client;
}

/** Model for pipeline calls. Read per call so a Settings change applies at once. */
export function getModel(): string {
  return getAiModel();
}

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
        model: getModel(),
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
              model: getModel(),
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
