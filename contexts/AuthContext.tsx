import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  subscribeToAuthState,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithTwitter,
  signInWithApple,
  logOut,
  resetPassword,
  deleteAccount as deleteAccountService
} from '../services/authService';
import { getUserProfile, updateUserCoordinates, saveOnboardingAnswers, resetUserOnboarding, UserProfile } from '../services/userService';
import { PoliticalCoordinates, OnboardingAnswers } from '../types';
import { calculateCoordinatesFromOnboarding } from '../services/geminiService';
import {
  registerUser,
  startHeartbeat,
  stopHeartbeat,
  setupVisibilityListener,
  setupBeforeUnloadListener
} from '../services/userActionService';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean;
  demoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInTwitter: () => Promise<void>;
  signInApple: () => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateCoordinates: (coords: PoliticalCoordinates) => Promise<void>;
  completeOnboarding: (answers: OnboardingAnswers, language?: string) => Promise<PoliticalCoordinates>;
  resetOnboarding: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Heartbeat management
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const visibilityCleanupRef = useRef<(() => void) | null>(null);
  const beforeUnloadCleanupRef = useRef<(() => void) | null>(null);

  // Demo Mode state - persists in localStorage
  const [demoMode, setDemoModeState] = useState<boolean>(() => {
    const saved = localStorage.getItem('stanse_demo_mode');
    return saved !== null ? JSON.parse(saved) : true; // Default to ON
  });

  const setDemoMode = (enabled: boolean) => {
    setDemoModeState(enabled);
    localStorage.setItem('stanse_demo_mode', JSON.stringify(enabled));
  };

  // Subscribe to auth state changes
  useEffect(() => {
    // Set maximum loading time to 3 seconds
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Fetch user profile from Firestore
        try {
          const profile = await getUserProfile(firebaseUser.uid);
          setUserProfile(profile);
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      } else {
        setUserProfile(null);
      }

      clearTimeout(loadingTimeout);
      setLoading(false);
    });

    return () => {
      clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, []);

  // Manage heartbeat lifecycle based on user and onboarding status
  useEffect(() => {
    // Cleanup function to stop heartbeat
    const cleanup = () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (visibilityCleanupRef.current) {
        visibilityCleanupRef.current();
        visibilityCleanupRef.current = null;
      }
      if (beforeUnloadCleanupRef.current) {
        beforeUnloadCleanupRef.current();
        beforeUnloadCleanupRef.current = null;
      }
    };

    // Start heartbeat if user is logged in and has completed onboarding
    if (user?.uid && userProfile?.hasCompletedOnboarding && userProfile?.coordinates) {
      console.log('🚀 Starting Polis Protocol heartbeat for user:', user.uid);

      // Prepare user profile data for auto-reregistration
      const profileData = {
        coordinates: userProfile.coordinates,
        displayName: user.displayName || user.email?.split('@')[0] || 'User'
      };

      // Start heartbeat interval
      heartbeatIntervalRef.current = startHeartbeat(user.uid, profileData);

      // Setup visibility listener
      visibilityCleanupRef.current = setupVisibilityListener(user.uid, profileData);

      // Setup beforeunload listener
      beforeUnloadCleanupRef.current = setupBeforeUnloadListener(user.uid);
    } else {
      // Stop heartbeat if user logs out or hasn't completed onboarding
      cleanup();
    }

    // Cleanup on unmount or when user/profile changes
    return cleanup;
  }, [user?.uid, userProfile?.hasCompletedOnboarding]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const emailUser = await signInWithEmail(email, password);
      // Fetch user profile immediately after successful login
      if (emailUser) {
        try {
          const profile = await getUserProfile(emailUser.uid);
          setUserProfile(profile);
        } catch (err) {
          console.error('Error fetching user profile after email login:', err);
        }
      }
    } catch (err: any) {
      const errorCode = err.code || '';

      // Map specific error codes to user-friendly messages
      switch (errorCode) {
        case 'auth/user-not-found':
          setError('No account found with this email. Please sign up first.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password. Please try again.');
          break;
        case 'auth/invalid-credential':
          setError('Incorrect email or password. Please try again.');
          break;
        case 'auth/invalid-email':
          setError('Invalid email address format.');
          break;
        case 'auth/user-disabled':
          setError('This account has been disabled. Please contact support.');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please wait a few minutes and try again.');
          break;
        default:
          const cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign in';
          setError(cleanMessage);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    setError(null);
    setLoading(true);
    try {
      const newUser = await signUpWithEmail(email, password, displayName);
      // Fetch user profile immediately after successful signup
      if (newUser) {
        try {
          const profile = await getUserProfile(newUser.uid);
          setUserProfile(profile);
        } catch (err) {
          console.error('Error fetching user profile after signup:', err);
        }
      }
    } catch (err: any) {
      // Check if waitlist mode (registration closed)
      if (err.message?.startsWith('WAITLIST:')) {
        setError('Due to overwhelming demand, we are temporarily not accepting new registrations. You are in queue. Please try again later.');
        throw err;
      }

      // Check if error is network-related (likely Great Firewall blocking Firebase)
      const isNetworkError = err.code === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS');

      if (isNetworkError) {
        setError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else {
        // Map specific error codes to user-friendly messages
        const errorCode = err.code || '';
        switch (errorCode) {
          case 'auth/email-already-in-use':
            setError('This email is already registered. Try signing in instead.');
            break;
          case 'auth/weak-password':
            setError('Password should be at least 6 characters.');
            break;
          case 'auth/invalid-email':
            setError('Invalid email address format.');
            break;
          case 'auth/operation-not-allowed':
            setError('Email/password sign up is currently disabled.');
            break;
          default:
            const cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign up';
            setError(cleanMessage);
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const googleUser = await signInWithGoogle();
      // Fetch user profile immediately after successful login
      // This ensures authUserProfile is available for tour check
      if (googleUser) {
        try {
          const profile = await getUserProfile(googleUser.uid);
          setUserProfile(profile);
        } catch (err) {
          console.error('Error fetching user profile after Google login:', err);
        }
      }
    } catch (err: any) {
      // Check if waitlist mode (registration closed)
      if (err.message?.startsWith('WAITLIST:')) {
        setError('Due to overwhelming demand, we are temporarily not accepting new registrations. You are in queue. Please try again later. 由于需求量激增，暂时不接受新注册。您已在排队中，请稍后再试。');
        throw err;
      }

      // Check if error is network-related (likely Great Firewall blocking Firebase)
      const isNetworkError = err.code === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS');

      if (isNetworkError) {
        setError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else {
        // Map specific error codes to user-friendly messages
        const errorCode = err.code || '';
        switch (errorCode) {
          case 'auth/popup-closed-by-user':
            setError('Sign-in cancelled. Please try again.');
            break;
          case 'auth/popup-blocked':
            setError('Pop-up blocked. Please allow pop-ups for this site.');
            break;
          case 'auth/cancelled-popup-request':
            setError('Sign-in cancelled. Please try again.');
            break;
          case 'auth/account-exists-with-different-credential':
            setError('An account already exists with this email using a different sign-in method.');
            break;
          default:
            const cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign in with Google';
            setError(cleanMessage);
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInTwitter = async () => {
    setError(null);
    setLoading(true);
    try {
      const twitterUser = await signInWithTwitter();
      if (twitterUser) {
        try {
          const profile = await getUserProfile(twitterUser.uid);
          setUserProfile(profile);
        } catch (err) {
          console.error('Error fetching user profile after Twitter login:', err);
        }
      }
    } catch (err: any) {
      if (err.message?.startsWith('WAITLIST:')) {
        setError('Due to overwhelming demand, we are temporarily not accepting new registrations. You are in queue. Please try again later.');
        throw err;
      }

      const isNetworkError = err.code === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS');

      if (isNetworkError) {
        setError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else {
        const errorCode = err.code || '';
        switch (errorCode) {
          case 'auth/popup-closed-by-user':
            setError('Sign-in cancelled. Please try again.');
            break;
          case 'auth/popup-blocked':
            setError('Pop-up blocked. Please allow pop-ups for this site.');
            break;
          default:
            const cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign in with Twitter';
            setError(cleanMessage);
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInApple = async () => {
    setError(null);
    setLoading(true);
    try {
      const appleUser = await signInWithApple();
      if (appleUser) {
        try {
          const profile = await getUserProfile(appleUser.uid);
          setUserProfile(profile);
        } catch (err) {
          console.error('Error fetching user profile after Apple login:', err);
        }
      }
    } catch (err: any) {
      if (err.message?.startsWith('WAITLIST:')) {
        setError('Due to overwhelming demand, we are temporarily not accepting new registrations. You are in queue. Please try again later.');
        throw err;
      }

      const isNetworkError = err.code === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS');

      if (isNetworkError) {
        setError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else {
        const errorCode = err.code || '';
        switch (errorCode) {
          case 'auth/popup-closed-by-user':
            setError('Sign-in cancelled. Please try again.');
            break;
          case 'auth/popup-blocked':
            setError('Pop-up blocked. Please allow pop-ups for this site.');
            break;
          default:
            const cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign in with Apple';
            setError(cleanMessage);
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setError(null);
    try {
      // Send offline status before logging out
      if (user?.uid && heartbeatIntervalRef.current) {
        await stopHeartbeat(user.uid, heartbeatIntervalRef.current);
      }

      // Clear presence from RTDB
      if (user?.uid) {
        const { rtdb } = await import('../services/firebase');
        const { ref, remove } = await import('firebase/database');
        const presenceRef = ref(rtdb, `presence/${user.uid}`);
        await remove(presenceRef).catch(err => {
          console.warn('[Logout] Failed to clear presence:', err);
        });
        console.log('[Logout] Cleared presence for user:', user.uid);
      }

      await logOut();
      setUserProfile(null);
    } catch (err: any) {
      setError(err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to log out');
      throw err;
    }
  };

  const sendPasswordReset = async (email: string) => {
    setError(null);
    try {
      await resetPassword(email);
    } catch (err: any) {
      setError(err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to send password reset email');
      throw err;
    }
  };

  const updateCoordinates = async (coords: PoliticalCoordinates) => {
    if (!user) return;
    setError(null);
    try {
      await updateUserCoordinates(user.uid, coords);
      setUserProfile((prev) =>
        prev ? { ...prev, coordinates: coords } : null
      );
    } catch (err: any) {
      setError(err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to update coordinates');
      throw err;
    }
  };

  const completeOnboarding = async (answers: OnboardingAnswers, language: string = 'en'): Promise<PoliticalCoordinates> => {
    if (!user) throw new Error('User not authenticated');
    setError(null);

    try {
      // Calculate coordinates using AI with language support for persona label
      const coordinates = await calculateCoordinatesFromOnboarding(answers, language);

      // Save to Firestore
      await saveOnboardingAnswers(user.uid, answers, coordinates);

      // Register user with Polis Protocol backend
      try {
        await registerUser(
          user.uid,
          user.displayName || user.email?.split('@')[0] || 'User',
          coordinates
        );
        console.log('✅ User registered with Polis Protocol');
      } catch (polisErr) {
        console.error('⚠️ Failed to register with Polis Protocol:', polisErr);
        // Don't throw - allow onboarding to complete even if Polis registration fails
      }

      // Generate persona embedding in background (fire-and-forget)
      // Force regeneration since user completed/resubmitted onboarding
      try {
        const { generateAndSavePersonaEmbedding } = await import('../services/userPersonaService');
        console.log('[PersonaEmbedding] Starting background generation (force=true)...');
        generateAndSavePersonaEmbedding(
          user.uid,
          answers,
          coordinates,
          2,      // maxRetries
          true    // forceRegenerate - always regenerate on onboarding completion
        ).catch(embeddingErr => {
          console.error('[PersonaEmbedding] ❌ Background generation failed:', embeddingErr);
        });
      } catch (importErr) {
        console.error('[PersonaEmbedding] ❌ Failed to import persona service:', importErr);
      }

      // Update local state
      setUserProfile((prev) =>
        prev ? {
          ...prev,
          coordinates,
          onboarding: answers,
          hasCompletedOnboarding: true
        } : null
      );

      return coordinates;
    } catch (err: any) {
      setError(err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to complete onboarding');
      throw err;
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
    } catch (err) {
      console.error('Error refreshing profile:', err);
    }
  };

  const resetOnboarding = async () => {
    if (!user) throw new Error('User not authenticated');
    setError(null);
    try {
      await resetUserOnboarding(user.uid);
      // Update local state to reflect reset
      setUserProfile((prev) =>
        prev ? {
          ...prev,
          hasCompletedOnboarding: false,
          onboarding: undefined,
          coordinates: {
            economic: 0,
            social: 0,
            diplomatic: 0,
            label: 'Uncalibrated'
          }
        } : null
      );
    } catch (err: any) {
      setError(err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to reset onboarding');
      throw err;
    }
  };

  const clearError = () => setError(null);

  const deleteAccount = async () => {
    setError(null);
    try {
      // Stop heartbeat before deletion
      if (user?.uid && heartbeatIntervalRef.current) {
        await stopHeartbeat(user.uid, heartbeatIntervalRef.current);
      }

      // Clear presence from RTDB
      if (user?.uid) {
        const { rtdb } = await import('../services/firebase');
        const { ref, remove } = await import('firebase/database');
        const presenceRef = ref(rtdb, `presence/${user.uid}`);
        await remove(presenceRef).catch(err => {
          console.warn('[DeleteAccount] Failed to clear presence:', err);
        });
      }

      // Delete account (transfers data to users_deleted, then deletes from Auth)
      await deleteAccountService();

      // Clear local state
      setUserProfile(null);
      setUser(null);
    } catch (err: any) {
      if (err.message === 'REQUIRES_RECENT_LOGIN') {
        setError('For security reasons, please log out and log back in before deleting your account.');
      } else {
        setError(err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to delete account');
      }
      throw err;
    }
  };

  const value: AuthContextType = {
    user,
    userProfile,
    loading,
    error,
    hasCompletedOnboarding: userProfile?.hasCompletedOnboarding ?? false,
    demoMode,
    setDemoMode,
    signIn,
    signUp,
    signInGoogle,
    signInTwitter,
    signInApple,
    logout,
    sendPasswordReset,
    updateCoordinates,
    completeOnboarding,
    resetOnboarding,
    deleteAccount,
    clearError,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
