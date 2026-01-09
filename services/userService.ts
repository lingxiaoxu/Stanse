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

  // Get current user data to check if tourCompleted exists
  const userDoc = await getDoc(userRef);
  const userData = userDoc.data();

  // If tourCompleted doesn't exist yet, initialize all languages
  // This ensures consistency with reset-all-tours.ts behavior
  if (!userData?.tourCompleted) {
    await updateDoc(userRef, {
      tourCompleted: {
        EN: language === 'EN',
        ZH: language === 'ZH',
        JA: language === 'JA',
        FR: language === 'FR',
        ES: language === 'ES'
      },
      updatedAt: serverTimestamp()
    });
  } else {
    // tourCompleted already exists, just update the specific language
    await updateDoc(userRef, {
      [`tourCompleted.${language}`]: true,
      updatedAt: serverTimestamp()
    });
  }
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

// ==================== Entity Stances ====================
// Track user's explicit support/oppose stances on specific entities
// Collection structure: entityStances/{userId}/entities/{entityName}

export interface EntityStance {
  entityName: string;
  stance: 'SUPPORT' | 'OPPOSE';
  reason?: string;
  timestamp: string;
  userId: string;
}

/**
 * Get canonical entity name using AI
 * Converts variations like "Huawei Technologies" → "huawei"
 */
const getCanonicalEntityName = async (entityName: string): Promise<string> => {
  try {
    // Import getCanonicalEntityNameAI from geminiService
    const { getCanonicalEntityNameAI } = await import('./geminiService');
    const canonical = await getCanonicalEntityNameAI(entityName);
    console.log(`🔤 Canonical name: "${entityName}" → "${canonical}"`);
    return canonical;
  } catch (error) {
    console.warn('Failed to get canonical name, using basic normalization:', error);
    // Fallback: basic normalization (lowercase, trim)
    return entityName.toLowerCase().trim();
  }
};

/**
 * Save user's stance on a specific entity
 * @param userId - The user's ID
 * @param entityName - The entity name (will be canonicalized using AI)
 * @param stance - SUPPORT or OPPOSE
 * @param reason - Optional reason for the stance
 */
export const saveEntityStance = async (
  userId: string,
  entityName: string,
  stance: 'SUPPORT' | 'OPPOSE',
  reason?: string
): Promise<void> => {
  // Get canonical entity name using AI
  const normalizedName = await getCanonicalEntityName(entityName);

  const stanceRef = doc(db, 'entityStances', userId, 'entities', normalizedName);

  const stanceData: EntityStance = {
    entityName: normalizedName,
    stance,
    reason: reason || undefined,
    timestamp: new Date().toISOString(),
    userId
  };

  await setDoc(stanceRef, stanceData);
  console.log(`✅ Saved entity stance: ${normalizedName} = ${stance}`);
};

/**
 * Get user's stance on a specific entity
 * @param userId - The user's ID
 * @param entityName - The entity name (normalized to lowercase)
 * @returns EntityStance if exists, null otherwise
 */
export const getEntityStance = async (
  userId: string,
  entityName: string
): Promise<EntityStance | null> => {
  const normalizedName = entityName.toLowerCase().trim();
  const stanceRef = doc(db, 'entityStances', userId, 'entities', normalizedName);

  const stanceSnap = await getDoc(stanceRef);

  if (stanceSnap.exists()) {
    return stanceSnap.data() as EntityStance;
  }

  return null;
};

/**
 * Get all entity stances for a user
 * @param userId - The user's ID
 * @returns Array of all entity stances
 */
export const getAllEntityStances = async (
  userId: string
): Promise<EntityStance[]> => {
  const entitiesRef = collection(db, 'entityStances', userId, 'entities');
  const snapshot = await getDocs(entitiesRef);

  return snapshot.docs.map(doc => doc.data() as EntityStance);
};

/**
 * Delete user's stance on a specific entity
 * @param userId - The user's ID
 * @param entityName - The entity name
 */
export const deleteEntityStance = async (
  userId: string,
  entityName: string
): Promise<void> => {
  const normalizedName = entityName.toLowerCase().trim();
  const stanceRef = doc(db, 'entityStances', userId, 'entities', normalizedName);
  await deleteDoc(stanceRef);
};

// ==================== User Location ====================
// Uses dedicated collection: userLocations/{userId}
// With history subcollection: userLocations/{userId}/history/{timestamp}
// Pattern: Main document stores current state, history stores all changes
// Similar to company_esg_by_ticker pattern

export type LocationStatus = 'granted' | 'denied' | 'unknown' | 'unavailable' | 'pending';

export interface StoredLocation {
  userId: string;
  status: LocationStatus;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  timestamp: string;
  errorMessage?: string;
  action?: 'granted' | 'denied' | 'cleared' | 'error';
  version?: string;
}

