
import React, { useState, useEffect } from 'react';
import { PixelButton } from '../ui/PixelButton';
import { PixelCard } from '../ui/PixelCard';
import { Lock, Mail, Chrome, UserPlus, LogIn, Twitter, Apple } from 'lucide-react';
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
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isTextVisible, setIsTextVisible] = useState(true);
  const { t, language, setLanguage } = useLanguage();
  const { signIn, signUp, signInGoogle, signInTwitter, signInApple, error, clearError } = useAuth();

  // Rotating text effect
  useEffect(() => {
    const rotatingTexts = t('rotatingTexts') as string[];

    // Index 3 is the longest sentence, give it more time
    const isLongSentence = currentTextIndex === 3;
    const visibleDuration = isLongSentence ? 3500 : 2500;
    const fadeDuration = 500; // Match the CSS transition duration

    // First: fade out current text
    const fadeOutTimer = setTimeout(() => {
      setIsTextVisible(false);
    }, visibleDuration);

    // Second: after fade out completes, change text and immediately fade in
    const changeTextTimer = setTimeout(() => {
      setCurrentTextIndex((prev) => (prev + 1) % rotatingTexts.length);
      // Use requestAnimationFrame to ensure DOM update before fade in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTextVisible(true);
        });
      });
    }, visibleDuration + fadeDuration);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(changeTextTimer);
    };
  }, [currentTextIndex, language, t]);

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

      // Check for network issues (China firewall)
      const isNetworkError = errorCode === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS');

      if (isNetworkError) {
        setLocalError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else {
        switch (errorCode) {
          case 'auth/invalid-email':
            setLocalError('Invalid email address format. Please check and try again.');
            break;
          case 'auth/user-not-found':
            setLocalError('No account found. Please sign up first.');
            break;
          case 'auth/wrong-password':
            setLocalError('Incorrect password. Please try again.');
            break;
          case 'auth/invalid-credential':
            // Most common error - could be wrong email or wrong password
            if (isSignUp) {
              setLocalError('Unable to create account. Please check your email and password.');
            } else {
              // For sign in: be helpful but don't reveal if account exists
              setLocalError('Invalid credentials. Please check your email and password, or sign up if you don\'t have an account.');
            }
            break;
          case 'auth/email-already-in-use':
            setLocalError('This email is already registered. Please sign in instead.');
            break;
          case 'auth/weak-password':
            setLocalError('Password must be at least 6 characters.');
            break;
          case 'auth/too-many-requests':
            setLocalError('Too many failed login attempts. Please wait a few minutes and try again.');
            break;
          case 'auth/user-disabled':
            setLocalError('This account has been disabled. Please contact support.');
            break;
          case 'auth/operation-not-allowed':
            setLocalError('Email/password authentication is currently disabled. Please try another method.');
            break;
          default:
            // Remove "Firebase: " prefix and technical details from error messages
            let cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'An error occurred. Please try again.';
            // Also remove error codes like (auth/invalid-credential)
            cleanMessage = cleanMessage.replace(/\s*\(auth\/[\w-]+\)\.?/i, '.');
            setLocalError(cleanMessage);
        }
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
      // Check if error is network-related (Great Firewall)
      const isNetworkError = err.code === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS') ||
                            err.message?.includes('Unable to connect');

      if (isNetworkError) {
        setLocalError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else {
        // Remove "Firebase: " prefix from error messages
        const cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign in with Google';
        setLocalError(cleanMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwitterSignIn = async () => {
    setIsLoading(true);
    setLocalError(null);
    clearError();

    try {
      await signInTwitter();
      onLogin();
    } catch (err: any) {
      const errorCode = err.code || '';
      const isNetworkError = errorCode === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS');

      if (isNetworkError) {
        setLocalError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/configuration-not-found') {
        setLocalError('Twitter login is not properly configured. Please contact support.');
      } else {
        let cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign in with Twitter';
        cleanMessage = cleanMessage.replace(/\s*\(auth\/[\w-]+\)\.?/i, '.');
        setLocalError(cleanMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    setLocalError(null);
    clearError();

    try {
      await signInApple();
      onLogin();
    } catch (err: any) {
      const errorCode = err.code || '';
      const isNetworkError = errorCode === 'auth/network-request-failed' ||
                            err.message?.includes('network') ||
                            err.message?.includes('Failed to fetch') ||
                            err.message?.includes('CORS');

      if (isNetworkError) {
        setLocalError('Network error: Unable to connect. If you are in China, please use a VPN. 网络错误:无法连接。如果您在中国,请使用VPN。');
      } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/configuration-not-found') {
        setLocalError('Apple login is not properly configured. Please contact support.');
      } else {
        let cleanMessage = err.message?.replace(/^Firebase:\s*/i, '') || 'Failed to sign in with Apple';
        cleanMessage = cleanMessage.replace(/\s*\(auth\/[\w-]+\)\.?/i, '.');
        setLocalError(cleanMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-6 bg-pixel-white relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
            <div className="font-pixel text-[400px] leading-none">S</div>
        </div>

      <div className="w-full max-w-xl z-10">

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
                            className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 font-mono text-[10px] sm:text-xs border-2 border-black transition-all ${
                                language === lang ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-200'
                            }`}
                        >
                            {languageNames[lang]}
                        </button>
                    );
                })}
            </div>
        </div>

        <div className="text-center mt-16">
            <h1 className="font-pixel text-[5rem] tracking-widest leading-none">STANSE</h1>
        </div>

        {/* Rotating Text */}
        <div className="text-center mb-6 mt-3 h-6 flex items-center justify-center">
          <p
            className={`font-mono text-xs text-gray-500 transition-opacity duration-500 ${
              isTextVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {(t('rotatingTexts') as string[])[currentTextIndex]}
          </p>
        </div>

        <PixelCard className="p-8 bg-white">
          <div className="text-center mb-6 border-b-2 border-black pb-4">
            <h2 className="font-bold font-mono text-xl uppercase">
              {isSignUp ? t('login', 'title_signup') : t('login', 'title_signin')}
            </h2>
          </div>

          {/* Error Display */}
          {(localError || error) && (
            <div className="mb-4 p-3 border-2 border-alert-red bg-red-50 text-alert-red font-mono text-sm break-words">
              {localError || error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">
                {isSignUp ? t('login', 'email_signup') : t('login', 'email_signin')}
              </label>
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
              <label className="font-mono text-xs font-bold block uppercase">
                {isSignUp ? t('login', 'key_signup') : t('login', 'key_signin')}
              </label>
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

          <div className="space-y-3">
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

            <PixelButton
              variant="secondary"
              type="button"
              onClick={handleTwitterSignIn}
              className="w-full flex items-center justify-center gap-2 uppercase"
              isLoading={isLoading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              {t('login', 'twitter')}
            </PixelButton>

            {/* Apple login - temporarily hidden until configuration is complete */}
            {false && (
              <PixelButton
                variant="secondary"
                type="button"
                onClick={handleAppleSignIn}
                className="w-full flex items-center justify-center gap-2 uppercase"
                isLoading={isLoading}
              >
                <Apple size={18} />
                CONTINUE WITH APPLE
              </PixelButton>
            )}
          </div>

        </PixelCard>

        <div className="text-center mt-8 font-mono text-xs text-gray-500">
            <p>{t('login', 'protocol')}</p>
        </div>
      </div>
    </div>
  );
};
