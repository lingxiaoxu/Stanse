/**
 * FEC (Federal Election Commission) Political Donation Data Service
 *
 * Queries Firestore for company political contribution data.
 * Uses Gemini AI to intelligently identify company name variants.
 * Aggregates data across all variants for comprehensive results.
 *
 * Data structure:
 * - fec_company_index: Company → normalized_name mapping (3700+ companies)
 * - fec_company_consolidated: Unified collection merging linkage + PAC transfer data
 * - fec_company_party_summary: (Legacy) Linkage-based donations by company/year/party
 * - fec_company_pac_transfers_summary: (Legacy) PAC transfer donations
 */

import { collection, doc, getDoc, query, where, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini AI for company name variant detection
const getBaseUrl = () => {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return `${window.location.origin}/api/gemini`;
};

const baseUrl = getBaseUrl();
// Get API key from environment variables - same pattern as geminiService.ts
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: baseUrl ? { baseUrl } : undefined
});

export interface FECPartyData {
  total_amount: number;        // In cents
  total_amount_usd: number;    // In dollars
  contribution_count: number;
  percentage: number;          // 0-100
}

export interface FECCompanyData {
  display_name: string;
  normalized_name: string;
  total_contributed: number;   // Total in cents
  total_usd: number;          // Total in dollars
  party_totals: Record<string, FECPartyData>;
  years: number[];
  data_source: string;         // 'firestore'
  variants_found?: string[];   // List of all company variants that were aggregated
  queried_year?: number;       // If filtered by year, which year was queried
}

/**
 * Normalizes company name following the same logic as Python scripts
 * See: scripts/fec-data/production/06-build-indexes.py
 */
