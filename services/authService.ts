import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  User
} from 'firebase/auth';
import { auth } from './firebase';
import { createUserProfile, getUserProfile } from './userService';
import { PoliticalCoordinates } from '../types';

// Default coordinates for new users
const DEFAULT_COORDINATES: PoliticalCoordinates = {
  economic: 0,
  social: 0,
  diplomatic: 0,
  label: 'Uncalibrated'
};

// Email/Password Sign Up
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<User> => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Update display name if provided
  if (displayName) {
    await updateProfile(user, { displayName });
  }

  // Create user profile in Firestore
  await createUserProfile(user.uid, email, DEFAULT_COORDINATES);

  return user;
};

// Email/Password Sign In
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<User> => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

// Google Sign In
export const signInWithGoogle = async (): Promise<User> => {
  const provider = new GoogleAuthProvider();
  const userCredential = await signInWithPopup(auth, provider);
  const user = userCredential.user;

  // Check if user profile exists, create if not
  const profile = await getUserProfile(user.uid);
  if (!profile) {
    await createUserProfile(
      user.uid,
      user.email || '',
      DEFAULT_COORDINATES
    );
  }

  return user;
};

// Sign Out
export const logOut = async (): Promise<void> => {
  await signOut(auth);
};

// Password Reset
export const resetPassword = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email);
};

// Auth State Observer
export const subscribeToAuthState = (
  callback: (user: User | null) => void
): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

// Get Current User
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};
