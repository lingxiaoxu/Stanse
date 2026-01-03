/**
 * SP500 Companies Data - Single Source of Truth
 *
 * This module loads SP500 company data from sp500Data.json to ensure
 * consistency across the entire codebase.
 *
 * IMPORTANT: Do NOT hardcode company lists. Always import from this file.
 *
 * Author: Claude Code
 * Date: 2026-01-02
 */

import sp500Data from './sp500Data.json';

export interface SP500Company {
  symbol: string;
  name: string;
  sector: string;
}

// ============================================================================
// EXPORTED CONSTANTS - Loaded from sp500Data.json
// ============================================================================

// List of all S&P 500 companies
export const SP500_COMPANIES: SP500Company[] = sp500Data.companies;

// List of all ticker symbols (for backward compatibility)
export const SP500_TICKERS: string[] = SP500_COMPANIES.map(c => c.symbol);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the sector for a given ticker symbol
 */
export const getSectorByTicker = (ticker: string): string | null => {
  const company = SP500_COMPANIES.find(c => c.symbol === ticker);
  return company?.sector || null;
};

/**
 * Get the company name for a given ticker symbol
 */
export const getNameByTicker = (ticker: string): string | null => {
  const company = SP500_COMPANIES.find(c => c.symbol === ticker);
  return company?.name || null;
};

/**
 * Get complete company information for a given ticker
 */
export const getCompanyByTicker = (ticker: string): SP500Company | null => {
  return SP500_COMPANIES.find(c => c.symbol === ticker) || null;
};

/**
 * Get all unique sectors
 */
export const getAllSectors = (): string[] => {
  return Array.from(new Set(SP500_COMPANIES.map(c => c.sector)));
};

/**
 * Get all companies in a specific sector
 */
export const getCompaniesBySector = (sector: string): SP500Company[] => {
  return SP500_COMPANIES.filter(c => c.sector === sector);
};

/**
 * Check if a ticker symbol is valid
 */
export const isValidTicker = (ticker: string): boolean => {
  return SP500_COMPANIES.some(c => c.symbol === ticker);
};

// Define stance types based on political coordinates
// Each stance type is a combination of the three dimensions
export type StanceType =
  | 'progressive-globalist'      // Economic Left, Social Lib, Diplomatic Global
  | 'progressive-nationalist'    // Economic Left, Social Lib, Diplomatic National
  | 'socialist-libertarian'      // Economic Left, Social Auth, Diplomatic Global
  | 'socialist-nationalist'      // Economic Left, Social Auth, Diplomatic National
  | 'capitalist-globalist'       // Economic Right, Social Lib, Diplomatic Global
  | 'capitalist-nationalist'     // Economic Right, Social Lib, Diplomatic National (MAGA)
  | 'conservative-globalist'     // Economic Right, Social Auth, Diplomatic Global
  | 'conservative-nationalist';  // Economic Right, Social Auth, Diplomatic National

export const STANCE_TYPES: { type: StanceType; label: string; description: string }[] = [
  {
    type: 'progressive-globalist',
    label: 'Progressive Globalist',
    description: 'Left economics, progressive social values, international cooperation'
  },
  {
    type: 'progressive-nationalist',
    label: 'Progressive Patriot',
    description: 'Left economics, progressive social values, national focus'
  },
  {
    type: 'socialist-libertarian',
    label: 'Social Democrat',
    description: 'Left economics, traditional values, international cooperation'
  },
  {
    type: 'socialist-nationalist',
    label: 'National Socialist',
    description: 'Left economics, traditional values, national focus'
  },
  {
    type: 'capitalist-globalist',
    label: 'Liberal Capitalist',
    description: 'Free market, progressive social values, international cooperation'
  },
  {
    type: 'capitalist-nationalist',
    label: 'America First',
    description: 'Free market, progressive social values, national focus'
  },
  {
    type: 'conservative-globalist',
    label: 'Neoconservative',
    description: 'Free market, traditional values, international cooperation'
  },
  {
    type: 'conservative-nationalist',
    label: 'Paleoconservative',
    description: 'Free market, traditional values, national focus'
  }
];

// Helper function to determine stance type from coordinates
export const getStanceType = (economic: number, social: number, diplomatic: number): StanceType => {
  const isLeftEcon = economic < 0;
  const isLibSocial = social > 0;
  const isGlobalDiplo = diplomatic > 0;

  if (isLeftEcon && isLibSocial && isGlobalDiplo) return 'progressive-globalist';
  if (isLeftEcon && isLibSocial && !isGlobalDiplo) return 'progressive-nationalist';
  if (isLeftEcon && !isLibSocial && isGlobalDiplo) return 'socialist-libertarian';
  if (isLeftEcon && !isLibSocial && !isGlobalDiplo) return 'socialist-nationalist';
  if (!isLeftEcon && isLibSocial && isGlobalDiplo) return 'capitalist-globalist';
  if (!isLeftEcon && isLibSocial && !isGlobalDiplo) return 'capitalist-nationalist';
  if (!isLeftEcon && !isLibSocial && isGlobalDiplo) return 'conservative-globalist';
  return 'conservative-nationalist';
};
