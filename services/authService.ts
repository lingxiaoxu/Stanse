import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  TwitterAuthProvider,
  OAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  getAdditionalUserInfo,
  deleteUser,
  User
} from 'firebase/auth';
import { collection, getCountFromServer, doc, getDoc, setDoc, deleteDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { createUserProfile, getUserProfile } from './userService';
import { PoliticalCoordinates, SocialPlatform } from '../types';

// Maximum number of users allowed (waitlist mode after this)
const MAX_USERS = 200;

// Default coordinates for new users
const DEFAULT_COORDINATES: PoliticalCoordinates = {
  economic: 0,
  social: 0,
  diplomatic: 0,
  label: 'Uncalibrated'
};

// Check if registration is open (under user limit)
export const checkRegistrationOpen = async (): Promise<{ open: boolean; count: number }> => {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getCountFromServer(usersRef);
    const count = snapshot.data().count;
    return { open: count < MAX_USERS, count };
  } catch (error) {
    console.error('Error checking user count:', error);
    // Allow registration if check fails
    return { open: true, count: 0 };
  }
};

// Email/Password Sign Up
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<User> => {
  // Check if registration is open
  const { open, count } = await checkRegistrationOpen();
  if (!open) {
    throw new Error(`WAITLIST:${count}`);
  }

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
    // Check if registration is open for new Google users
    const { open, count } = await checkRegistrationOpen();
    if (!open) {
      // Sign out the user since they can't register
      await signOut(auth);
      throw new Error(`WAITLIST:${count}`);
    }

    await createUserProfile(
      user.uid,
      user.email || '',
      DEFAULT_COORDINATES
    );
  }

  return user;
};

// Twitter/X Sign In
export const signInWithTwitter = async (): Promise<User> => {
  const provider = new TwitterAuthProvider();
  const userCredential = await signInWithPopup(auth, provider);
  const user = userCredential.user;

  // Try to get Twitter username from additional user info
  const additionalInfo = getAdditionalUserInfo(userCredential);

  // Check if user profile exists, create if not
  const profile = await getUserProfile(user.uid);
  if (!profile) {
    // Check if registration is open for new Twitter users
    const { open, count } = await checkRegistrationOpen();
    if (!open) {
      // Sign out the user since they can't register
      await signOut(auth);
      throw new Error(`WAITLIST:${count}`);
    }

    // Try to get Twitter username from additionalInfo
    const twitterUsername = (additionalInfo?.profile as any)?.screen_name;

    // Clean displayName to create username-like identifier
    // Prefer screen_name, fallback to cleaned displayName
    let twitterHandle: string;
    if (twitterUsername) {
      twitterHandle = twitterUsername.toLowerCase();
    } else if (user.displayName) {
      twitterHandle = user.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
    } else {
      twitterHandle = 'twitter_user';
    }

    // Generate email: prefer real email, then use Twitter handle
    const twitterEmail = user.email || `${twitterHandle}@twitter.user`;

    await createUserProfile(
      user.uid,
      twitterEmail,
      DEFAULT_COORDINATES,
      user.displayName || undefined,  // Store original Twitter displayName
      twitterUsername || undefined    // Store Twitter screen_name for auto-populating social media handle
    );

    // Auto-connect Twitter social media for new Twitter users
    if (twitterUsername) {
      try {
        const { connectSocialMedia } = await import('./userService');
        await connectSocialMedia(user.uid, SocialPlatform.TWITTER, twitterUsername, {
          displayName: user.displayName || undefined,
          profileUrl: `https://twitter.com/${twitterUsername}`
        });
        console.log(`✅ Auto-connected Twitter: @${twitterUsername}`);
      } catch (error) {
        console.error('Failed to auto-connect Twitter:', error);
        // Don't throw - user profile is created, just social connection failed
      }
    }
  }

  return user;
};

