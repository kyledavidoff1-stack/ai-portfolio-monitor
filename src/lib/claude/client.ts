// Claude API client wrapper — implemented in Sprint 4
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
