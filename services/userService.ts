import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { PoliticalCoordinates, BrandAlignment, OnboardingAnswers, SocialMediaConnection, SocialPlatform } from '../types';

// User Profile
export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  coordinates: PoliticalCoordinates;
  onboarding?: OnboardingAnswers;
  hasCompletedOnboarding: boolean;
  tourCompleted?: {
    EN?: boolean;
    ZH?: boolean;
    JA?: boolean;
    FR?: boolean;
    ES?: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Scan History
export interface ScanRecord {
  id?: string;
  userId: string;
  brandAlignment: BrandAlignment;
  scannedAt: Timestamp;
}

// ==================== User Profile ====================

export const createUserProfile = async (
  userId: string,
  email: string,
  coordinates: PoliticalCoordinates
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    id: userId,
    email,
    coordinates,
    hasCompletedOnboarding: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }
  return null;
};

export const updateUserCoordinates = async (
  userId: string,
  coordinates: PoliticalCoordinates
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    coordinates,
    updatedAt: serverTimestamp()
  });
};

export const updateUserDisplayName = async (
  userId: string,
  displayName: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    displayName,
    updatedAt: serverTimestamp()
  });
};

// ==================== Scan History ====================

export const saveScanRecord = async (
  userId: string,
  brandAlignment: BrandAlignment
): Promise<string> => {
  const scansRef = collection(db, 'users', userId, 'scans');
  const docRef = await addDoc(scansRef, {
    userId,
    brandAlignment,
    scannedAt: serverTimestamp()
  });
  return docRef.id;
};

export const getUserScans = async (userId: string): Promise<ScanRecord[]> => {
  const scansRef = collection(db, 'users', userId, 'scans');
  const q = query(scansRef);
  const querySnapshot = await getDocs(q);

  const scans: ScanRecord[] = [];
  querySnapshot.forEach((doc) => {
    scans.push({ id: doc.id, ...doc.data() } as ScanRecord);
  });

  // Sort by scannedAt descending
  return scans.sort((a, b) => {
    const timeA = a.scannedAt?.toMillis() || 0;
    const timeB = b.scannedAt?.toMillis() || 0;
    return timeB - timeA;
  });
};

export const deleteScanRecord = async (userId: string, scanId: string): Promise<void> => {
  const scanRef = doc(db, 'users', userId, 'scans', scanId);
  await deleteDoc(scanRef);
};

// ==================== Favorites ====================

export interface FavoriteBrand {
  id?: string;
  userId: string;
  brandName: string;
  lastScore: number;
  addedAt: Timestamp;
}

export const addFavoriteBrand = async (
  userId: string,
  brandName: string,
  score: number
): Promise<string> => {
  const favoritesRef = collection(db, 'users', userId, 'favorites');
  const docRef = await addDoc(favoritesRef, {
    userId,
    brandName,
    lastScore: score,
    addedAt: serverTimestamp()
  });
  return docRef.id;
};

export const getUserFavorites = async (userId: string): Promise<FavoriteBrand[]> => {
  const favoritesRef = collection(db, 'users', userId, 'favorites');
  const querySnapshot = await getDocs(favoritesRef);

  const favorites: FavoriteBrand[] = [];
  querySnapshot.forEach((doc) => {
    favorites.push({ id: doc.id, ...doc.data() } as FavoriteBrand);
  });

  return favorites;
};

export const removeFavoriteBrand = async (userId: string, favoriteId: string): Promise<void> => {
  const favoriteRef = doc(db, 'users', userId, 'favorites', favoriteId);
  await deleteDoc(favoriteRef);
};

// ==================== Onboarding ====================

