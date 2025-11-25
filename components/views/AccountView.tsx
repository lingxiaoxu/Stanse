
import React, { useState } from 'react';
import { PixelCard } from '../ui/PixelCard';
import { Mail, Key, Check, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

export const AccountView: React.FC = () => {
  const { t } = useLanguage();
  const { user, sendPasswordReset } = useAuth();
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordResetStatus, setPasswordResetStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setIsResettingPassword(true);
    setPasswordResetStatus('idle');
    try {
      await sendPasswordReset(user.email);
      setPasswordResetStatus('success');
      setTimeout(() => setPasswordResetStatus('idle'), 5000);
    } catch (error) {
      console.error('Password reset error:', error);
      setPasswordResetStatus('error');
      setTimeout(() => setPasswordResetStatus('idle'), 5000);
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in pb-20">
      <h2 className="font-pixel text-4xl text-center mb-8">{t('menu', 'account')}</h2>

      <PixelCard className="p-0 overflow-hidden">
        <div className="divide-y-2 divide-black">

          {/* Email Display */}
          <div className="flex items-start justify-between p-6 bg-gray-50">
            <div className="flex items-start gap-3 flex-1">
              <Mail size={20} className="mt-1 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold font-mono text-lg mb-1">{t('menu', 'account_email')}</div>
                <div className="font-mono text-sm text-gray-700 break-all">{user?.email || 'No email available'}</div>
              </div>
            </div>
          </div>

          {/* Reset Password */}
          <div className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3 mb-4">
              <Key size={20} className="mt-1 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-bold font-mono text-lg mb-1">{t('menu', 'account_reset')}</div>
                <div className="font-mono text-xs text-gray-500 mb-4">
                  {t('menu', 'account_reset_desc')}
                </div>

                <button
                  onClick={handlePasswordReset}
                  disabled={isResettingPassword || passwordResetStatus === 'success'}
                  className={`px-4 py-2 font-mono text-xs border-2 border-black transition-all ${
                    isResettingPassword || passwordResetStatus === 'success'
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  {isResettingPassword ? 'SENDING...' : t('menu', 'account_reset')}
                </button>

                {/* Success Message */}
                {passwordResetStatus === 'success' && (
                  <div className="flex items-center gap-2 text-green-600 font-mono text-xs font-bold mt-3 p-3 bg-green-50 border-2 border-green-600 animate-fade-in">
                    <Check size={16} className="flex-shrink-0" />
                    <span>{t('menu', 'account_reset_sent')}</span>
                  </div>
                )}

                {/* Error Message */}
                {passwordResetStatus === 'error' && (
                  <div className="flex items-center gap-2 text-alert-red font-mono text-xs font-bold mt-3 p-3 bg-red-50 border-2 border-alert-red animate-fade-in">
                    <AlertCircle size={16} className="flex-shrink-0" />
                    <span>{t('menu', 'account_reset_error')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </PixelCard>
    </div>
  );
};