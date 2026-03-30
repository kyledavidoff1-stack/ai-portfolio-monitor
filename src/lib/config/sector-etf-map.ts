export const SECTOR_ETF_MAP: Record<string, { broad: string; name: string }> = {
  'Technology':              { broad: 'XLK', name: 'Technology Select Sector' },
  'Healthcare':              { broad: 'XLV', name: 'Health Care Select Sector' },
  'Financial Services':      { broad: 'XLF', name: 'Financial Select Sector' },
  'Consumer Cyclical':       { broad: 'XLY', name: 'Consumer Discretionary Select Sector' },
  'Consumer Defensive':      { broad: 'XLP', name: 'Consumer Staples Select Sector' },
  'Energy':                  { broad: 'XLE', name: 'Energy Select Sector' },
  'Industrials':             { broad: 'XLI', name: 'Industrial Select Sector' },
  'Basic Materials':         { broad: 'XLB', name: 'Materials Select Sector' },
  'Real Estate':             { broad: 'XLRE', name: 'Real Estate Select Sector' },
  'Utilities':               { broad: 'XLU', name: 'Utilities Select Sector' },
  'Communication Services':  { broad: 'XLC', name: 'Communication Services Select Sector' },
};

// Optional sub-sector ETFs for more precise comparison
export const INDUSTRY_ETF_MAP: Record<string, string> = {
  'Semiconductors':            'SOXX',
  'Biotechnology':             'XBI',
  'Software - Infrastructure': 'IGV',
  'Banks - Regional':          'KRE',
  'Oil & Gas E&P':             'XOP',
  'Homebuilders':              'XHB',
  'Retail':                    'XRT',
};

export function getSectorEtf(sector: string, industry?: string): string {
  if (industry && INDUSTRY_ETF_MAP[industry]) {
    return INDUSTRY_ETF_MAP[industry];
  }
  return SECTOR_ETF_MAP[sector]?.broad ?? 'SPY';
}
