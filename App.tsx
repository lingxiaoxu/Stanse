
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, PoliticalCoordinates, BrandAlignment } from './types';
import { FECCompanyData } from './services/fecService';
import { Compass, Search, Newspaper, Users, Menu } from 'lucide-react';
import { SenseView } from './components/views/SenseView';
import { FingerprintView } from './components/views/FingerprintView';
import { FeedView } from './components/views/FeedView';
import { UnionView } from './components/views/ImpactView';
import { LoginView } from './components/views/LoginView';
import { ManifestoView } from './components/views/ManifestoView';
import { PrivacyView } from './components/views/PrivacyView';
import { SettingsView } from './components/views/SettingsView';
import { AccountView } from './components/views/AccountView';
import { AboutUsView } from './components/views/AboutUsView';
import { MenuOverlay } from './components/ui/MenuOverlay';
import { AppTour } from './components/ui/AppTour';
import { SplashVideo } from './components/ui/SplashVideo';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppStateProvider } from './contexts/AppStateContext';
import { recalibrateWithEntityFeedback } from './services/agents/stanceAgent';
import { getTourSteps } from './data/tourSteps';
import { markTourCompleted } from './services/userService';
import { setUserOnline } from './services/presenceService';
import { recoverUserState } from './services/matchRecoveryService';
import { startBreakingNewsListener, stopBreakingNewsListener } from './services/breakingNewsService';
import { checkNotificationPermission } from './services/notificationService';
import { testCollectionLinking, cleanAllNews } from './utils/testCollectionLinking';
import { testLanguageSwitch, compareLanguages } from './utils/testLanguageSwitch';
import { checkRSSStatus, testRSSNow } from './utils/monitorRSS';

// Initial mock state for user profile (used as fallback)
const INITIAL_PROFILE: PoliticalCoordinates = {
  economic: 0,
  social: 0,
  diplomatic: 0,
  label: 'Uncalibrated',
};

