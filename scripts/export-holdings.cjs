/**
 * Export holdings straight from the database to CSV — no server required.
 *
 *   npm run export:holdings                 # → ./my-holdings.csv
 *   npm run export:holdings -- out.csv      # → ./out.csv
 *
 * Same format the app's Export CSV button produces, and the same format the
 * CSV importer reads back, so this doubles as a backup you can restore.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_URL ?? path.join(__dirname, '..', 'data', 'portfolio.db');
const OUT_PATH = process.argv[2] ?? path.join(process.cwd(), 'my-holdings.csv');

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}.\nRun "npm run db:push" first, or set DATABASE_URL.`);
  process.exit(1);
}

const COLUMNS = [
  'ticker', 'shares', 'cost_basis', 'company_name',
  'sector', 'industry', 'sector_etf', 'beta', 'thesis',
];

/** RFC 4180: quote any field containing a delimiter, quote, or newline. */
function escape(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const db = new Database(DB_PATH, { readonly: true });

let rows;
try {
  rows = db.prepare(`SELECT ${COLUMNS.join(', ')} FROM holdings ORDER BY ticker`).all();
} catch (err) {
  console.error(`Could not read holdings from ${DB_PATH}: ${err.message}`);
  process.exit(1);
}

if (rows.length === 0) {
  console.error(`No holdings found in ${DB_PATH} — nothing to export.`);
  process.exit(1);
}

const csv = [
  COLUMNS.join(','),
  ...rows.map((r) => COLUMNS.map((c) => escape(r[c])).join(',')),
].join('\n') + '\n';

fs.writeFileSync(OUT_PATH, csv);

const withThesis = rows.filter((r) => r.thesis && r.thesis.trim()).length;
console.log(
  `Exported ${rows.length} holding${rows.length === 1 ? '' : 's'} (${withThesis} with a thesis) to:\n` +
  `  ${OUT_PATH}\n\n` +
  `Restore with Add ticker › Upload CSV, or seed from it:\n` +
  `  HOLDINGS_CSV=${OUT_PATH} npm run seed:demo`,
);
