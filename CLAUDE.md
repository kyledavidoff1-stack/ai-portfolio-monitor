# CLAUDE.md — Project Notes for Claude Code

## Tailwind CSS

**Tailwind config and globals.css are critical — never modify these files.**
Content paths must be: `['./src/**/*.{js,ts,jsx,tsx,mdx}']`

**Never construct Tailwind class names dynamically** (e.g. `` `text-${color}` ``).
Always write full class strings as literals so the JIT scanner can find them.
Lookup tables like `{ width: 'w-28' }` are fine — the string literals are visible to the scanner.

**Stale cache fix:** The `dev` script runs `rm -rf .next && next dev` to clear the
Next.js webpack cache before every start. This prevents stale production-build CSS
from being served instead of a fresh Tailwind compilation. Do not remove the `rm -rf .next` prefix.

## Dev Server

```bash
npm run dev   # clears .next cache, then starts on :3000
npm run build # production build
```

If the server fails to start on :3000 (port in use), kill the old process first:
```bash
kill $(lsof -ti:3000)
```
