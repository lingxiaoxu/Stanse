import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  Timestamp
} from 'firebase/firestore';
import { StanceType } from '../data/sp500Companies';

const COMPANY_RANKINGS_COLLECTION = 'company_rankings';
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

export interface RankedCompany {
  symbol: string;
  name: string;
  sector: string;
  score: number;      // 0-100 alignment score
  reasoning: string;  // Brief explanation
}

export interface CompanyRanking {
  stanceType: StanceType;
  supportCompanies: RankedCompany[];  // Top 5 to support
  opposeCompanies: RankedCompany[];   // Top 5 to oppose
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Get company rankings from cache for a specific stance type
 * Returns null if cache is expired or doesn't exist
 */
export const getCompanyRankingsFromCache = async (
  stanceType: StanceType
): Promise<CompanyRanking | null> => {
  try {
    const docRef = doc(db, COMPANY_RANKINGS_COLLECTION, stanceType);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);

      // Check if cache is still valid
      if (expiresAt > new Date()) {
        return {
          stanceType: data.stanceType,
          supportCompanies: data.supportCompanies,
          opposeCompanies: data.opposeCompanies,
          updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
          expiresAt: expiresAt
        };
      }
      console.log('Company rankings cache expired for:', stanceType);
    }
    return null;
  } catch (error) {
    console.error('Error getting company rankings from cache:', error);
    return null;
  }
};

/**
 * Save company rankings to cache
 */
export const saveCompanyRankingsToCache = async (
  ranking: Omit<CompanyRanking, 'updatedAt' | 'expiresAt'>
): Promise<void> => {
  try {
    const docRef = doc(db, COMPANY_RANKINGS_COLLECTION, ranking.stanceType);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_DURATION_MS);

    await setDoc(docRef, {
      ...ranking,
      updatedAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresAt)
    });

    console.log('Company rankings saved to cache for:', ranking.stanceType);
  } catch (error) {
    console.error('Error saving company rankings to cache:', error);
  }
};

/**
 * Check if rankings exist and are fresh (not expired)
 */
export const isRankingCacheValid = async (stanceType: StanceType): Promise<boolean> => {
  try {
    const ranking = await getCompanyRankingsFromCache(stanceType);
    return ranking !== null;
  } catch {
    return false;
  }
};