const StanseApp: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.FEED);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const { t, language } = useLanguage();
  const { user, userProfile: authUserProfile, logout, loading, updateCoordinates, hasCompletedOnboarding } = useAuth();

  // Use profile from Firebase or fallback to initial
  const userProfile = authUserProfile?.coordinates || INITIAL_PROFILE;

  // Persist SENSE report across tab switches
  const [senseResult, setSenseResult] = useState<BrandAlignment | null>(null);
  const [senseQuery, setSenseQuery] = useState('');
  const [senseFecData, setSenseFecData] = useState<FECCompanyData | null>(null);

  // Note: We intentionally do NOT clear the sense report when coordinates change.
  // The report should persist until the user manually searches again.
  // This allows the user to compare how their stance affects the score.

  // Track tour check state to prevent retriggering when authUserProfile updates
  const tourCheckRef = useRef<{ userId: string; language: string; checked: boolean } | null>(null);

  // Track user online presence and recover state
  useEffect(() => {
    if (user) {
      console.log('[App] Setting up presence for user:', user.uid, authUserProfile?.coordinates);

      // Recover any abandoned state first
      recoverUserState(user.uid).catch(err => {
        console.warn('[App] State recovery failed:', err);
      });

      // Set user online and track activity
      const cleanup = setUserOnline(user.uid, {
        email: user.email || undefined,
        personaLabel: authUserProfile?.coordinates?.label || 'Unknown',
        stanceType: authUserProfile?.coordinates?.nationalityPrefix || 'Unknown',
        coreStanceType: authUserProfile?.coordinates?.coreStanceType
      });

      return cleanup;
    }
  }, [user, authUserProfile]);

  // Start breaking news listener if notifications are enabled
  useEffect(() => {
    if (user) {
      // Check if user has granted notification permission
      const notificationPermission = checkNotificationPermission();

      if (notificationPermission === 'granted') {
        console.log('🔔 Starting breaking news listener');
        startBreakingNewsListener(user.uid);

        return () => {
          console.log('🔕 Stopping breaking news listener');
          stopBreakingNewsListener();
        };
      } else {
        console.log('🔕 Notifications not granted, skipping breaking news listener');
      }
    }
  }, [user]);

  // Expose test functions to window for browser console testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).testCollectionLinking = testCollectionLinking;
      (window as any).testLanguageSwitch = testLanguageSwitch;
      (window as any).compareLanguages = compareLanguages;
      (window as any).cleanAllNews = cleanAllNews;
      (window as any).checkRSSStatus = checkRSSStatus;
      (window as any).testRSSNow = testRSSNow;
      console.log('🧪 Test functions available:');
      console.log('   - window.testCollectionLinking()');
      console.log('   - window.testLanguageSwitch(\'ja\')');
      console.log('   - window.compareLanguages()');
      console.log('   - window.cleanAllNews()');
      console.log('   - window.checkRSSStatus()');
      console.log('   - window.testRSSNow(\'en\')');
    }
  }, []);

  // Check if tour should be shown after login
  useEffect(() => {
    const checkTour = async () => {
      // Wait for splash video to complete before showing tour
      if (showSplash) {
        return;
      }

      if (user && authUserProfile) {
        // Create a unique key for this user + language combination
        const checkKey = `${user.uid}-${language}`;
        const prevCheckKey = tourCheckRef.current ? `${tourCheckRef.current.userId}-${tourCheckRef.current.language}` : null;

        // Only check tour if we haven't checked for this user+language combo yet
        // or if the user/language changed
        if (!tourCheckRef.current?.checked || checkKey !== prevCheckKey) {
          // Check if user has seen tour in current language
          const hasSeenInCurrentLang = authUserProfile.tourCompleted?.[language] || false;

          if (!hasSeenInCurrentLang) {
            // Small delay to ensure UI is ready
            setTimeout(() => {
              setShowTour(true);
            }, 500);
          }

          // Mark this user+language combo as checked
          tourCheckRef.current = {
            userId: user.uid,
            language: language,
            checked: true
          };
        }
      } else {
        // Reset check when user logs out
        tourCheckRef.current = null;
      }
    };

    checkTour();
  }, [user, authUserProfile, language, showSplash]);

  const handleLogin = () => {
    setView(ViewState.FEED);
  };

  const handleTourComplete = async () => {
    if (user) {
      try {
        await markTourCompleted(user.uid, language);
        setShowTour(false);

        // Reset tour check ref to allow checking again for other languages
        if (tourCheckRef.current) {
          tourCheckRef.current.checked = true;
        }

        // Navigate to Stance tab after 1 second
        setTimeout(() => {
          setView(ViewState.FINGERPRINT);
        }, 1000);
      } catch (error) {
        console.error('Failed to mark tour as completed:', error);
        setShowTour(false); // Close anyway

        // Still navigate to Stance tab even if save failed
        setTimeout(() => {
          setView(ViewState.FINGERPRINT);
        }, 1000);
      }
    }
  };

  const handleTourSkip = async () => {
    // Mark as completed even if skipped (so it doesn't show again)
    if (user) {
      try {
        await markTourCompleted(user.uid, language);
      } catch (error) {
        console.error('Failed to mark tour as skipped:', error);
      }
    }
    setShowTour(false);
  };

  const handleLogout = async () => {
    await logout();
    setIsMenuOpen(false);
    setView(ViewState.FEED);
  };

  // Handle entity recalibration from SenseView
  const handleRecalibrate = async (entityName: string, stance: 'SUPPORT' | 'OPPOSE', reason?: string) => {
    if (!userProfile || !user?.uid) return;

    try {
      // Save explicit entity stance to Firebase
      const { saveEntityStance } = await import('./services/userService');
      await saveEntityStance(user.uid, entityName, stance, reason);
      console.log(`✅ Entity stance saved: ${entityName} = ${stance}`);

      // Recalibrate user coordinates based on feedback
      const newCoords = await recalibrateWithEntityFeedback(userProfile, entityName, stance, reason);
      await updateCoordinates(newCoords);
    } catch (error) {
      console.error('Recalibration failed:', error);
      throw error;
    }
  };

  // Show splash video on first load - BEFORE any other loading states
  if (showSplash) {
    return <SplashVideo onComplete={() => setShowSplash(false)} />;
  }

  // Show loading state - match SplashVideo loading indicator exactly
  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center">
        <div className="font-pixel text-5xl text-white mb-4">STANSE</div>
        <div className="font-mono text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case ViewState.FEED:
        return <FeedView />;
      case ViewState.SENSE:
        // Extract demographics for country-aware analysis
        const demographics = authUserProfile?.onboarding?.demographics;
        return (
          <SenseView
            userProfile={userProfile}
            userDemographics={demographics ? {
              birthCountry: demographics.birthCountry,
              currentCountry: demographics.currentCountry
            } : undefined}
            onNavigate={setView}
            onRecalibrate={handleRecalibrate}
            persistedResult={senseResult}
            onResultChange={setSenseResult}
            persistedQuery={senseQuery}
            onQueryChange={setSenseQuery}
            persistedFecData={senseFecData}
            onFecDataChange={setSenseFecData}
          />
        );
      case ViewState.FINGERPRINT:
        return <FingerprintView coords={userProfile} isTourActive={showTour} />;
      case ViewState.UNION:
        return <UnionView />;
      case ViewState.MANIFESTO:
        return <ManifestoView />;
      case ViewState.PRIVACY:
        return <PrivacyView />;
      case ViewState.SETTINGS:
        return <SettingsView />;
      case ViewState.ACCOUNT:
        return <AccountView />;
      case ViewState.ABOUT_US:
        return <AboutUsView />;
      default:
        return <FeedView />;
    }
  };

  // If not authenticated, show Login Screen
  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  // If authenticated, show App Structure
  return (
    <div className="min-h-screen text-pixel-black font-mono selection:bg-black selection:text-white">
      {/* Menu Overlay */}
      <MenuOverlay 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)} 
        onNavigate={(v) => setView(v)}
        onLogout={handleLogout}
      />

      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-pixel-white/95 backdrop-blur-md border-b-2 border-pixel-black px-4 promax:px-6 py-4 flex justify-between items-center transition-all">
        <div 
          className="font-pixel text-4xl tracking-widest cursor-pointer hover:opacity-70" 
          onClick={() => setView(ViewState.FEED)}
        >
          STANSE
        </div>
        <button
          className="p-2 active:scale-95 transition-transform hover:bg-gray-200 border-2 border-transparent hover:border-pixel-black rounded-none"
          onClick={() => setIsMenuOpen(true)}
          data-tour-id="menu-button"
        >
          <Menu className="w-6 h-6 promax:w-8 promax:h-8" />
        </button>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 promax:px-6 py-8 max-w-lg promax:max-w-xl mb-24">
        <div className="animate-fade-in">
          {renderView()}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-pixel-black z-50 pb-safe safe-area-pb">
        <div className="flex justify-around items-center h-16 promax:h-20 max-w-lg promax:max-w-xl mx-auto">
          <NavButton
            icon={<Newspaper size={24} className="promax:w-7 promax:h-7" />}
            label={t('nav', 'feed')}
            isActive={view === ViewState.FEED}
            onClick={() => setView(ViewState.FEED)}
            tourId="feed-tab"
          />
          <NavButton
            icon={<Search size={24} className="promax:w-7 promax:h-7" />}
            label={t('nav', 'sense')}
            isActive={view === ViewState.SENSE}
            onClick={() => setView(ViewState.SENSE)}
            tourId="sense-tab"
          />
          <NavButton
            icon={<Compass size={24} className="promax:w-7 promax:h-7" />}
            label={t('nav', 'stance')}
            isActive={view === ViewState.FINGERPRINT}
            onClick={() => setView(ViewState.FINGERPRINT)}
            tourId="stance-tab"
          />
          <NavButton
            icon={<Users size={24} className="promax:w-7 promax:h-7" />}
            label={t('nav', 'union')}
            isActive={view === ViewState.UNION}
            onClick={() => setView(ViewState.UNION)}
            tourId="union-tab"
          />
        </div>
      </nav>

      {/* App Tour Overlay */}
      <AppTour
        steps={getTourSteps(language, hasCompletedOnboarding)}
        isOpen={showTour}
        onComplete={handleTourComplete}
        onSkip={handleTourSkip}
        onSwitchTab={(tab) => setView(tab as ViewState)}
      />
    </div>
  );
};

const NavButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  tourId?: string;
}> = ({ icon, label, isActive, onClick, tourId }) => (
  <button
    onClick={onClick}
    data-tour-id={tourId}
    className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-200
      ${isActive ? 'bg-pixel-black text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-black'}
    `}
  >
    <div className={`transform transition-transform ${isActive ? 'scale-110' : ''}`}>
      {icon}
    </div>
    <span className="text-[10px] promax:text-xs font-bold tracking-wider uppercase">{label}</span>
  </button>
);

// Export wrapper
const App: React.FC = () => (
  <AuthProvider>
    <LanguageProvider>
      <AppStateProvider>
        <StanseApp />
      </AppStateProvider>
    </LanguageProvider>
  </AuthProvider>
);

export default App;