export const saveOnboardingAnswers = async (
  userId: string,
  answers: OnboardingAnswers,
  coordinates: PoliticalCoordinates
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  // Use setDoc with merge to handle case where document doesn't exist yet
  await setDoc(userRef, {
    onboarding: answers,
    coordinates,
    hasCompletedOnboarding: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

export const hasUserCompletedOnboarding = async (userId: string): Promise<boolean> => {
  const profile = await getUserProfile(userId);
  return profile?.hasCompletedOnboarding ?? false;
};

// Reset onboarding - allows user to retake the questionnaire
export const resetUserOnboarding = async (userId: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    hasCompletedOnboarding: false,
    onboarding: null,
    coordinates: {
      economic: 0,
      social: 0,
      diplomatic: 0,
      label: 'Uncalibrated'
    },
    updatedAt: serverTimestamp()
  });
};

// ==================== Social Media Connections ====================
// Uses main document + history subcollection pattern (like company_esg_by_ticker)

/**
 * Connect a social media account to the user's profile
 * Uses main doc + history pattern: socialConnections/{userId}_{platform}
 *
 * @param userId - The user's ID
 * @param platform - The social media platform (e.g., TWITTER, FACEBOOK)
 * @param handle - The username/handle (without @ prefix)
 * @param additionalData - Optional additional data (display name, profile URL, etc.)
 * @returns The connection document ID (userId_platform)
 */
export const connectSocialMedia = async (
  userId: string,
  platform: SocialPlatform,
  handle: string,
  additionalData?: Partial<SocialMediaConnection>
): Promise<string> => {
  try {
    // Document ID is userId_platform (ensures one doc per user per platform)
    const docId = `${userId}_${platform}`;
    const connectionRef = doc(db, 'socialConnections', docId);

    // Get existing connection (if any)
    const existingSnap = await getDoc(connectionRef);
    const isFirstConnection = !existingSnap.exists();
    const now = new Date().toISOString();

    // Build connection data, only including defined values
    const connectionData: Record<string, any> = {
      userId,
      platform,
      handle: handle.replace('@', ''), // Remove @ prefix if present
      verified: additionalData?.verified || false,
      connectedAt: existingSnap.data()?.connectedAt || now, // Preserve original connection time
      isActive: true,
      updatedAt: now
    };

    // Only add optional fields if they have values
    if (additionalData?.displayName) connectionData.displayName = additionalData.displayName;
    if (additionalData?.profileUrl) connectionData.profileUrl = additionalData.profileUrl;
    if (additionalData?.followerCount !== undefined) connectionData.followerCount = additionalData.followerCount;
    if (additionalData?.accessToken) connectionData.accessToken = additionalData.accessToken;
    if (additionalData?.refreshToken) connectionData.refreshToken = additionalData.refreshToken;
    if (additionalData?.tokenExpiresAt) connectionData.tokenExpiresAt = additionalData.tokenExpiresAt;
    if (additionalData?.apiUserId) connectionData.apiUserId = additionalData.apiUserId;
    if (additionalData?.lastSyncedAt) connectionData.lastSyncedAt = additionalData.lastSyncedAt;

    // Save main document (upsert)
    await setDoc(connectionRef, connectionData, { merge: true });

    // Add history entry (best effort)
    try {
      const historyRef = collection(db, 'socialConnections', docId, 'history');
      await addDoc(historyRef, {
        ...connectionData,
        action: isFirstConnection ? 'connected' : 'updated',
        timestamp: now
      });
    } catch (historyError) {
      console.warn(`Failed to add history entry for connection:`, historyError);
      // Continue - main connection succeeded
    }

    return docId;
  } catch (error) {
    console.error(`Failed to connect ${platform} for user ${userId}:`, error);
    throw error; // Re-throw for UI to show error
  }
};

/**
 * Get a specific social media connection for a user and platform
 * @param userId - The user's ID
 * @param platform - The social media platform
 * @returns The connection or null if not found
 */
export const getSocialMediaConnection = async (
  userId: string,
  platform: SocialPlatform
): Promise<SocialMediaConnection | null> => {
  try {
    const docId = `${userId}_${platform}`;
    const connectionRef = doc(db, 'socialConnections', docId);
    const docSnap = await getDoc(connectionRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();

    // Only return if active
    if (!data.isActive) {
      return null;
    }

    return { id: docSnap.id, ...data } as SocialMediaConnection;
  } catch (error) {
    console.error(`Error getting ${platform} connection for user ${userId}:`, error);
    return null; // Return null on error (graceful degradation)
  }
};

/**
 * Get all active social media connections for a user
 * @param userId - The user's ID
 * @returns Array of social media connections
 */
export const getAllSocialMediaConnections = async (
  userId: string
): Promise<SocialMediaConnection[]> => {
  const connections: SocialMediaConnection[] = [];

  // Check all 5 platforms
  const platforms: SocialPlatform[] = [
    SocialPlatform.TWITTER,
    SocialPlatform.FACEBOOK,
    SocialPlatform.INSTAGRAM,
    SocialPlatform.LINKEDIN,
    SocialPlatform.TIKTOK
  ];

  for (const platform of platforms) {
    const connection = await getSocialMediaConnection(userId, platform);
    if (connection) {
      connections.push(connection);
    }
  }

  // Sort by connectedAt descending (most recent first)
  return connections.sort((a, b) => {
    const timeA = new Date(a.connectedAt).getTime();
    const timeB = new Date(b.connectedAt).getTime();
    return timeB - timeA;
  });
};

/**
 * Disconnect a social media account (soft delete - marks as inactive)
 * @param userId - The user's ID
 * @param platform - The social media platform to disconnect
 */
export const disconnectSocialMedia = async (
  userId: string,
  platform: SocialPlatform
): Promise<void> => {
  try {
    const docId = `${userId}_${platform}`;
    const connectionRef = doc(db, 'socialConnections', docId);
    const docSnap = await getDoc(connectionRef);

    if (!docSnap.exists()) return;

    const now = new Date().toISOString();

    // Update main document
    await updateDoc(connectionRef, {
      isActive: false,
      updatedAt: now
    });

    // Add history entry (best effort - don't fail if history write fails)
    try {
      const historyRef = collection(db, 'socialConnections', docId, 'history');
      await addDoc(historyRef, {
        ...docSnap.data(),
        action: 'disconnected',
        isActive: false,
        timestamp: now
      });
    } catch (historyError) {
      console.warn(`Failed to add history entry for ${platform}:`, historyError);
      // Continue - main disconnect succeeded
    }
  } catch (error) {
    console.error(`Failed to disconnect ${platform} for user ${userId}:`, error);
    throw error; // Re-throw for caller to handle
  }
};

/**
 * Permanently delete a social media connection (and its history)
 * @param userId - The user's ID
 * @param platform - The social media platform to delete
 */
export const deleteSocialMediaConnection = async (
  userId: string,
  platform: SocialPlatform
): Promise<void> => {
  const docId = `${userId}_${platform}`;
  const connectionRef = doc(db, 'socialConnections', docId);

  // Note: This deletes the main document only
  // History subcollection will remain (Firestore doesn't cascade delete)
  // Use Cloud Functions or manual cleanup for history if needed
  await deleteDoc(connectionRef);
};

/**
 * Disconnect all social media accounts for a user (used during reset)
 * Soft delete - marks all connections as inactive
 * @param userId - The user's ID
 */
export const disconnectAllSocialMedia = async (userId: string): Promise<void> => {
  const platforms: SocialPlatform[] = [
    SocialPlatform.TWITTER,
    SocialPlatform.FACEBOOK,
    SocialPlatform.INSTAGRAM,
    SocialPlatform.LINKEDIN,
    SocialPlatform.TIKTOK
  ];

  const now = new Date().toISOString();

  const disconnectPromises = platforms.map(async (platform) => {
    try {
      const docId = `${userId}_${platform}`;
      const connectionRef = doc(db, 'socialConnections', docId);
      const docSnap = await getDoc(connectionRef);

      if (!docSnap.exists()) return;

      // Update main document
      await updateDoc(connectionRef, {
        isActive: false,
        updatedAt: now
      });

      // Add history entry
      const historyRef = collection(db, 'socialConnections', docId, 'history');
      await addDoc(historyRef, {
        ...docSnap.data(),
        action: 'disconnected_via_reset',
        isActive: false,
        timestamp: now
      });
    } catch (error) {
      // Silently handle errors for individual platforms
      // Don't let one platform's error block the reset
      console.warn(`Failed to disconnect ${platform} for user ${userId}:`, error);
    }
  });

  await Promise.all(disconnectPromises);
};

/**
 * Update social media connection metadata (e.g., after syncing with API)
 * @param userId - The user's ID
 * @param platform - The social media platform
 * @param updates - Partial updates to apply
 */
export const updateSocialMediaConnection = async (
  userId: string,
  platform: SocialPlatform,
  updates: Partial<SocialMediaConnection>
): Promise<void> => {
  try {
    const docId = `${userId}_${platform}`;
    const connectionRef = doc(db, 'socialConnections', docId);
    const docSnap = await getDoc(connectionRef);

    if (!docSnap.exists()) {
      throw new Error(`Social media connection not found: ${userId}_${platform}`);
    }

    const now = new Date().toISOString();

    // Update main document
    await updateDoc(connectionRef, {
      ...updates,
      updatedAt: now
    });

    // Add history entry (best effort)
    try {
      const historyRef = collection(db, 'socialConnections', docId, 'history');
      await addDoc(historyRef, {
        ...docSnap.data(),
        ...updates,
        action: 'metadata_updated',
        timestamp: now
      });
    } catch (historyError) {
      console.warn(`Failed to add history entry for metadata update:`, historyError);
      // Continue - main update succeeded
    }
  } catch (error) {
    console.error(`Failed to update ${platform} connection for user ${userId}:`, error);
    throw error; // Re-throw for caller
  }
};

/**
 * Sync social media connection data from platform API
 * This is a placeholder for future Twitter/X API integration
 * @param userId - The user's ID
 * @param platform - The social media platform
 */
export const syncSocialMediaData = async (
  userId: string,
  platform: SocialPlatform
): Promise<void> => {
  const connection = await getSocialMediaConnection(userId, platform);

  if (!connection) {
    throw new Error(`Social media connection not found: ${userId}_${platform}`);
  }

  // TODO: Implement actual API sync when Twitter/X API is integrated
  // For now, just update the lastSyncedAt timestamp
  await updateSocialMediaConnection(userId, platform, {
    lastSyncedAt: new Date().toISOString()
  });
};

// ==================== App Tour ====================

/**
 * Mark app tour as completed for a specific language
 * @param userId - The user's ID
 * @param language - The language in which tour was completed
 */
export const markTourCompleted = async (
  userId: string,
  language: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    [`tourCompleted.${language}`]: true,
    updatedAt: serverTimestamp()
  });
};

/**
 * Check if user has completed tour in a specific language
 * @param userId - The user's ID
 * @param language - The language to check
 * @returns true if tour completed in this language
 */
export const hasSeenTourInLanguage = async (
  userId: string,
  language: string
): Promise<boolean> => {
  const profile = await getUserProfile(userId);
  return profile?.tourCompleted?.[language as keyof typeof profile.tourCompleted] || false;
};
