/**
 * Holdings CSV round-trip.
 *
 * This path is a user's backup of hand-written thesis text — free prose full of
 * commas, quotes, and line breaks. A naive split(',') silently corrupts it, so
 * the quoting rules are worth pinning down.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHoldingsCsv, toCsvRow, escapeCsvField, HOLDINGS_CSV_COLUMNS } from '@/lib/csv';

test('plain values are written unquoted', () => {
  assert.equal(escapeCsvField('NVDA'), 'NVDA');
  assert.equal(escapeCsvField(42), '42');
});

test('null and undefined become empty cells, not the strings "null"/"undefined"', () => {
  assert.equal(escapeCsvField(null), '');
  assert.equal(escapeCsvField(undefined), '');
});

test('fields containing commas, quotes, or newlines are quoted and escaped', () => {
  assert.equal(escapeCsvField('Amazon.com, Inc.'), '"Amazon.com, Inc."');
  assert.equal(escapeCsvField('he said "buy"'), '"he said ""buy"""');
  assert.equal(escapeCsvField('line one\nline two'), '"line one\nline two"');
});

test('a header row maps columns by name, in any order', () => {
  const csv = 'thesis,ticker,shares\nAI capex,NVDA,40\n';
  assert.deepEqual(parseHoldingsCsv(csv), [
    { ticker: 'NVDA', shares: 40, costBasis: undefined, companyName: undefined,
      sector: undefined, industry: undefined, sectorEtf: undefined, beta: undefined, thesis: 'AI capex' },
  ]);
});

test('headerless files keep the original positional format', () => {
  const rows = parseHoldingsCsv('NVDA,40,61.2\nMSFT,25,310\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ticker, 'NVDA');
  assert.equal(rows[0].shares, 40);
  assert.equal(rows[0].costBasis, 61.2);
});

test('a bare ticker list still imports', () => {
  assert.deepEqual(parseHoldingsCsv('NVDA\nMSFT\n').map((r) => r.ticker), ['NVDA', 'MSFT']);
});

test('common broker header spellings are recognized', () => {
  const rows = parseHoldingsCsv('Symbol,Quantity,Cost Basis\nnvda,40,61.2\n');
  assert.equal(rows[0].ticker, 'NVDA');
  assert.equal(rows[0].shares, 40);
  assert.equal(rows[0].costBasis, 61.2);
});

test('currency symbols and thousands separators parse as numbers', () => {
  const rows = parseHoldingsCsv('ticker,shares,cost_basis\nBRK.B,1,"$5,432.10"\n');
  assert.equal(rows[0].costBasis, 5432.10);
});

test('blank lines and stray header repeats are skipped', () => {
  const rows = parseHoldingsCsv('ticker,shares\nNVDA,40\n\nticker,shares\nMSFT,25\n');
  assert.deepEqual(rows.map((r) => r.ticker), ['NVDA', 'MSFT']);
});

test('non-ticker junk rows are dropped', () => {
  const rows = parseHoldingsCsv('ticker,shares\n123456,10\nVERYLONGSYMBOL,5\nNVDA,40\n');
  assert.deepEqual(rows.map((r) => r.ticker), ['NVDA']);
});

test('a full export round-trips, preserving prose thesis text', () => {
  const thesis = 'Margins re-rate, ads mix in; AWS re-accelerates. He said "buy",\nand the FCF inflection is underappreciated.';
  const csv = [
    toCsvRow([...HOLDINGS_CSV_COLUMNS]),
    toCsvRow(['AMZN', 30, 135, 'Amazon.com, Inc.', 'Consumer Cyclical', 'Internet Retail', 'XLY', 1.18, thesis]),
  ].join('\n');

  const [row] = parseHoldingsCsv(csv);
  assert.equal(row.ticker, 'AMZN');
  assert.equal(row.shares, 30);
  assert.equal(row.costBasis, 135);
  assert.equal(row.companyName, 'Amazon.com, Inc.');
  assert.equal(row.sectorEtf, 'XLY');
  assert.equal(row.beta, 1.18);
  assert.equal(row.thesis, thesis);
});

test('holdings without shares or thesis round-trip as empty, not zero', () => {
  const csv = [
    toCsvRow([...HOLDINGS_CSV_COLUMNS]),
    toCsvRow(['XOM', null, null, 'Exxon Mobil Corporation', 'Energy', null, 'XLE', null, null]),
  ].join('\n');

  const [row] = parseHoldingsCsv(csv);
  assert.equal(row.shares, undefined);
  assert.equal(row.costBasis, undefined);
  assert.equal(row.thesis, undefined);
  assert.equal(row.sectorEtf, 'XLE');
});

test('a UTF-8 BOM from spreadsheet exports does not corrupt the first header', () => {
  const rows = parseHoldingsCsv('﻿ticker,shares\nNVDA,40\n');
  assert.equal(rows[0]?.ticker, 'NVDA');
});
