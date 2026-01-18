
import React, { useState } from 'react';
import { PixelButton } from '../ui/PixelButton';
import { PixelCard } from '../ui/PixelCard';
import { Lock, Mail, Chrome, UserPlus, LogIn } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Language } from '../../types';

interface LoginViewProps {
  onLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { t, language, setLanguage } = useLanguage();
  const { signIn, signUp, signInGoogle, error, clearError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError(null);
    clearError();

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      onLogin();
    } catch (err: any) {
      // Map Firebase error codes to user-friendly messages
      const errorCode = err.code || '';
      switch (errorCode) {
        case 'auth/invalid-email':
          setLocalError('Invalid email address format');
          break;
        case 'auth/user-not-found':
          setLocalError('No account found with this email. Please sign up first.');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setLocalError('Incorrect email or password');
          break;
        case 'auth/email-already-in-use':
          setLocalError('This email is already registered. Try signing in instead.');
          break;
        case 'auth/weak-password':
          setLocalError('Password should be at least 6 characters');
          break;
        case 'auth/too-many-requests':
          setLocalError('Too many failed attempts. Please try again later.');
          break;
        case 'auth/network-request-failed':
          setLocalError('Network error. Please check your connection.');
          break;
        case 'auth/user-disabled':
          setLocalError('This account has been disabled.');
          break;
        default:
          setLocalError(err.message || 'An error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setLocalError(null);
    clearError();

    try {
      await signInGoogle();
      onLogin();
    } catch (err: any) {
      setLocalError(err.message || 'Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-pixel-white relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
            <div className="font-pixel text-[400px] leading-none">S</div>
        </div>

      <div className="w-full max-w-md z-10">

        {/* Language Selector - Top Right */}
        <div className="absolute top-2 right-2 sm:top-6 sm:right-6">
             <div className="flex gap-0.5 sm:gap-1 flex-wrap justify-end max-w-[200px] sm:max-w-none">
                {Object.values(Language).map((lang) => {
                    const languageNames: Record<Language, string> = {
                        [Language.EN]: 'English',
                        [Language.ZH]: '中文',
                        [Language.JA]: '日本語',
                        [Language.FR]: 'Français',
                        [Language.ES]: 'Español'
                    };
                    return (
                        <button
                            key={lang}
                            onClick={() => setLanguage(lang)}
                            className={`px-2 py-1 sm:px-3 sm:py-1.5 font-mono text-[10px] sm:text-xs border-2 border-black transition-all ${
                                language === lang ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-200'
                            }`}
                        >
                            {languageNames[lang]}
                        </button>
                    );
                })}
            </div>
        </div>

        <div className="text-center mb-10 space-y-2">
            <h1 className="font-pixel text-7xl tracking-widest mb-2">STANSE</h1>
            <p className="font-mono text-sm tracking-widest text-gray-500 uppercase">{t('slogan')}</p>
        </div>

        <PixelCard className="p-8 bg-white">
          <div className="text-center mb-6 border-b-2 border-black pb-4">
            <h2 className="font-bold font-mono text-xl uppercase">
              {isSignUp ? 'CREATE ACCOUNT' : t('login', 'title')}
            </h2>
          </div>

          {/* Error Display */}
          {(localError || error) && (
            <div className="mb-4 p-3 border-2 border-alert-red bg-red-50 text-alert-red font-mono text-sm">
              {localError || error}
            </div>
          )}

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
                  minLength={6}
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
                className="w-full py-4 text-lg uppercase flex items-center justify-center gap-2"
                isLoading={isLoading}
            >
              {isSignUp ? (
                <>
                  <UserPlus size={20} />
                  CREATE ACCOUNT
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  {t('login', 'btn')}
                </>
              )}
            </PixelButton>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setLocalError(null);
                clearError();
              }}
              className="font-mono text-sm text-gray-600 hover:text-black underline"
            >
              {isSignUp ? t('login', 'sign_in_prompt') : t('login', 'sign_up_prompt')}
            </button>
          </div>

          <div className="my-6 flex items-center gap-4">
            <div className="h-0.5 flex-1 bg-gray-300"></div>
            <span className="font-mono text-xs text-gray-400">{t('login', 'encrypted_channel')}</span>
            <div className="h-0.5 flex-1 bg-gray-300"></div>
          </div>

          <PixelButton
            variant="secondary"
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 uppercase"
            isLoading={isLoading}
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