/**
 * Update user's location data in Firestore with history tracking
 * Structure: userLocations/{userId} (main doc) + userLocations/{userId}/history/{timestamp}
 *
 * Pattern (similar to company_esg_by_ticker):
 * 1. Save to history subcollection first (snapshot of current state)
 * 2. Update main document with latest data
 *
 * @param userId - The user's ID
 * @param locationData - Location data to store
 */
export const updateUserLocation = async (
  userId: string,
  locationData: Omit<StoredLocation, 'userId' | 'action' | 'version'>
): Promise<void> => {
  try {
    // Generate timestamp for history document ID
    const now = new Date();
    const timestamp_str = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];

    // Determine action based on status
    let action: StoredLocation['action'] = 'granted';
    if (locationData.status === 'denied') {
      action = 'denied';
    } else if (locationData.status === 'unknown' || locationData.status === 'unavailable') {
      action = 'error';
    }

    // Prepare data (exclude undefined values for Firestore)
    const dataToSave: Record<string, any> = {
      userId,
      status: locationData.status,
      deviceType: locationData.deviceType,
      browser: locationData.browser,
      timestamp: locationData.timestamp,
      action,
      version: '2.0'  // Version 2.0 with history tracking
    };

    // Only add optional fields if they have values
    if (locationData.latitude !== undefined) dataToSave.latitude = locationData.latitude;
    if (locationData.longitude !== undefined) dataToSave.longitude = locationData.longitude;
    if (locationData.accuracy !== undefined) dataToSave.accuracy = locationData.accuracy;
    if (locationData.errorMessage) dataToSave.errorMessage = locationData.errorMessage;

    // 1. Save to history first (snapshot)
    const historyRef = doc(db, 'userLocations', userId, 'history', timestamp_str);
    await setDoc(historyRef, dataToSave);
    console.log(`📍 Saved location history: userLocations/${userId}/history/${timestamp_str}`);

    // 2. Update main document (merge=true to preserve createdAt if exists)
    const mainRef = doc(db, 'userLocations', userId);
    await setDoc(mainRef, dataToSave, { merge: true });
    console.log(`📍 Updated main location: userLocations/${userId} (status=${locationData.status})`);

  } catch (error) {
    console.error(`📍 Error saving user location for ${userId}:`, error);
    throw error;
  }
};

/**
 * Get user's current location data (from main document)
 * @param userId - The user's ID
 * @returns StoredLocation if exists, null otherwise
 */
export const getUserLocation = async (
  userId: string
): Promise<StoredLocation | null> => {
  try {
    const locationRef = doc(db, 'userLocations', userId);
    const locationSnap = await getDoc(locationRef);

    if (locationSnap.exists()) {
      return locationSnap.data() as StoredLocation;
    }
    return null;
  } catch (error) {
    console.error(`📍 Error getting user location for ${userId}:`, error);
    return null;
  }
};

/**
 * Get user's location history
 * @param userId - The user's ID
 * @param limit - Maximum number of history entries to return (default: 10)
 * @returns Array of StoredLocation sorted by timestamp descending
 */
export const getUserLocationHistory = async (
  userId: string,
  limit: number = 10
): Promise<StoredLocation[]> => {
  try {
    const historyRef = collection(db, 'userLocations', userId, 'history');
    const querySnapshot = await getDocs(historyRef);

    const history: StoredLocation[] = [];
    querySnapshot.forEach((doc) => {
      history.push(doc.data() as StoredLocation);
    });

    // Sort by timestamp descending (most recent first)
    return history
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  } catch (error) {
    console.error(`📍 Error getting location history for ${userId}:`, error);
    return [];
  }
};

/**
 * Clear user's location data (when turning off location setting)
 * Saves a 'cleared' entry to history and updates main document
 * @param userId - The user's ID
 */
export const clearUserLocation = async (userId: string): Promise<void> => {
  try {
    const mainRef = doc(db, 'userLocations', userId);
    const existingDoc = await getDoc(mainRef);

    if (!existingDoc.exists()) {
      console.log(`📍 No location data to clear for ${userId}`);
      return;
    }

    const existingData = existingDoc.data();

    // Generate timestamp for history
    const now = new Date();
    const timestamp_str = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];

    // Prepare cleared data
    const clearedData: Record<string, any> = {
      userId,
      status: 'unknown',
      deviceType: existingData.deviceType || 'desktop',
      browser: existingData.browser || 'Unknown',
      timestamp: now.toISOString(),
      action: 'cleared',
      errorMessage: 'Location cleared by user',
      version: '2.0'
    };

    // 1. Save cleared state to history
    const historyRef = doc(db, 'userLocations', userId, 'history', timestamp_str);
    await setDoc(historyRef, clearedData);
    console.log(`📍 Saved cleared history: userLocations/${userId}/history/${timestamp_str}`);

    // 2. Update main document
    await setDoc(mainRef, clearedData, { merge: true });
    console.log(`📍 User location cleared: userLocations/${userId}`);

  } catch (error) {
    console.error(`📍 Error clearing user location for ${userId}:`, error);
    throw error;
  }
};

