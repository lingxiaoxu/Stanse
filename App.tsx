
import React, { useState } from 'react';
import { ViewState, PoliticalCoordinates } from './types';
import { Compass, Search, Newspaper, Users, Menu } from 'lucide-react';
import { SenseView } from './components/views/SenseView';
import { FingerprintView } from './components/views/FingerprintView';
import { FeedView } from './components/views/FeedView';
import { UnionView } from './components/views/ImpactView';
import { LoginView } from './components/views/LoginView';
import { ManifestoView } from './components/views/ManifestoView';
import { PrivacyView } from './components/views/PrivacyView';
import { SettingsView } from './components/views/SettingsView';
import { MenuOverlay } from './components/ui/MenuOverlay';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

// Initial mock state for user profile
// Label is set to 'Loading...' to trigger the calibration animation on the Stance page
const INITIAL_PROFILE: PoliticalCoordinates = {
  economic: 30,  // Slightly Free Market
  social: 60,    // Highly Liberal
  diplomatic: -20, // Slightly Nationalist
  label: 'Loading...',
};

const StanseApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<ViewState>(ViewState.FEED);
  const [userProfile] = useState<PoliticalCoordinates>(INITIAL_PROFILE);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t } = useLanguage();

  const handleLogin = () => {
    setIsAuthenticated(true);
    setView(ViewState.FEED);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsMenuOpen(false);
    setView(ViewState.FEED); // Reset view state internally
  };

  const renderView = () => {
    switch (view) {
      case ViewState.FEED:
        return <FeedView />;
      case ViewState.SENSE:
        return <SenseView userProfile={userProfile} onNavigate={setView} />;
      case ViewState.FINGERPRINT:
        return <FingerprintView coords={userProfile} />;
      case ViewState.UNION:
        return <UnionView />;
      case ViewState.MANIFESTO:
        return <ManifestoView />;
      case ViewState.PRIVACY:
        return <PrivacyView />;
      case ViewState.SETTINGS:
        return <SettingsView />;
      default:
        return <FeedView />;
    }
  };

  // If not authenticated, show Login Screen
  if (!isAuthenticated) {
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
          />
          <NavButton 
            icon={<Search size={24} className="promax:w-7 promax:h-7" />} 
            label={t('nav', 'sense')}
            isActive={view === ViewState.SENSE} 
            onClick={() => setView(ViewState.SENSE)} 
          />
          <NavButton 
            icon={<Compass size={24} className="promax:w-7 promax:h-7" />} 
            label={t('nav', 'stance')}
            isActive={view === ViewState.FINGERPRINT} 
            onClick={() => setView(ViewState.FINGERPRINT)} 
          />
          <NavButton 
            icon={<Users size={24} className="promax:w-7 promax:h-7" />} 
            label={t('nav', 'union')}
            isActive={view === ViewState.UNION} 
            onClick={() => setView(ViewState.UNION)} 
          />
        </div>
      </nav>
    </div>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }> = ({ icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick}
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
  <LanguageProvider>
    <StanseApp />
  </LanguageProvider>
);

export default App;