function normalizeCompanyName(name: string): string {
  if (!name) return '';

  let normalized = name.toLowerCase().trim();

  // Remove common suffixes
  const suffixes = [
    'corporation', 'corp', 'inc', 'incorporated', 'company', 'co',
    'llc', 'lp', 'ltd', 'limited', 'political action committee', 'pac'
  ];

  for (const suffix of suffixes) {
    const regex = new RegExp(`\\b${suffix}\\b\\.?`, 'gi');
    normalized = normalized.replace(regex, '');
  }

  // Remove punctuation and extra spaces
  normalized = normalized.replace(/[^\w\s]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Find the canonical company record that contains this variant
 * Returns the canonical name and its full variant list
 */
async function findCanonicalRecord(searchName: string): Promise<{
  canonical: string;
  variants: string[];
  needsAIUpdate: boolean;
} | null> {
  try {
    const searchUpper = searchName.toUpperCase().trim();
    const searchLower = searchName.toLowerCase().trim();

    // Try multiple case variations for direct lookup
    const casesToTry = [searchName.trim(), searchUpper, searchLower];

    for (const caseVariant of casesToTry) {
      const directRef = doc(db, 'fec_company_name_variants', caseVariant);
      const directSnap = await getDoc(directRef);

      if (directSnap.exists()) {
        const data = directSnap.data();
        const needsUpdate = !data.ai_updated || data.ai_updated === false;
        console.log(`[FEC] Found canonical record "${directSnap.id}" by direct lookup (case: ${caseVariant}, needs AI update: ${needsUpdate})`);
        return {
          canonical: directSnap.id,
          variants: data.variants || [],
          needsAIUpdate: needsUpdate
        };
      }
    }

    // If not found, search through all records (fallback for variants)
    // Note: This is slow but necessary for finding records where searchName is a variant
    console.log(`[FEC] Direct lookup failed, searching all variant records for "${searchName}"...`);
    const variantsCollection = collection(db, 'fec_company_name_variants');
    const snapshot = await getDocs(variantsCollection);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const variants = data.variants || [];

      // Check if searchName matches any variant (case-insensitive)
      // Variants can be strings or objects with variant_name_lower field
      const matchFound = variants.some((v: any) => {
        const variantStr = typeof v === 'string' ? v : v.variant_name_lower || '';
        return variantStr.toUpperCase().trim() === searchUpper;
      });

      if (matchFound) {
        const needsUpdate = !data.ai_updated || data.ai_updated === false;
        console.log(`[FEC] Found canonical record "${docSnap.id}" for variant "${searchName}" (needs AI update: ${needsUpdate})`);
        return {
          canonical: docSnap.id,
          variants: variants,
          needsAIUpdate: needsUpdate
        };
      }
    }

    console.log(`[FEC] No canonical record found for "${searchName}"`);
    return null;
  } catch (error) {
    console.error('[FEC] Error searching for canonical record:', error);
    return null;
  }
}

/**
 * Use Gemini AI to generate company name variants with smart caching
 * Returns a list of possible company name variations
 */
async function generateCompanyVariants(companyName: string): Promise<string[]> {
  try {
    const canonicalName = companyName.toUpperCase().trim();

    // Step 1: Check if this name is a variant of an existing record
    const existingRecord = await findCanonicalRecord(companyName);

    if (existingRecord) {
      // Found an existing record
      if (existingRecord.needsAIUpdate) {
        // First time search for this company - call AI to enhance variants
        console.log(`[FEC] First search for "${companyName}", calling AI to enhance variants...`);

        const aiVariants = await callGeminiForVariants(companyName);

        // Merge AI variants with existing variants (remove duplicates)
        // Variants can be strings or objects
        const existingSet = new Set(
          existingRecord.variants.map((v: any) => {
            const variantStr = typeof v === 'string' ? v : v.variant_name_lower || '';
            return variantStr.toUpperCase().trim();
          })
        );
        const newVariants: string[] = [];

        for (const variant of aiVariants) {
          const variantUpper = variant.toUpperCase().trim();
          if (!existingSet.has(variantUpper)) {
            newVariants.push(variant);
          }
        }

        if (newVariants.length > 0) {
          console.log(`[FEC] Adding ${newVariants.length} new variants to "${existingRecord.canonical}"`);
          const mergedVariants = [...existingRecord.variants, ...newVariants];

          // Update Firestore with merged variants
          const variantsRef = doc(db, 'fec_company_name_variants', existingRecord.canonical);
          await updateDoc(variantsRef, {
            variants: mergedVariants,
            variant_count: mergedVariants.length,
            last_updated: new Date(),
            ai_updated: true
          });

          return mergedVariants;
        } else {
          console.log(`[FEC] No new variants found, marking as AI-updated`);
          // Mark as AI-updated even if no new variants
          const variantsRef = doc(db, 'fec_company_name_variants', existingRecord.canonical);
          await updateDoc(variantsRef, {
            last_updated: new Date(),
            ai_updated: true
          });
          return existingRecord.variants;
        }
      } else {
        // Second+ time search - use cached variants
        console.log(`[FEC] Using ${existingRecord.variants.length} cached variants for "${companyName}"`);
        return existingRecord.variants;
      }
    }

    // Step 2: No existing record - create new one with AI
    console.log(`[FEC] No record found for "${companyName}", creating new with AI...`);
    const aiVariants = await callGeminiForVariants(companyName);

    // Save new record to Firestore
    const variantsRef = doc(db, 'fec_company_name_variants', canonicalName);
    const now = new Date();
    await setDoc(variantsRef, {
      canonical_name: canonicalName,
      display_name: companyName,
      variants: aiVariants,
      original_names: aiVariants,
      variant_count: aiVariants.length,
      created_at: now,
      last_updated: now,
      ai_updated: true,
      is_verified: false,
      industry: null,
      stock_ticker: null,
      committee_count: 0,
      committee_ids: []
    });
    console.log(`[FEC] Created new record with ${aiVariants.length} variants for "${companyName}"`);

    return aiVariants;
  } catch (error) {
    console.error('[FEC] Error generating variants with AI:', error);
    return [companyName];
  }
}

/**
 * Call Gemini AI to generate company name variants
 */
async function callGeminiForVariants(companyName: string): Promise<string[]> {
  try {
    const prompt = `Given the company name "${companyName}", list ALL possible name variants, abbreviations, and related entities that might be used in Federal Election Commission (FEC) records for political donations. Include:
- Official legal names (e.g., "JPMorgan Chase & Co.")
- Common short names (e.g., "JPMorgan", "Chase")
- Stock tickers (e.g., "JPM")
- Subsidiaries and divisions (e.g., "JPMorgan Asset Management", "Chase Bank")
- Historical names
- Alternative spellings

Return ONLY a JSON array of strings, like this:
["variant1", "variant2", "variant3"]

Do not include any other text, explanations, or markdown formatting.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const response = result.text?.trim() || '';

    // Extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[FEC] Failed to extract JSON from AI response');
      return [companyName];
    }

    const aiVariants = JSON.parse(jsonMatch[0]) as string[];
    console.log(`[FEC] AI generated ${aiVariants.length} variants for "${companyName}":`, aiVariants);

    return aiVariants;
  } catch (error) {
    console.error('[FEC] Error calling Gemini API:', error);
    return [companyName];
  }
}

/**
 * Use AI to validate if a matched company is actually related to the original search
 * This helps filter out false positives from fuzzy matching
 */
async function isCompanyRelevant(originalSearch: string, matchedCompany: string): Promise<boolean> {
  try {
    const prompt = `You are helping to validate if two company names refer to the same company or related entities.

Original search: "${originalSearch}"
Matched company: "${matchedCompany}"

Question: Are these two companies the same company, or is the matched company a subsidiary, division, or closely related entity of the original search company?

Answer ONLY with "YES" or "NO". Do not include any other text or explanation.

Examples:
- "Microsoft" and "MICROSOFT CORPORATION" → YES
- "JPMorgan" and "CHASE BANK" → YES (Chase is a division of JPMorgan)
- "Google" and "ALPHABET INC" → YES (Alphabet is Google's parent company)
- "Microsoft" and "BURGER KING" → NO (completely unrelated companies)
- "King" and "BURGER KING" → NO (unless the user is specifically searching for Burger King)`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const response = result.text?.trim().toUpperCase() || '';
    const isRelevant = response.includes('YES');

    console.log(`[FEC] AI relevance check: "${originalSearch}" → "${matchedCompany}" = ${isRelevant ? 'RELEVANT' : 'NOT RELEVANT'}`);

    return isRelevant;
  } catch (error) {
    console.error('[FEC] Error calling AI for relevance check:', error);
    // On error, default to allowing the match
    return true;
  }
}

/**
 * Query FEC data for a single normalized company name
 * @param normalized - The normalized company name to search for
 * @param originalSearch - The original user search query (for AI relevance validation)
 * @param year - Optional year filter (e.g., 2024, 2022, 2020)
 */
async function querySingleCompany(normalized: string, originalSearch?: string, year?: number): Promise<{
  normalized: string;
  display_name: string;
  data: any[];
} | null> {
  try {
    console.log(`[FEC] Querying fec_company_index for normalized name: "${normalized}"${year ? ` (year: ${year})` : ' (all years)'}`);

    // Check company index
    const companyIndexRef = doc(db, 'fec_company_index', normalized);
    const companyIndexSnap = await getDoc(companyIndexRef);

    if (!companyIndexSnap.exists()) {
      console.log(`[FEC] No exact match found for "${normalized}", trying fuzzy match...`);

      // Try fuzzy match: search for companies where normalized name contains this term
      // or this term is in the search_keywords
      const indexCollection = collection(db, 'fec_company_index');
      const allDocs = await getDocs(indexCollection);

      // Find companies that might match
      let bestMatch = null;
      let bestMatchScore = 0;
      let bestMatchDisplayName = '';

      for (const docSnap of allDocs.docs) {
        const data = docSnap.data();
        const docNormalized = docSnap.id;
        const keywords = data.search_keywords || [];

        // Calculate match score
        let score = 0;

        // Only consider matches where the search term is meaningful (>= 3 chars)
        if (normalized.length < 3 && docNormalized.length < 3) {
          continue; // Skip very short terms to avoid false matches
        }

        // Check if the search term is contained in the normalized name
        // But require the search term to be at least 50% of the length
        if (docNormalized.includes(normalized) && normalized.length >= docNormalized.length * 0.3) {
          score = 10;
        }

        // Check if normalized name is contained in search term (reverse match)
        // Require substantial overlap
        if (normalized.includes(docNormalized) && docNormalized.length >= normalized.length * 0.3) {
          score = Math.max(score, 8);
        }

        // Check if any keyword matches
        for (const keyword of keywords) {
          if (keyword === normalized) {
            score = Math.max(score, 15); // Exact keyword match is best
          } else if (keyword.length >= 3 && (keyword.includes(normalized) || normalized.includes(keyword))) {
            // Require substantial overlap for partial matches
            const overlapRatio = Math.min(normalized.length, keyword.length) / Math.max(normalized.length, keyword.length);
            if (overlapRatio >= 0.4) {
              score = Math.max(score, 5);
            }
          }
        }

        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = docSnap.id;
          bestMatchDisplayName = data.company_name || docSnap.id;
        }
      }

      if (bestMatch && bestMatchScore >= 10) {
        console.log(`[FEC] Found fuzzy match: "${normalized}" → "${bestMatch}" (score: ${bestMatchScore})`);

        // Use AI to validate if this fuzzy match is actually relevant
        const searchTerm = originalSearch || normalized;
        const isRelevant = await isCompanyRelevant(searchTerm, bestMatchDisplayName);

        if (!isRelevant) {
          console.log(`[FEC] AI rejected fuzzy match as not relevant`);
          return null;
        }

        // Recursively query with the matched normalized name
        return querySingleCompany(bestMatch, originalSearch, year);
      }

      console.log(`[FEC] No fuzzy match found for "${normalized}"`);
      return null;
    }

    console.log(`[FEC] Found company in index: "${normalized}"`);

    const companyData = companyIndexSnap.data();
    const displayName = companyData.company_name;

    // Query consolidated summary - filter by year if specified
    // Use fec_company_consolidated which merges linkage + PAC transfer data
    console.log(`[FEC] Querying fec_company_consolidated for normalized name: "${normalized}"${year ? ` (year: ${year})` : ''}`);
    const summariesRef = collection(db, 'fec_company_consolidated');
    const q = year
      ? query(summariesRef,
          where('normalized_name', '==', normalized),
          where('data_year', '==', year))
      : query(summariesRef, where('normalized_name', '==', normalized));
    const summariesSnap = await getDocs(q);

    if (summariesSnap.empty) {
      console.log(`[FEC] No consolidated data found for "${normalized}"`);
      return null;
    }

    console.log(`[FEC] Found ${summariesSnap.size} consolidated records for "${normalized}"`);

    const data: any[] = [];
    summariesSnap.forEach((doc) => {
      data.push(doc.data());
    });

    return { normalized, display_name: displayName, data };
  } catch (error) {
    console.error(`[FEC] Error querying company "${normalized}":`, error);
    return null;
  }
}

/**
 * Aggregate FEC data from multiple company variants
 */
function aggregateVariantData(variantResults: Array<{
  normalized: string;
  display_name: string;
  data: any[];
}>, queriedYear?: number): FECCompanyData {
  // Use the first variant's display name as the primary name
  const primaryDisplayName = variantResults[0].display_name;

  // Collect all party data across all variants
  const partyTotals: Record<string, FECPartyData> = {};
  let totalContributed = 0;
  const years: number[] = [];
  const variantsFound: string[] = [];

  for (const variant of variantResults) {
    variantsFound.push(variant.normalized);

    for (const summary of variant.data) {
      const year = summary.data_year;
      if (year && !years.includes(year)) {
        years.push(year);
      }

      const total = summary.total_contributed || 0;
      totalContributed += total;

      const partyData = summary.party_totals || {};
      for (const [party, data] of Object.entries(partyData)) {
        if (!partyTotals[party]) {
          partyTotals[party] = {
            total_amount: 0,
            total_amount_usd: 0,
            contribution_count: 0,
            percentage: 0,
          };
        }

        const typedData = data as any;
        partyTotals[party].total_amount += typedData.total_amount || 0;
        partyTotals[party].contribution_count += typedData.contribution_count || 0;
      }
    }
  }

  // Calculate USD amounts and percentages
  const totalUsd = totalContributed / 100.0;

  for (const party in partyTotals) {
    partyTotals[party].total_amount_usd = partyTotals[party].total_amount / 100.0;
    partyTotals[party].percentage = totalContributed > 0
      ? (partyTotals[party].total_amount / totalContributed) * 100.0
      : 0;
  }

  // Merge UNK and OTH into "Other" category for display
  if (partyTotals['UNK'] || partyTotals['OTH']) {
    const unkData = partyTotals['UNK'] || { total_amount: 0, total_amount_usd: 0, contribution_count: 0, percentage: 0 };
    const othData = partyTotals['OTH'] || { total_amount: 0, total_amount_usd: 0, contribution_count: 0, percentage: 0 };

    partyTotals['OTH'] = {
      total_amount: unkData.total_amount + othData.total_amount,
      total_amount_usd: unkData.total_amount_usd + othData.total_amount_usd,
      contribution_count: unkData.contribution_count + othData.contribution_count,
      percentage: unkData.percentage + othData.percentage
    };

    // Remove UNK after merging
    delete partyTotals['UNK'];
  }

  const yearInfo = queriedYear ? ` (${queriedYear})` : ` (${years.length} years)`;
  console.log(`[FEC] Aggregated data for "${primaryDisplayName}"${yearInfo} from ${variantsFound.length} variants: $${totalUsd.toLocaleString()}`);

  return {
    display_name: primaryDisplayName,
    normalized_name: variantResults[0].normalized,
    total_contributed: totalContributed,
    total_usd: totalUsd,
    party_totals: partyTotals,
    years: years.sort(),
    data_source: 'firestore',
    variants_found: variantsFound,
    queried_year: queriedYear,
  };
}

/**
 * Query FEC political donation data for a company with AI-powered variant detection
 *
 * @param companyName - Company name (e.g., "JPMorgan", "Google", "Microsoft")
 * @param year - Optional year filter (e.g., 2024, 2022, 2020). Defaults to 2024 if not specified.
 * @returns Aggregated FEC donation data from all company variants
 *
 * Example usage:
 * ```typescript
 * // Query all years (aggregated)
 * const allData = await queryCompanyFECData("JPMorgan");
 *
 * // Query specific year
 * const data2024 = await queryCompanyFECData("JPMorgan", 2024);
 * const data2022 = await queryCompanyFECData("JPMorgan", 2022);
 *
 * if (data2024) {
 *   console.log(`${data2024.display_name} donated $${data2024.total_usd.toLocaleString()} in 2024`);
 *   console.log(`Found data from ${data2024.variants_found.length} variants`);
 *   console.log(`DEM: ${data2024.party_totals['DEM']?.percentage}%`);
 *   console.log(`REP: ${data2024.party_totals['REP']?.percentage}%`);
 * }
 * ```
 */
export async function queryCompanyFECData(
  companyName: string,
  year: number = 2024  // Default to 2024
): Promise<FECCompanyData | null> {
  try {
    console.log(`[FEC] Querying company: "${companyName}"${year ? ` (year: ${year})` : ' (all years)'}`);

    // Step 1: Use AI to generate possible company name variants
    const aiVariants = await generateCompanyVariants(companyName);

    // Step 2: Normalize all variants (handle both string and object formats)
    const normalizedVariants = aiVariants.map((v: any) => {
      const variantStr = typeof v === 'string' ? v : v.variant_name_lower || '';
      return normalizeCompanyName(variantStr);
    });

    // Remove duplicates
    const uniqueNormalized = [...new Set(normalizedVariants)].filter(v => v.length > 0);
    console.log(`[FEC] AI returned ${aiVariants.length} raw variants:`, aiVariants);
    console.log(`[FEC] Normalized to ${uniqueNormalized.length} unique variants:`, uniqueNormalized);

    // Step 3: Query Firestore for each variant in parallel
    const queryPromises = uniqueNormalized.map(normalized =>
      querySingleCompany(normalized, companyName, year).then(result =>
        // Use the normalized name from the result (after fuzzy matching),
        // not the input parameter, to ensure deduplication works correctly
        result ? result : null
      )
    );

    const results = await Promise.all(queryPromises);
    const validResults = results.filter(r => r !== null) as Array<{
      normalized: string;
      display_name: string;
      data: any[];
    }>;

    if (validResults.length === 0) {
      console.log(`[FEC] No data found for any variant of "${companyName}"${year ? ` in ${year}` : ''}`);
      return null;
    }

    console.log(`[FEC] Found ${validResults.length} variants with data`);

    // Step 4: Deduplicate by normalized_name to avoid counting same company multiple times
    // (e.g., "jpmorgan", "chase", "jpm" all fuzzy match to "jpmorgan chase")
    const uniqueByNormalized = new Map<string, {
      normalized: string;
      display_name: string;
      data: any[];
    }>();

    for (const result of validResults) {
      if (!uniqueByNormalized.has(result.normalized)) {
        uniqueByNormalized.set(result.normalized, result);
      }
    }

    const deduplicatedResults = Array.from(uniqueByNormalized.values());
    console.log(`[FEC] After deduplication: ${deduplicatedResults.length} unique companies`);

    // Step 5: Aggregate data from all unique companies
    const aggregatedData = aggregateVariantData(deduplicatedResults, year);

    return aggregatedData;

  } catch (error) {
    console.error('[FEC] Query error:', error);
    return null;
  }
}

/**
 * Format party name for display
 */
export function formatPartyName(party: string): string {
  const names: Record<string, string> = {
    'DEM': 'Democratic',
    'REP': 'Republican',
    'IND': 'Independent',
    'LIB': 'Libertarian',
    'GRE': 'Green',
    'UNK': 'Other',
    'OTH': 'Other',
  };
  return names[party] || 'Other';
}

/**
 * Get color for party (for UI rendering)
 */
export function getPartyColor(party: string): { dark: string; light: string } {
  const colors: Record<string, { dark: string; light: string }> = {
    'DEM': { dark: '#1e40af', light: '#93c5fd' },  // Blue
    'REP': { dark: '#dc2626', light: '#fca5a5' },  // Red
    'IND': { dark: '#65a30d', light: '#bef264' },  // Green
    'LIB': { dark: '#ca8a04', light: '#fde047' },  // Yellow
    'GRE': { dark: '#059669', light: '#6ee7b7' },  // Teal
  };
  return colors[party] || { dark: '#6b7280', light: '#d1d5db' };  // Gray default
}
