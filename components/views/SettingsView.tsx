
import React, { useState } from 'react';
import { PixelCard } from '../ui/PixelCard';
import { Globe, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Language } from '../../types';

export const SettingsView: React.FC = () => {
  const [notifications, setNotifications] = useState(true);
  const [location, setLocation] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { resetOnboarding, hasCompletedOnboarding } = useAuth();

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in pb-20">
      <h2 className="font-pixel text-4xl text-center mb-8">{t('settings', 'title')}</h2>

      <PixelCard className="p-0 overflow-hidden">
        <div className="divide-y-2 divide-black">
            
            {/* Language Setting */}
            <div className="flex items-center justify-between p-6 bg-gray-50">
                <div className="flex items-center gap-3">
                    <Globe size={20} />
                    <div className="font-bold font-mono text-lg">LANGUAGE</div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end max-w-[60%]">
                    {Object.values(Language).map((lang) => (
                        <button
                            key={lang}
                            onClick={() => setLanguage(lang)}
                            className={`px-2 py-1 font-mono text-xs border-2 border-black transition-all mb-1 ${
                                language === lang ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-200'
                            }`}
                        >
                            {lang}
                        </button>
                    ))}
                </div>
            </div>

            <ToggleItem 
                label={t('settings', 'notifications')} 
                sub={t('settings', 'sub_notif')}
                checked={notifications} 
                onChange={() => setNotifications(!notifications)} 
            />
            <ToggleItem 
                label={t('settings', 'loc')} 
                sub={t('settings', 'sub_loc')}
                checked={location} 
                onChange={() => setLocation(!location)} 
            />
            <ToggleItem
                label={t('settings', 'strict')}
                sub={t('settings', 'sub_strict')}
                checked={strictMode}
                onChange={() => setStrictMode(!strictMode)}
            />

            {/* Reset Stance Button */}
            <div className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                    <RotateCcw size={20} />
                    <div>
                        <div className="font-bold font-mono text-lg">RESET STANCE</div>
                        <div className="font-mono text-xs text-gray-500">Retake questionnaire to recalibrate</div>
                    </div>
                </div>
                <button
                    onClick={async () => {
                        if (!hasCompletedOnboarding) return;
                        if (confirm('Are you sure you want to reset your stance? You will need to retake the questionnaire.')) {
                            setIsResetting(true);
                            try {
                                await resetOnboarding();
                                alert('Stance reset! Go to Stance tab to recalibrate.');
                            } catch (error) {
                                alert('Failed to reset stance. Please try again.');
                            } finally {
                                setIsResetting(false);
                            }
                        }
                    }}
                    disabled={!hasCompletedOnboarding || isResetting}
                    className={`px-4 py-2 font-mono text-xs border-2 border-black transition-all ${
                        hasCompletedOnboarding && !isResetting
                            ? 'bg-black text-white hover:bg-gray-800'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {isResetting ? 'RESETTING...' : 'RESET'}
                </button>
            </div>
        </div>
      </PixelCard>

      <div className="text-center pt-8">
        <button className="font-mono text-xs text-red-500 hover:underline uppercase tracking-widest">
            {t('settings', 'delete')}
        </button>
      </div>
    </div>
  );
};

const ToggleItem: React.FC<{ label: string, sub: string, checked: boolean, onChange: () => void }> = ({ label, sub, checked, onChange }) => (
    <div className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors cursor-pointer" onClick={onChange}>
        <div>
            <div className="font-bold font-mono text-lg">{label}</div>
            <div className="font-mono text-xs text-gray-500">{sub}</div>
        </div>
        <div className={`w-14 h-8 border-2 border-black relative transition-colors ${checked ? 'bg-black' : 'bg-white'}`}>
            <div className={`absolute top-1 bottom-1 w-5 bg-current border border-black transition-all ${checked ? 'left-7 bg-white' : 'left-1 bg-black'}`}></div>
        </div>
    </div>
);