// Apple Sign In
export const signInWithApple = async (): Promise<User> => {
  const provider = new OAuthProvider('apple.com');
  const userCredential = await signInWithPopup(auth, provider);
  const user = userCredential.user;

  // Check if user profile exists, create if not
  const profile = await getUserProfile(user.uid);
  if (!profile) {
    // Check if registration is open for new Apple users
    const { open, count } = await checkRegistrationOpen();
    if (!open) {
      // Sign out the user since they can't register
      await signOut(auth);
      throw new Error(`WAITLIST:${count}`);
    }

    // Priority: real email > displayName@apple.user
    let appleEmail: string;
    if (user.email) {
      appleEmail = user.email;
    } else if (user.displayName) {
      appleEmail = `${user.displayName.replace(/[^a-zA-Z0-9]/g, '_')}@apple.user`;
    } else {
      appleEmail = 'apple_user@apple.user';  // Fallback
    }

    await createUserProfile(
      user.uid,
      appleEmail,
      DEFAULT_COORDINATES,
      user.displayName || undefined  // Store Apple displayName
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

// Subcollections to transfer when deleting account
const USER_SUBCOLLECTIONS = [
  'chatHistory',
  'ember_cost_sessions',
  'market_analysis_cache',
  'users_countries_locations'
];

// Delete Account - Transfer data to users_deleted and remove from Authentication
export const deleteAccount = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No authenticated user found');
  }

  const userId = user.uid;
  console.log(`[authService] Starting account deletion for user ${userId}`);

  try {
    // Step 1: Get the user's main document
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      console.warn(`[authService] User document not found for ${userId}, proceeding with auth deletion`);
    }

    // Step 2: Prepare the deleted user document
    const deletedUserDocRef = doc(db, 'users_deleted', userId);
    const deletionTimestamp = new Date().toISOString();

    // Copy main user document to users_deleted
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      await setDoc(deletedUserDocRef, {
        ...userData,
        deletedAt: deletionTimestamp,
        deletedAtServer: serverTimestamp(),
        originalUserId: userId
      });
      console.log(`[authService] Transferred main user document to users_deleted`);
    }

    // Step 3: Transfer all subcollections
    for (const subcollectionName of USER_SUBCOLLECTIONS) {
      try {
        const subcollectionRef = collection(db, 'users', userId, subcollectionName);
        const subcollectionSnap = await getDocs(subcollectionRef);

        if (!subcollectionSnap.empty) {
          console.log(`[authService] Transferring ${subcollectionSnap.size} docs from ${subcollectionName}`);

          // Copy each document to users_deleted subcollection
          for (const docSnap of subcollectionSnap.docs) {
            const targetDocRef = doc(db, 'users_deleted', userId, subcollectionName, docSnap.id);
            await setDoc(targetDocRef, {
              ...docSnap.data(),
              _transferredAt: deletionTimestamp
            });
          }

          // Delete original documents from subcollection
          for (const docSnap of subcollectionSnap.docs) {
            await deleteDoc(doc(db, 'users', userId, subcollectionName, docSnap.id));
          }
          console.log(`[authService] Deleted ${subcollectionSnap.size} docs from ${subcollectionName}`);
        }
      } catch (subcollectionError) {
        console.error(`[authService] Error processing subcollection ${subcollectionName}:`, subcollectionError);
        // Continue with other subcollections
      }
    }

    // Step 4: Delete the main user document from users collection
    if (userDocSnap.exists()) {
      await deleteDoc(userDocRef);
      console.log(`[authService] Deleted main user document from users collection`);
    }

    // Step 5: Delete the user from Firebase Authentication
    await deleteUser(user);
    console.log(`[authService] Deleted user from Firebase Authentication`);

    console.log(`[authService] Account deletion completed for user ${userId}`);
  } catch (error: any) {
    console.error('[authService] Error deleting account:', error);

    // Check if it's a re-authentication required error
    if (error.code === 'auth/requires-recent-login') {
      throw new Error('REQUIRES_RECENT_LOGIN');
    }

    throw error;
  }
};
