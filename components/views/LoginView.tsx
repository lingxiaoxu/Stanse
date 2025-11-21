
import React, { useState } from 'react';
import { PixelButton } from '../ui/PixelButton';
import { PixelCard } from '../ui/PixelCard';
import { Lock, Mail, Chrome } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Language } from '../../types';

interface LoginViewProps {
  onLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { t, language, setLanguage } = useLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Mock API delay
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-pixel-white relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
            <div className="font-pixel text-[400px] leading-none">S</div>
        </div>

      <div className="w-full max-w-md z-10">
        
        {/* Language Selector - Top Right */}
        <div className="absolute top-6 right-6">
             <div className="flex gap-1">
                {Object.values(Language).map((lang) => (
                    <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`px-2 py-1 font-mono text-xs border-2 border-black transition-all ${
                            language === lang ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-200'
                        }`}
                    >
                        {lang}
                    </button>
                ))}
            </div>
        </div>

        <div className="text-center mb-10 space-y-2">
            <h1 className="font-pixel text-7xl tracking-widest mb-2">STANSE</h1>
            <p className="font-mono text-sm tracking-widest text-gray-500 uppercase">{t('slogan')}</p>
        </div>

        <PixelCard className="p-8 bg-white">
          <div className="text-center mb-6 border-b-2 border-black pb-4">
            <h2 className="font-bold font-mono text-xl uppercase">{t('login', 'title')}</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">{t('login', 'email')}</label>
              <div className="flex items-center border-2 border-black p-2 bg-gray-50">
                <Mail className="mr-3 opacity-50" size={20} />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="citizen@world.com"
                  className="bg-transparent w-full font-mono outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">{t('login', 'key')}</label>
              <div className="flex items-center border-2 border-black p-2 bg-gray-50">
                <Lock className="mr-3 opacity-50" size={20} />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-transparent w-full font-mono outline-none"
                />
              </div>
            </div>

            <PixelButton 
                variant="primary" 
                type="submit" 
                className="w-full py-4 text-lg uppercase"
                isLoading={isLoading}
            >
              {t('login', 'btn')}
            </PixelButton>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-0.5 flex-1 bg-gray-300"></div>
            <span className="font-mono text-xs text-gray-400">ENCRYPTED CHANNEL</span>
            <div className="h-0.5 flex-1 bg-gray-300"></div>
          </div>

          <PixelButton 
            variant="secondary" 
            type="button" 
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 uppercase"
          >
            <Chrome size={18} />
            {t('login', 'google')}
          </PixelButton>

        </PixelCard>
        
        <div className="text-center mt-8 font-mono text-xs text-gray-500">
            <p>{t('login', 'protocol')}</p>
        </div>
      </div>
    </div>
  );
};
