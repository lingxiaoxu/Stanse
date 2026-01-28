/**
 * Market Analysis Cache Service
 *
 * Caches the "Today's Analysis" for each user per language to reduce API calls.
 *
 * Storage structure in Firestore:
 * users/{userId}/market_analysis_cache/{language}
 *   - stocks: Array of stock symbols with alignment (e.g., ["CSCO:HIGH", "MCD:LOW", ...])
 *   - analysisText: The generated analysis text
 *   - language: Language code (EN, ZH, JA, FR, ES)
 *   - createdAt: Timestamp
 *   - expiresAt: Timestamp (15 minutes from creation)
 */

import { db } from './firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// Cache validity duration in milliseconds (15 minutes)
const CACHE_VALIDITY_MS = 15 * 60 * 1000;

export interface MarketAnalysisCacheEntry {
  stocks: string[]; // Format: "SYMBOL:ALIGNMENT" (e.g., "CSCO:HIGH", "MCD:LOW")
  analysisText: string;
  language: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface CachedAnalysisResult {
  found: boolean;
  analysisText?: string;
  reason?: string;
}

/**
 * Generate a stock signature for cache comparison
 * Format: "SYMBOL:ALIGNMENT" sorted alphabetically
 * @param stocks - Array of market stocks
 * @returns Sorted array of stock signatures
 */
export const generateStockSignature = (
  stocks: Array<{ symbol: string; alignment: 'HIGH' | 'LOW' }>
): string[] => {
  return stocks
    .map(s => `${s.symbol}:${s.alignment}`)
    .sort();
};

/**
 * Check if cached analysis is valid
 * @param userId - User ID
 * @param language - Language code (EN, ZH, etc.)
 * @param currentStocks - Current stock list to compare
 * @returns Cached analysis if valid, null otherwise
 */
export const getCachedAnalysis = async (
  userId: string,
  language: string,
  currentStocks: Array<{ symbol: string; alignment: 'HIGH' | 'LOW' }>
): Promise<CachedAnalysisResult> => {
  try {
    // Handle empty user or no stocks (new user without persona)
    if (!userId || currentStocks.length === 0) {
      return {
        found: false,
        reason: 'No user or empty stocks (new user without persona)'
      };
    }

    const cacheRef = doc(db, 'users', userId, 'market_analysis_cache', language.toUpperCase());
    const cacheDoc = await getDoc(cacheRef);

    if (!cacheDoc.exists()) {
      return {
        found: false,
        reason: `No cache found for language: ${language}`
      };
    }

    const cache = cacheDoc.data() as MarketAnalysisCacheEntry;
    const now = Date.now();

    // Check if cache has expired (15 minutes)
    const expiresAtMs = cache.expiresAt.toMillis();
    if (now > expiresAtMs) {
      return {
        found: false,
        reason: 'Cache expired (> 15 minutes)'
      };
    }

    // Generate current stock signature
    const currentSignature = generateStockSignature(currentStocks);
    const cachedSignature = cache.stocks;

    // Compare stock lists (must be identical in order and content)
    if (JSON.stringify(currentSignature) !== JSON.stringify(cachedSignature)) {
      return {
        found: false,
        reason: 'Stock list has changed'
      };
    }

    // Cache is valid!
    console.log(`[MarketAnalysisCache] Cache hit for ${language}, returning cached analysis`);
    return {
      found: true,
      analysisText: cache.analysisText
    };

  } catch (error) {
    console.error('[MarketAnalysisCache] Error reading cache:', error);
    return {
      found: false,
      reason: `Error: ${error}`
    };
  }
};

/**
 * Save analysis to cache
 * @param userId - User ID
 * @param language - Language code
 * @param stocks - Current stock list
 * @param analysisText - Generated analysis text
 */
export const saveAnalysisToCache = async (
  userId: string,
  language: string,
  stocks: Array<{ symbol: string; alignment: 'HIGH' | 'LOW' }>,
  analysisText: string
): Promise<void> => {
  try {
    if (!userId || stocks.length === 0) {
      console.log('[MarketAnalysisCache] Skipping cache save - no user or empty stocks');
      return;
    }

    const now = Date.now();
    const cacheRef = doc(db, 'users', userId, 'market_analysis_cache', language.toUpperCase());

    const cacheEntry: MarketAnalysisCacheEntry = {
      stocks: generateStockSignature(stocks),
      analysisText,
      language: language.toUpperCase(),
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + CACHE_VALIDITY_MS)
    };

    await setDoc(cacheRef, cacheEntry);
    console.log(`[MarketAnalysisCache] Saved analysis to cache for ${language}`);

  } catch (error) {
    console.error('[MarketAnalysisCache] Error saving to cache:', error);
    // Don't throw - caching failure shouldn't break the app
  }
};

/**
 * Clear all cached analyses for a user (useful when persona changes)
 * @param userId - User ID
 */
export const clearUserAnalysisCache = async (userId: string): Promise<void> => {
  try {
    const languages = ['EN', 'ZH', 'JA', 'FR', 'ES'];

    for (const lang of languages) {
      const cacheRef = doc(db, 'users', userId, 'market_analysis_cache', lang);
      // We can't delete subcollection docs easily, but we can set them to expired
      await setDoc(cacheRef, {
        stocks: [],
        analysisText: '',
        language: lang,
        createdAt: Timestamp.fromMillis(0),
        expiresAt: Timestamp.fromMillis(0)
      });
    }

    console.log(`[MarketAnalysisCache] Cleared cache for user ${userId}`);
  } catch (error) {
    console.error('[MarketAnalysisCache] Error clearing cache:', error);
  }
};
