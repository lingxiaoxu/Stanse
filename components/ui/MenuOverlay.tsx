
import React, { useState, useEffect } from 'react';
import { X, BookOpen, Shield, Settings, LogOut, ChevronRight, Users, Twitter, Check, User } from 'lucide-react';
import { ViewState, SocialPlatform } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { connectSocialMedia, getSocialMediaConnection } from '../../services/userService';

interface MenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
}

export const MenuOverlay: React.FC<MenuOverlayProps> = ({ isOpen, onClose, onNavigate, onLogout }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [twitterHandle, setTwitterHandle] = useState('');
  const [isConnectingTwitter, setIsConnectingTwitter] = useState(false);
  const [isTwitterConnected, setIsTwitterConnected] = useState(false);
  const [isLoadingConnection, setIsLoadingConnection] = useState(true);

  // Load existing Twitter connection on mount or when user changes
  useEffect(() => {
    const loadTwitterConnection = async () => {
      if (!user) {
        setIsLoadingConnection(false);
        setIsTwitterConnected(false);
        setTwitterHandle('');
        return;
      }

      setIsLoadingConnection(true);
      try {
        const connection = await getSocialMediaConnection(user.uid, SocialPlatform.TWITTER);
        if (connection) {
          setTwitterHandle(connection.handle);
          setIsTwitterConnected(true);
        } else {
          // No connection found - reset state
          setTwitterHandle('');
          setIsTwitterConnected(false);
        }
      } catch (error) {
        console.error('Error loading Twitter connection:', error);
        setTwitterHandle('');
        setIsTwitterConnected(false);
      } finally {
        setIsLoadingConnection(false);
      }
    };

    if (isOpen) {
      loadTwitterConnection();
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleNav = (view: ViewState) => {
    onNavigate(view);
    onClose();
  };

  const handleConnectTwitter = async () => {
    if (!twitterHandle.trim() || !user) return;
    setIsConnectingTwitter(true);

    try {
      // Save to Firebase
      await connectSocialMedia(user.uid, SocialPlatform.TWITTER, twitterHandle, {
        profileUrl: `https://twitter.com/${twitterHandle.replace('@', '')}`
      });
      setIsTwitterConnected(true);
    } catch (error) {
      console.error('Error connecting Twitter:', error);
      alert('Failed to connect Twitter account. Please try again.');
    } finally {
      setIsConnectingTwitter(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-pixel-white flex flex-col animate-slide-in">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b-4 border-pixel-black bg-white shadow-sm">
        <h2 className="font-pixel text-4xl tracking-widest">MENU</h2>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-pixel-black hover:text-white border-2 border-transparent hover:border-pixel-black transition-colors"
        >
          <X size={32} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        <MenuItem 
          icon={<BookOpen />} 
          label={t('menu', 'manifesto')} 
          sub={t('menu', 'subs').manifesto}
          onClick={() => handleNav(ViewState.MANIFESTO)}
        />
        <MenuItem 
          icon={<Shield />} 
          label={t('menu', 'privacy')} 
          sub={t('menu', 'subs').privacy}
          onClick={() => handleNav(ViewState.PRIVACY)}
        />
        <MenuItem
          icon={<Settings />}
          label={t('menu', 'settings')}
          sub={t('menu', 'subs').settings}
          onClick={() => handleNav(ViewState.SETTINGS)}
        />
        <MenuItem
          icon={<User />}
          label={t('menu', 'account')}
          sub={t('menu', 'subs').account}
          onClick={() => handleNav(ViewState.ACCOUNT)}
        />
        <MenuItem
          icon={<Users />}
          label={t('menu', 'aboutUs')}
          sub={t('menu', 'subs').aboutUs}
          onClick={() => handleNav(ViewState.ABOUT_US)}
        />
         
         {/* Interactive Twitter Connect Item */}
         <div className="w-full p-4 border-2 border-pixel-black bg-white shadow-pixel transition-all">
            <div className="flex items-center gap-4 mb-3">
                <Twitter className={isTwitterConnected ? "text-blue-400" : ""} />
                <div className="text-left">
                    <div className="font-pixel text-2xl leading-none">{t('menu', 'social')}</div>
                    <div className="font-mono text-xs opacity-60">{t('menu', 'subs').social}</div>
                </div>
            </div>
            
            {!isTwitterConnected ? (
                <div className="flex gap-2 mt-2 animate-fade-in">
                    <div className="flex items-center border-2 border-black px-2 bg-gray-50 flex-1">
                        <span className="font-mono text-gray-400 mr-1">@</span>
                        <input 
                            type="text" 
                            value={twitterHandle}
                            onChange={(e) => setTwitterHandle(e.target.value)}
                            placeholder="username"
                            className="w-full font-mono text-sm outline-none bg-transparent uppercase"
                        />
                    </div>
                    <button 
                        onClick={handleConnectTwitter}
                        disabled={isConnectingTwitter || !twitterHandle}
                        className="bg-black text-white px-4 py-2 font-mono font-bold text-xs hover:bg-gray-800 disabled:opacity-50"
                    >
                        {isConnectingTwitter ? '...' : 'LINK'}
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-green-600 font-mono text-xs font-bold mt-2 border-t border-gray-100 pt-2 animate-fade-in">
                    <Check size={14} />
                    <span>CONNECTED: @{twitterHandle.toUpperCase()}</span>
                </div>
            )}
        </div>
        
        <div className="h-8"></div>
        
        <button 
          onClick={onLogout}
          className="w-full border-2 border-alert-red p-4 flex items-center justify-center gap-2 text-alert-red font-mono font-bold hover:bg-alert-red hover:text-white transition-colors shadow-pixel active:shadow-none active:translate-y-1"
        >
          <LogOut size={20} />
          <span>{t('menu', 'logout')}</span>
        </button>
      </div>

      {/* Footer */}
      <div className="p-6 border-t-4 border-pixel-black bg-gray-100 text-center">
        <div className="font-pixel text-2xl mb-1">STANSE</div>
        <div className="font-mono text-xs text-gray-500">{t('slogan')}</div>
        <div className="mt-4 text-[10px] font-mono text-gray-400 uppercase">
          v1.0.5 • Build 2023.12
        </div>
      </div>
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode, label: string, sub: string, onClick: () => void }> = ({ icon, label, sub, onClick }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center justify-between p-4 border-2 border-pixel-black bg-white shadow-pixel hover:translate-y-1 hover:shadow-none hover:bg-pixel-black hover:text-white group transition-all"
  >
    <div className="flex items-center gap-4">
      <div className="group-hover:scale-110 transition-transform">{icon}</div>
      <div className="text-left">
        <div className="font-pixel text-2xl leading-none">{label}</div>
        <div className="font-mono text-xs opacity-60 group-hover:opacity-90">{sub}</div>
      </div>
    </div>
    <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" />
  </button>
);
