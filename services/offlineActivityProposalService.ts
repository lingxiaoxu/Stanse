/**
 * Offline Activity Proposal Service
 *
 * Manages user-submitted proposals for offline activities
 *
 * Collection Structure:
 * - offline_activity_proposals/{proposalId}
 *   - userId: string
 *   - campaignBaseId: string (e.g., "company_aapl_oppose")
 *   - status: 'pending' | 'approved' | 'rejected'
 *   - proposedEvent: OfflineEvent
 *   - description: string
 *   - createdAt: Timestamp
 *   - reviewedAt?: Timestamp
 *   - reviewedBy?: string
 */

import { db } from './firebase';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';

export interface OfflineActivityProposal {
  id?: string;
  userId: string;
  campaignBaseId: string; // Without language suffix
  status: 'pending' | 'approved' | 'rejected';
  proposedEvent: {
    date: string;
    city: string;
    state: string;
    country: string;
    address?: string;
    expectedAttendees?: number;
  };
  description: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

const COLLECTION_NAME = 'offline_activity_proposals';

/**
 * Submit a new offline activity proposal
 */
export const submitOfflineActivityProposal = async (
  userId: string,
  campaignBaseId: string,
  proposalData: {
    date: string;
    city: string;
    state: string;
    country: string;
    address?: string;
    expectedAttendees?: number;
    description: string;
  }
): Promise<string> => {
  try {
    const proposal: Omit<OfflineActivityProposal, 'id'> = {
      userId,
      campaignBaseId,
      status: 'pending',
      proposedEvent: {
        date: proposalData.date,
        city: proposalData.city,
        state: proposalData.state,
        country: proposalData.country,
        address: proposalData.address,
        expectedAttendees: proposalData.expectedAttendees
      },
      description: proposalData.description,
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...proposal,
      createdAt: Timestamp.now()
    });

    console.log(`[Offline Activity Proposal] Created proposal: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('[Offline Activity Proposal] Error submitting proposal:', error);
    throw error;
  }
};

/**
 * Get proposals for a campaign
 */
export const getProposalsForCampaign = async (
  campaignBaseId: string
): Promise<OfflineActivityProposal[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('campaignBaseId', '==', campaignBaseId)
    );
    const querySnapshot = await getDocs(q);

    const proposals: OfflineActivityProposal[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      proposals.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() || data.reviewedAt
      } as OfflineActivityProposal);
    });

    return proposals;
  } catch (error) {
    console.error('[Offline Activity Proposal] Error fetching proposals:', error);
    return [];
  }
};

/**
 * Get user's proposals
 */
export const getUserProposals = async (userId: string): Promise<OfflineActivityProposal[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);

    const proposals: OfflineActivityProposal[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      proposals.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() || data.reviewedAt
      } as OfflineActivityProposal);
    });

    return proposals;
  } catch (error) {
    console.error('[Offline Activity Proposal] Error fetching user proposals:', error);
    return [];
  }
};

/**
 * Approve a proposal (admin function)
 */
export const approveProposal = async (
  proposalId: string,
  reviewedBy: string
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, proposalId);
    await updateDoc(docRef, {
      status: 'approved',
      reviewedAt: Timestamp.now(),
      reviewedBy
    });
    console.log(`[Offline Activity Proposal] Approved proposal: ${proposalId}`);
  } catch (error) {
    console.error('[Offline Activity Proposal] Error approving proposal:', error);
    throw error;
  }
};

/**
 * Reject a proposal (admin function)
 */
export const rejectProposal = async (
  proposalId: string,
  reviewedBy: string
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, proposalId);
    await updateDoc(docRef, {
      status: 'rejected',
      reviewedAt: Timestamp.now(),
      reviewedBy
    });
    console.log(`[Offline Activity Proposal] Rejected proposal: ${proposalId}`);
  } catch (error) {
    console.error('[Offline Activity Proposal] Error rejecting proposal:', error);
    throw error;
  }
};
