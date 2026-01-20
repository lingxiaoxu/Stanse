/**
 * Campaign Personalization Service
 *
 * Selects personalized campaigns for users based on their:
 * - Company rankings (highest support / lowest opposition)
 * - Core stance type (industry preferences)
 * - Political coordinates
 */

import { Campaign, Language } from '../types';
import { getCampaignsByLanguage } from './activeFrontsService';
import { getEnhancedCompanyRankingsForCoordinates } from './enhancedCompanyRankingService';
import { PoliticalCoordinates } from '../types';
import { SP500_COMPANIES, getAllSectors } from '../data/sp500Companies';

/**
 * Get 4 personalized campaigns for a user:
 * 1. Highest ranked company SUPPORT campaign
 * 2. Lowest ranked company OPPOSE campaign
 * 3. Most supported sector campaign
 * 4. Most opposed sector campaign
 *
 * @param userCoordinates - User's political coordinates
 * @param language - Language to filter campaigns (defaults to EN)
 */
export const getPersonalizedCampaigns = async (
  userCoordinates: PoliticalCoordinates,
  language: Language = Language.EN
): Promise<Campaign[]> => {
  try {
    // Get campaigns for the specified language only
    const allCampaigns = await getCampaignsByLanguage(language);

    // Get user's company rankings
    const rankings = await getEnhancedCompanyRankingsForCoordinates(userCoordinates);

    const personalizedCampaigns: Campaign[] = [];

    // 1. Highest ranked company SUPPORT campaign
    if (rankings.supportCompanies.length > 0) {
      const topCompany = rankings.supportCompanies[0]; // Already sorted by score
      const supportCampaign = allCampaigns.find(
        c => c.targetType === 'COMPANY' &&
             c.ticker === topCompany.symbol &&
             c.type === 'BUYCOTT' // Support = BUYCOTT
      );
      if (supportCampaign) {
        personalizedCampaigns.push(supportCampaign);
      }
    }

    // 2. Lowest ranked company OPPOSE campaign
    if (rankings.opposeCompanies.length > 0) {
      const bottomCompany = rankings.opposeCompanies[0]; // Already sorted by score
      const opposeCampaign = allCampaigns.find(
        c => c.targetType === 'COMPANY' &&
             c.ticker === bottomCompany.symbol &&
             c.type === 'BOYCOTT' // Oppose = BOYCOTT
      );
      if (opposeCampaign) {
        personalizedCampaigns.push(opposeCampaign);
      }
    }

    // 3 & 4. Sector campaigns based on coreStanceType
    const sectorCampaigns = await getSectorCampaignsForStance(userCoordinates, allCampaigns);
    personalizedCampaigns.push(...sectorCampaigns.slice(0, 2)); // Take top 2 sector campaigns

    return personalizedCampaigns;
  } catch (error) {
    console.error('[Campaign Personalization] Error getting personalized campaigns:', error);
    return [];
  }
};

/**
 * Get sector campaigns based on user's political stance
 * Returns [most supported sector campaign, most opposed sector campaign]
 */
const getSectorCampaignsForStance = async (
  userCoordinates: PoliticalCoordinates,
  allCampaigns: Campaign[]
): Promise<Campaign[]> => {
  const sectorPreferences = getSectorPreferencesByStance(userCoordinates.coreStanceType || 'progressive-globalist');

  const sectorCampaigns: Campaign[] = [];

  // Most supported sector SUPPORT campaign
  if (sectorPreferences.mostSupported) {
    const supportSector = allCampaigns.find(
      c => c.targetType === 'SECTOR' &&
           c.sector === sectorPreferences.mostSupported &&
           c.type === 'BUYCOTT'
    );
    if (supportSector) {
      sectorCampaigns.push(supportSector);
    }
  }

  // Most opposed sector OPPOSE campaign
  if (sectorPreferences.mostOpposed) {
    const opposeSector = allCampaigns.find(
      c => c.targetType === 'SECTOR' &&
           c.sector === sectorPreferences.mostOpposed &&
           c.type === 'BOYCOTT'
    );
    if (opposeSector) {
      sectorCampaigns.push(opposeSector);
    }
  }

  return sectorCampaigns;
};

/**
 * Define sector preferences based on political stance
 * This maps stanceType to preferred and opposed sectors
 */
const getSectorPreferencesByStance = (stanceType: string): {
  mostSupported: string | null;
  mostOpposed: string | null;
} => {
  // Map stanceType to sector preferences
  const preferences: Record<string, { mostSupported: string; mostOpposed: string }> = {
    'progressive-globalist': {
      mostSupported: 'Technology',
      mostOpposed: 'Energy'
    },
    'progressive-nationalist': {
      mostSupported: 'Industrial',
      mostOpposed: 'Financial'
    },
    'socialist-libertarian': {
      mostSupported: 'Utilities',
      mostOpposed: 'Financial'
    },
    'socialist-nationalist': {
      mostSupported: 'Industrial',
      mostOpposed: 'Technology'
    },
    'capitalist-globalist': {
      mostSupported: 'Financial',
      mostOpposed: 'Utilities'
    },
    'capitalist-nationalist': {
      mostSupported: 'Energy',
      mostOpposed: 'Technology'
    },
    'conservative-globalist': {
      mostSupported: 'Financial',
      mostOpposed: 'Consumer'
    },
    'conservative-nationalist': {
      mostSupported: 'Energy',
      mostOpposed: 'Communications'
    }
  };

  return preferences[stanceType] || { mostSupported: null, mostOpposed: null };
};

/**
 * Get all campaigns sorted alphabetically for VIEW ALL page
 * With personalized campaigns at the top
 */
export const getAllCampaignsSorted = async (
  userCoordinates?: PoliticalCoordinates,
  language: Language = Language.EN
): Promise<Campaign[]> => {
  try {
    const allCampaigns = await getCampaignsByLanguage(language);

    // Get personalized campaigns
    let personalizedCampaigns: Campaign[] = [];
    if (userCoordinates) {
      personalizedCampaigns = await getPersonalizedCampaigns(userCoordinates, language);
    }

    // Remove personalized campaigns from the list
    const personalizedIds = new Set(personalizedCampaigns.map(c => c.id));
    const remainingCampaigns = allCampaigns.filter(c => !personalizedIds.has(c.id));

    // Sort remaining campaigns alphabetically by target
    remainingCampaigns.sort((a, b) => a.target.localeCompare(b.target));

    // Return personalized first, then alphabetical
    return [...personalizedCampaigns, ...remainingCampaigns];
  } catch (error) {
    console.error('[Campaign Personalization] Error getting sorted campaigns:', error);
    return [];
  }
};

/**
 * Get campaigns by page for pagination (8 per page)
 */
export const getCampaignsByPage = async (
  page: number,
  pageSize: number = 8,
  userCoordinates?: PoliticalCoordinates,
  language: Language = Language.EN
): Promise<{ campaigns: Campaign[]; totalPages: number; totalCount: number }> => {
  try {
    const allSortedCampaigns = await getAllCampaignsSorted(userCoordinates, language);

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const campaigns = allSortedCampaigns.slice(startIndex, endIndex);

    return {
      campaigns,
      totalPages: Math.ceil(allSortedCampaigns.length / pageSize),
      totalCount: allSortedCampaigns.length
    };
  } catch (error) {
    console.error('[Campaign Personalization] Error getting campaigns by page:', error);
    return { campaigns: [], totalPages: 0, totalCount: 0 };
  }
};
