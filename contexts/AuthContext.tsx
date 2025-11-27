import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  subscribeToAuthState,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  logOut,
  resetPassword
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
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateCoordinates: (coords: PoliticalCoordinates) => Promise<void>;
  completeOnboarding: (answers: OnboardingAnswers, language?: string) => Promise<PoliticalCoordinates>;
  resetOnboarding: () => Promise<void>;
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
      await signInWithEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    setError(null);
    setLoading(true);
    try {
      await signUpWithEmail(email, password, displayName);
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
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

      await logOut();
      setUserProfile(null);
    } catch (err: any) {
      setError(err.message || 'Failed to log out');
      throw err;
    }
  };

  const sendPasswordReset = async (email: string) => {
    setError(null);
    try {
      await resetPassword(email);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
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
      setError(err.message || 'Failed to update coordinates');
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
      setError(err.message || 'Failed to complete onboarding');
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
      setError(err.message || 'Failed to reset onboarding');
      throw err;
    }
  };

  const clearError = () => setError(null);

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
    logout,
    sendPasswordReset,
    updateCoordinates,
    completeOnboarding,
    resetOnboarding,
    clearError,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
