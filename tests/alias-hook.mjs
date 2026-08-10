/**
 * Module resolution hook for the test runner.
 *
 * Next.js resolves the "@/..." path alias via tsconfig, but plain Node does
 * not, so tests loading source modules directly need this. It also appends
 * ".ts" to extensionless relative imports, which TypeScript source uses.
 */
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = path.join(SRC, specifier.slice(2));
    const target = existsSync(base) ? base
      : existsSync(`${base}.ts`) ? `${base}.ts`
      : `${base}.tsx`;
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }

  if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL) {
    const parentDir = path.dirname(new URL(context.parentURL).pathname);
    const base = path.resolve(parentDir, specifier);
    if (existsSync(`${base}.ts`)) {
      return { url: pathToFileURL(`${base}.ts`).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
