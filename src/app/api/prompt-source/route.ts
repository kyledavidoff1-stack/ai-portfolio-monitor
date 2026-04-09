/**
 * GET  /api/prompt-source?step=news
 * Reads raw template literals (system + userMessage) from the prompt source file.
 *
 * POST /api/prompt-source
 * Saves edited system prompt and user message template back to the source file.
 * Body: { step: string, systemPrompt: string, userMessageTemplate?: string }
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const STEP_FILES: Record<string, string> = {
  news: 'news-sentiment.ts',
  fundamentals: 'fundamental-analysis.ts',
  sector: 'sector-relative.ts',
  bucket: 'bucket-assignment.ts',
  thesis: 'thesis-check.ts',
  catalysts: 'catalyst-scan.ts',
  regime: 'regime-check.ts',
  anomaly: 'anomaly-detection.ts',
};

/**
 * Finds a template literal assigned to `const <varName> = \`...\``
 * and returns the positions of the opening and closing backticks.
 * Properly handles escaped characters and ${...} expressions (including nested braces).
 */
function findTemplateLiteral(
  source: string,
  varName: string,
): { start: number; end: number; content: string } | null {
  const pattern = new RegExp(`const\\s+${varName}\\s*=\\s*\``);
  const match = source.match(pattern);
  if (!match || match.index === undefined) return null;

  const backtickStart = match.index + match[0].length - 1;
  let i = backtickStart + 1;
  let depth = 0;

  while (i < source.length) {
    // Skip escape sequences
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    // Enter ${...} expression
    if (source[i] === '$' && i + 1 < source.length && source[i + 1] === '{') {
      depth++;
      i += 2;
      continue;
    }
    // Track nested braces inside ${...}
    if (depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
      continue;
    }
    // Found closing backtick at depth 0
    if (source[i] === '`') {
      return {
        start: backtickStart,
        end: i,
        content: source.slice(backtickStart + 1, i),
      };
    }
    i++;
  }

  return null;
}

function resolveFilePath(step: string): { filePath: string; filename: string } | null {
  const filename = STEP_FILES[step];
  if (!filename) return null;
  return { filePath: path.join(process.cwd(), 'src/lib/claude/prompts', filename), filename };
}

// ── GET: read raw template literals from source ─────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const step = searchParams.get('step');

    if (!step) {
      return Response.json({ error: 'Missing step query parameter' }, { status: 400 });
    }

    const resolved = resolveFilePath(step);
    if (!resolved) {
      return Response.json(
        { error: `Invalid step "${step}". Valid: ${Object.keys(STEP_FILES).join(', ')}` },
        { status: 400 },
      );
    }

    const source = await readFile(resolved.filePath, 'utf-8');

    const systemLiteral = findTemplateLiteral(source, 'system');
    const userMessageLiteral = findTemplateLiteral(source, 'userMessage');

    return Response.json({
      system: systemLiteral?.content ?? null,
      userMessage: userMessageLiteral?.content ?? null,
      file: `src/lib/claude/prompts/${resolved.filename}`,
    });
  } catch (err) {
    console.error('[prompt-source GET]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to read source' },
      { status: 500 },
    );
  }
}

// ── POST: save edited templates back to source ──────────────────────────────

export async function POST(request: Request) {
  try {
    const { step, systemPrompt, userMessageTemplate } = await request.json();

    if (!step || typeof step !== 'string') {
      return Response.json({ error: 'Missing step parameter' }, { status: 400 });
    }

    const resolved = resolveFilePath(step);
    if (!resolved) {
      return Response.json(
        { error: `Invalid step "${step}". Valid: ${Object.keys(STEP_FILES).join(', ')}` },
        { status: 400 },
      );
    }

    if (!systemPrompt && !userMessageTemplate) {
      return Response.json({ error: 'Nothing to save — provide systemPrompt and/or userMessageTemplate' }, { status: 400 });
    }

    let source = await readFile(resolved.filePath, 'utf-8');
    const saved: string[] = [];

    // Replace system prompt template literal
    if (systemPrompt && typeof systemPrompt === 'string') {
      const found = findTemplateLiteral(source, 'system');
      if (!found) {
        return Response.json(
          { error: `Could not locate "const system = \`...\`" in ${resolved.filename}` },
          { status: 500 },
        );
      }
      source = source.slice(0, found.start + 1) + systemPrompt + source.slice(found.end);
      saved.push('system');
    }

    // Replace userMessage template literal
    if (userMessageTemplate && typeof userMessageTemplate === 'string') {
      const found = findTemplateLiteral(source, 'userMessage');
      if (!found) {
        return Response.json(
          { error: `Could not locate "const userMessage = \`...\`" in ${resolved.filename}` },
          { status: 500 },
        );
      }
      source = source.slice(0, found.start + 1) + userMessageTemplate + source.slice(found.end);
      saved.push('userMessage');
    }

    await writeFile(resolved.filePath, source, 'utf-8');

    const relPath = `src/lib/claude/prompts/${resolved.filename}`;
    return Response.json({ success: true, file: relPath, saved });
  } catch (err) {
    console.error('[prompt-source POST]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 500 },
    );
  }
}
