/**
 * CSV serialization and parsing for holdings import/export.
 *
 * Follows RFC 4180 quoting so free-text fields — thesis text especially, which
 * routinely contains commas, quotes, and line breaks — survive a round trip.
 */

/** Quote a single field if it contains a delimiter, quote, or newline. */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Split CSV text into rows of fields, honoring quoted sections (which may span
 * newlines). A naive `split(',')` corrupts any thesis containing a comma.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM, which spreadsheet exports often prepend.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += char; i++; continue;
    }

    if (char === '"') { inQuotes = true; i++; continue; }
    if (char === ',') { row.push(field); field = ''; i++; continue; }
    if (char === '\r') { i++; continue; }
    if (char === '\n') {
      row.push(field);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = []; field = ''; i++; continue;
    }
    field += char; i++;
  }

  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Column order used when exporting; also the canonical header for imports. */
export const HOLDINGS_CSV_COLUMNS = [
  'ticker',
  'shares',
  'cost_basis',
  'company_name',
  'sector',
  'industry',
  'sector_etf',
  'beta',
  'thesis',
] as const;

export interface ParsedHoldingRow {
  ticker: string;
  shares?: number;
  costBasis?: number;
  companyName?: string;
  sector?: string;
  industry?: string;
  sectorEtf?: string;
  beta?: number;
  thesis?: string;
}

const HEADER_ALIASES: Record<string, keyof ParsedHoldingRow> = {
  ticker: 'ticker',
  symbol: 'ticker',
  shares: 'shares',
  quantity: 'shares',
  qty: 'shares',
  cost_basis: 'costBasis',
  'cost basis': 'costBasis',
  costbasis: 'costBasis',
  price: 'costBasis',
  company_name: 'companyName',
  company: 'companyName',
  name: 'companyName',
  sector: 'sector',
  industry: 'industry',
  sector_etf: 'sectorEtf',
  beta: 'beta',
  thesis: 'thesis',
  notes: 'thesis',
};

const num = (v: string | undefined): number | undefined => {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v.replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
};

const str = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * Parse holdings from CSV.
 *
 * Header-aware when a recognizable header row is present (so exported files
 * round-trip, including thesis text). Falls back to the original positional
 * format — `ticker[,shares][,cost_basis]` — for plain broker exports and bare
 * ticker lists.
 */
export function parseHoldingsCsv(text: string): ParsedHoldingRow[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const firstCells = rows[0].map((c) => c.trim().toLowerCase());
  const looksLikeHeader = firstCells.some((c) => c === 'ticker' || c === 'symbol');

  let columns: (keyof ParsedHoldingRow | null)[];
  let dataRows: string[][];

  if (looksLikeHeader) {
    columns = firstCells.map((c) => HEADER_ALIASES[c] ?? null);
    dataRows = rows.slice(1);
  } else {
    columns = ['ticker', 'shares', 'costBasis'];
    dataRows = rows;
  }

  const out: ParsedHoldingRow[] = [];

  for (const cells of dataRows) {
    const raw: Partial<Record<keyof ParsedHoldingRow, string>> = {};
    for (let i = 0; i < cells.length; i++) {
      const key = columns[i];
      if (key) raw[key] = cells[i];
    }

    const ticker = raw.ticker?.trim().toUpperCase();
    // Skip blanks, stray header rows, and cells that clearly aren't symbols.
    if (!ticker || ticker === 'TICKER' || ticker === 'SYMBOL') continue;
    if (/^\d/.test(ticker) || ticker.length > 10) continue;

    out.push({
      ticker,
      shares: num(raw.shares),
      costBasis: num(raw.costBasis),
      companyName: str(raw.companyName),
      sector: str(raw.sector),
      industry: str(raw.industry),
      sectorEtf: str(raw.sectorEtf),
      beta: num(raw.beta),
      thesis: str(raw.thesis),
    });
  }

  return out;
}
