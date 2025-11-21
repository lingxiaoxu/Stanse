import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { PoliticalCoordinates, BrandAlignment, OnboardingAnswers } from '../types';

// User Profile
export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  coordinates: PoliticalCoordinates;
  onboarding?: OnboardingAnswers;
  hasCompletedOnboarding: boolean;
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