// ==================== User Notifications ====================
// Uses dedicated collection: userNotifications/{userId}
// With history subcollection: userNotifications/{userId}/history/{timestamp}
// Pattern: Main document stores current state, history stores all changes

export type NotificationStatus = 'granted' | 'denied' | 'default' | 'unsupported' | 'pending';

export interface StoredNotification {
  userId: string;
  status: NotificationStatus;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  timestamp: string;
  errorMessage?: string;
  action?: 'granted' | 'denied' | 'disabled' | 'error';
  version?: string;
}

/**
 * Update user's notification data in Firestore with history tracking
 * Structure: userNotifications/{userId} (main doc) + userNotifications/{userId}/history/{timestamp}
 *
 * @param userId - The user's ID
 * @param notificationData - Notification data to store
 */
export const updateUserNotification = async (
  userId: string,
  notificationData: Omit<StoredNotification, 'userId' | 'action' | 'version'>
): Promise<void> => {
  try {
    // Generate timestamp for history document ID
    const now = new Date();
    const timestamp_str = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];

    // Determine action based on status
    let action: StoredNotification['action'] = 'granted';
    if (notificationData.status === 'denied') {
      action = 'denied';
    } else if (notificationData.status === 'default' || notificationData.status === 'unsupported') {
      action = 'error';
    }

    // Prepare data (exclude undefined values for Firestore)
    const dataToSave: Record<string, any> = {
      userId,
      status: notificationData.status,
      deviceType: notificationData.deviceType,
      browser: notificationData.browser,
      timestamp: notificationData.timestamp,
      action,
      version: '1.0'
    };

    // Only add optional fields if they have values
    if (notificationData.errorMessage) dataToSave.errorMessage = notificationData.errorMessage;

    // 1. Save to history first (snapshot)
    const historyRef = doc(db, 'userNotifications', userId, 'history', timestamp_str);
    await setDoc(historyRef, dataToSave);
    console.log(`🔔 Saved notification history: userNotifications/${userId}/history/${timestamp_str}`);

    // 2. Update main document (merge=true to preserve createdAt if exists)
    const mainRef = doc(db, 'userNotifications', userId);
    await setDoc(mainRef, dataToSave, { merge: true });
    console.log(`🔔 Updated main notification: userNotifications/${userId} (status=${notificationData.status})`);

  } catch (error) {
    console.error(`🔔 Error saving user notification for ${userId}:`, error);
    throw error;
  }
};

/**
 * Get user's current notification data (from main document)
 * @param userId - The user's ID
 * @returns StoredNotification if exists, null otherwise
 */
export const getUserNotification = async (
  userId: string
): Promise<StoredNotification | null> => {
  try {
    const notificationRef = doc(db, 'userNotifications', userId);
    const notificationSnap = await getDoc(notificationRef);

    if (notificationSnap.exists()) {
      return notificationSnap.data() as StoredNotification;
    }
    return null;
  } catch (error) {
    console.error(`🔔 Error getting user notification for ${userId}:`, error);
    return null;
  }
};

/**
 * Clear user's notification data (when turning off notification setting)
 * Saves a 'disabled' entry to history and updates main document
 * @param userId - The user's ID
 */
export const clearUserNotification = async (userId: string): Promise<void> => {
  try {
    const mainRef = doc(db, 'userNotifications', userId);
    const existingDoc = await getDoc(mainRef);

    if (!existingDoc.exists()) {
      console.log(`🔔 No notification data to clear for ${userId}`);
      return;
    }

    const existingData = existingDoc.data();

    // Generate timestamp for history
    const now = new Date();
    const timestamp_str = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];

    // Prepare disabled data
    const disabledData: Record<string, any> = {
      userId,
      status: 'default',
      deviceType: existingData.deviceType || 'desktop',
      browser: existingData.browser || 'Unknown',
      timestamp: now.toISOString(),
      action: 'disabled',
      errorMessage: 'Notifications disabled by user',
      version: '1.0'
    };

    // 1. Save disabled state to history
    const historyRef = doc(db, 'userNotifications', userId, 'history', timestamp_str);
    await setDoc(historyRef, disabledData);
    console.log(`🔔 Saved disabled history: userNotifications/${userId}/history/${timestamp_str}`);

    // 2. Update main document
    await setDoc(mainRef, disabledData, { merge: true });
    console.log(`🔔 User notification disabled: userNotifications/${userId}`);

  } catch (error) {
    console.error(`🔔 Error clearing user notification for ${userId}:`, error);
    throw error;
  }
};
