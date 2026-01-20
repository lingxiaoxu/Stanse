/**
 * Active Fronts Campaign Service
 *
 * Manages campaigns stored in the union_ACTIVE_FRONTS collection
 *
 * Collection Structure:
 * - union_ACTIVE_FRONTS/{campaignId} - Main document (current campaign state)
 * - union_ACTIVE_FRONTS/{campaignId}/history/{timestamp} - Historical snapshots
 * - union_ACTIVE_FRONTS/{campaignId}/participants/{userId} - User participation records
 *
 * Pattern similar to company_esg_by_ticker with main doc + history subcollection
 */

import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  Timestamp,
  addDoc,
  updateDoc,
  increment
} from 'firebase/firestore';
import { Campaign, CampaignUserAction, CampaignMetadata, Language } from '../types';
import { SP500_COMPANIES, getAllSectors, getCompaniesBySector } from '../data/sp500Companies';

const COLLECTION_NAME = 'union_ACTIVE_FRONTS';

/**
 * Generate a unique campaign ID
 */
export const generateCampaignId = (targetType: 'COMPANY' | 'SECTOR', target: string, type: 'SUPPORT' | 'OPPOSE'): string => {
  const prefix = targetType === 'COMPANY' ? 'company' : 'sector';
  const sanitizedTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${prefix}_${sanitizedTarget}_${type.toLowerCase()}`;
};

/**
 * Get a campaign by ID from Firebase
 */
export const getCampaignById = async (campaignId: string): Promise<Campaign | null> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, campaignId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log(`[Active Fronts] Campaign not found: ${campaignId}`);
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      metadata: data.metadata ? {
        ...data.metadata,
        createdAt: data.metadata.createdAt?.toDate?.()?.toISOString() || data.metadata.createdAt,
        updatedAt: data.metadata.updatedAt?.toDate?.()?.toISOString() || data.metadata.updatedAt,
        startDate: data.metadata.startDate?.toDate?.()?.toISOString() || data.metadata.startDate,
        endDate: data.metadata.endDate?.toDate?.()?.toISOString() || data.metadata.endDate
      } : undefined
    } as Campaign;
  } catch (error) {
    console.error(`[Active Fronts] Error fetching campaign ${campaignId}:`, error);
    return null;
  }
};

/**
 * Get all campaigns from Firebase
 */
export const getAllCampaigns = async (): Promise<Campaign[]> => {
  try {
    const collectionRef = collection(db, COLLECTION_NAME);
    const querySnapshot = await getDocs(collectionRef);

    const campaigns: Campaign[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      campaigns.push({
        id: doc.id,
        ...data,
        metadata: data.metadata ? {
          ...data.metadata,
          createdAt: data.metadata.createdAt?.toDate?.()?.toISOString() || data.metadata.createdAt,
          updatedAt: data.metadata.updatedAt?.toDate?.()?.toISOString() || data.metadata.updatedAt,
          startDate: data.metadata.startDate?.toDate?.()?.toISOString() || data.metadata.startDate,
          endDate: data.metadata.endDate?.toDate?.()?.toISOString() || data.metadata.endDate
        } : undefined
      } as Campaign);
    });

    console.log(`[Active Fronts] Retrieved ${campaigns.length} campaigns`);
    return campaigns;
  } catch (error) {
    console.error('[Active Fronts] Error fetching campaigns:', error);
    return [];
  }
};

/**
 * Get campaigns by language
 */
export const getCampaignsByLanguage = async (language: Language): Promise<Campaign[]> => {
  try {
    const collectionRef = collection(db, COLLECTION_NAME);
    const q = query(collectionRef, where('language', '==', language));
    const querySnapshot = await getDocs(q);

    const campaigns: Campaign[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      campaigns.push({
        id: doc.id,
        ...data,
        metadata: data.metadata ? {
          ...data.metadata,
          createdAt: data.metadata.createdAt?.toDate?.()?.toISOString() || data.metadata.createdAt,
          updatedAt: data.metadata.updatedAt?.toDate?.()?.toISOString() || data.metadata.updatedAt,
          startDate: data.metadata.startDate?.toDate?.()?.toISOString() || data.metadata.startDate,
          endDate: data.metadata.endDate?.toDate?.()?.toISOString() || data.metadata.endDate
        } : undefined
      } as Campaign);
    });

    console.log(`[Active Fronts] Retrieved ${campaigns.length} campaigns for language: ${language}`);
    return campaigns;
  } catch (error) {
    console.error(`[Active Fronts] Error fetching campaigns for language ${language}:`, error);
    return [];
  }
};

/**
 * Get campaigns by target type (COMPANY or SECTOR)
 */
export const getCampaignsByTargetType = async (targetType: 'COMPANY' | 'SECTOR'): Promise<Campaign[]> => {
  try {
    const collectionRef = collection(db, COLLECTION_NAME);
    const q = query(collectionRef, where('targetType', '==', targetType));
    const querySnapshot = await getDocs(q);

    const campaigns: Campaign[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      campaigns.push({
        id: doc.id,
        ...data
      } as Campaign);
    });

    console.log(`[Active Fronts] Retrieved ${campaigns.length} ${targetType} campaigns`);
    return campaigns;
  } catch (error) {
    console.error(`[Active Fronts] Error fetching ${targetType} campaigns:`, error);
    return [];
  }
};

/**
 * Create or update a campaign in Firebase
 * Also creates a history entry
 */
export const saveCampaign = async (campaign: Campaign): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, campaign.id);

    // Prepare campaign data with Timestamps
    const now = Timestamp.now();
    const campaignData: any = {
      ...campaign,
      metadata: campaign.metadata ? {
        ...campaign.metadata,
        updatedAt: now,
        createdAt: campaign.metadata.createdAt ? Timestamp.fromDate(new Date(campaign.metadata.createdAt)) : now,
        startDate: campaign.metadata.startDate ? Timestamp.fromDate(new Date(campaign.metadata.startDate)) : now,
        endDate: campaign.metadata.endDate ? Timestamp.fromDate(new Date(campaign.metadata.endDate)) : null
      } : {
        createdAt: now,
        updatedAt: now,
        startDate: now,
        totalBoycottAmount: 0,
        totalBuycottAmount: 0,
        uniqueParticipants: 0
      }
    };

    // Populate undefined fields with default values to prevent Firebase errors
    if (campaignData.ticker === undefined) {
      campaignData.ticker = null;
    }
    if (campaignData.sector === undefined) {
      campaignData.sector = null;
    }
    if (campaignData.companiesInSector === undefined) {
      campaignData.companiesInSector = [];
    }

    // Save main document
    await setDoc(docRef, campaignData, { merge: true });
    console.log(`[Active Fronts] Saved campaign: ${campaign.id}`);

    // Create history entry
    const historyRef = collection(db, COLLECTION_NAME, campaign.id, 'history');
    await addDoc(historyRef, {
      ...campaignData,
      timestamp: now,
      action: 'updated'
    });
    console.log(`[Active Fronts] Created history entry for: ${campaign.id}`);
  } catch (error) {
    console.error(`[Active Fronts] Error saving campaign ${campaign.id}:`, error);
    throw error;
  }
};

/**
 * Get campaign history
 */
export const getCampaignHistory = async (
  campaignId: string,
  limitCount: number = 10
): Promise<any[]> => {
  try {
    const historyRef = collection(db, COLLECTION_NAME, campaignId, 'history');
    const q = query(historyRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const querySnapshot = await getDocs(q);

    const history: any[] = [];
    querySnapshot.forEach((doc) => {
      history.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`[Active Fronts] Retrieved ${history.length} history entries for ${campaignId}`);
    return history;
  } catch (error) {
    console.error(`[Active Fronts] Error fetching history for ${campaignId}:`, error);
    return [];
  }
};

/**
 * Record a user action (BOYCOTT or BUYCOTT) on a campaign
 */
export const recordUserAction = async (
  campaignId: string,
  userId: string,
  actionType: 'BOYCOTT' | 'BUYCOTT',
  amountCents: number
): Promise<void> => {
  try {
    // Save user action to participants subcollection
    const participantRef = doc(db, COLLECTION_NAME, campaignId, 'participants', userId);
    const action: CampaignUserAction = {
      userId,
      actionType,
      amountCents,
      timestamp: new Date().toISOString()
    };

    await setDoc(participantRef, action, { merge: true });

    // Update campaign totals
    const campaignRef = doc(db, COLLECTION_NAME, campaignId);
    const updateData: any = {
      participants: increment(1),
      'metadata.uniqueParticipants': increment(1)
    };

    if (actionType === 'BOYCOTT') {
      updateData['metadata.totalBoycottAmount'] = increment(amountCents);
    } else {
      updateData['metadata.totalBuycottAmount'] = increment(amountCents);
    }

    await updateDoc(campaignRef, updateData);

    console.log(`[Active Fronts] Recorded ${actionType} action for user ${userId} on campaign ${campaignId}`);
  } catch (error) {
    console.error(`[Active Fronts] Error recording user action:`, error);
    throw error;
  }
};

/**
 * Get user's participation in a campaign
 */
export const getUserCampaignAction = async (
  campaignId: string,
  userId: string
): Promise<CampaignUserAction | null> => {
  try {
    const participantRef = doc(db, COLLECTION_NAME, campaignId, 'participants', userId);
    const docSnap = await getDoc(participantRef);

    if (!docSnap.exists()) {
      return null;
    }

    return docSnap.data() as CampaignUserAction;
  } catch (error) {
    console.error(`[Active Fronts] Error fetching user action:`, error);
    return null;
  }
};

/**
 * Get all campaigns a user has participated in
 */
export const getUserCampaigns = async (userId: string): Promise<Campaign[]> => {
  try {
    // This requires querying subcollections across all campaigns
    // For now, we'll return all campaigns and filter client-side
    const allCampaigns = await getAllCampaigns();

    // Check each campaign for user participation
    const userCampaigns: Campaign[] = [];
    for (const campaign of allCampaigns) {
      const action = await getUserCampaignAction(campaign.id, userId);
      if (action) {
        userCampaigns.push(campaign);
      }
    }

    return userCampaigns;
  } catch (error) {
    console.error('[Active Fronts] Error fetching user campaigns:', error);
    return [];
  }
};
