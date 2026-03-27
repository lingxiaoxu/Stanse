
import React, { useState, useEffect, useCallback } from 'react';
import { PixelCard } from '../ui/PixelCard';
import { Mail, Key, Check, AlertCircle, Crown, X, Copy, RefreshCw, Terminal } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { getSubscriptionStatus } from '../../services/subscriptionService';
import { ManageSubscriptionModal } from '../modals/ManageSubscriptionModal';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getApiKeyInfo, generateApiKey, ApiKeyInfo } from '../../services/apiKeyService';

// ── Show Key Modal ───────────────────────────────────────────────────────────

interface ShowKeyModalProps {
  apiKey: string;
  onClose: () => void;
  t: (section: string, key: string) => string;
}

const ShowKeyModal: React.FC<ShowKeyModalProps> = ({ apiKey, onClose, t }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black p-6 max-w-lg w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-pixel text-lg">API KEY GENERATED</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200">
            <X size={20} />
          </button>
        </div>

        <p className="font-mono text-xs text-gray-600 mb-4">
          {t('menu', 'api_key_success')}
        </p>

        {/* Key display */}
        <div className="bg-black text-green-400 font-mono text-xs p-4 border-2 border-black mb-4 break-all select-all">
          {apiKey}
        </div>

        <button
          onClick={handleCopy}
          className={`w-full px-4 py-3 font-mono text-sm border-2 border-black transition-all flex items-center justify-center gap-2 ${
            copied
              ? 'bg-green-600 text-white'
              : 'bg-black text-white hover:bg-gray-800'
          }`}
        >
          {copied ? (
            <>
              <Check size={16} />
              {t('menu', 'api_key_copied')}
            </>
          ) : (
            <>
              <Copy size={16} />
              {t('menu', 'api_key_copy')}
            </>
          )}
        </button>

        <button
          onClick={onClose}
          className="w-full mt-2 px-4 py-2 font-mono text-xs border-2 border-black hover:bg-gray-100"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
};

// ── AccountView ──────────────────────────────────────────────────────────────

export const AccountView: React.FC = () => {
  const { t } = useLanguage();
  const { user, sendPasswordReset } = useAuth();
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordResetStatus, setPasswordResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'cancelled' | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showPromoExpiredNotice, setShowPromoExpiredNotice] = useState(false);

  // API Key state
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  // Load subscription status on mount
  useEffect(() => {
    if (user) {
      loadSubscriptionStatus();
      loadApiKeyInfo();
    }
  }, [user]);

  const loadSubscriptionStatus = async () => {
    if (!user) return;
    const sub = await getSubscriptionStatus(user.uid);
    setSubscriptionStatus(sub?.status || null);

    // Check if promo ended without payment
    if (sub?.promoEndedWithoutPayment) {
      setShowPromoExpiredNotice(true);
    }
  };

  const loadApiKeyInfo = useCallback(async () => {
    if (!user) return;
    try {
      const info = await getApiKeyInfo(user.uid);
      setApiKeyInfo(info);
    } catch {
      // silently ignore — user may not have a key yet
    }
  }, [user]);

  const handleGenerateApiKey = async () => {
    if (!user) return;
    setApiKeyLoading(true);
    setApiKeyError(null);
    try {
      const key = await generateApiKey();
      setNewlyGeneratedKey(key);
      setShowKeyModal(true);
      // Reload key info to show preview
      await loadApiKeyInfo();
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'functions/failed-precondition') {
        setApiKeyError(t('menu', 'api_key_uncalibrated'));
      } else {
        setApiKeyError(t('menu', 'api_key_error'));
      }
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleDismissPromoNotice = async () => {
    if (!user) return;

    // Clear flag in Firestore
    const subRef = doc(db, 'user_subscriptions', user.uid);
    await updateDoc(subRef, {
      promoEndedWithoutPayment: false
    });

    setShowPromoExpiredNotice(false);
  };

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

  const formatLastUsed = (lastUsedAt: any): string => {
    if (!lastUsedAt) return t('menu', 'api_key_never_used');
    try {
      const date = lastUsedAt.toDate ? lastUsedAt.toDate() : new Date(lastUsedAt);
      return date.toLocaleDateString();
    } catch {
      return t('menu', 'api_key_never_used');
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

          {/* Premium Subscription Section */}
          <div className="p-6 bg-white">
            <div className="flex items-start gap-3">
              <Crown size={20} className="mt-1 text-yellow-600 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-bold font-mono text-lg mb-1">{t('menu', 'premium')}</div>
                <div className="font-mono text-xs text-gray-600 mb-4">
                  {t('menu', 'premium_desc')}
                </div>

                <div className="flex gap-2">
                  {subscriptionStatus === 'active' ? (
                    <>
                      <button
                        disabled
                        className="px-4 py-2 font-mono text-xs border-2 border-black bg-gray-200 text-gray-400 cursor-not-allowed"
                      >
                        {t('menu', 'subscribed_btn')}
                      </button>
                      <button
                        onClick={() => setShowManageModal(true)}
                        className="px-4 py-2 font-mono text-xs border-2 border-black bg-black text-white hover:bg-gray-800 transition-colors"
                      >
                        MANAGE
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowManageModal(true)}
                      className="px-4 py-2 font-mono text-xs border-2 border-black bg-black text-white hover:bg-gray-800 transition-colors"
                    >
                      {t('menu', 'subscribe_btn')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* OpenClaw Skill API Key Section */}
          <div className="p-6 bg-white">
            <div className="flex items-start gap-3">
              <Terminal size={20} className="mt-1 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-bold font-mono text-lg mb-1">{t('menu', 'api_key_title')}</div>
                <div className="font-mono text-xs text-gray-600 mb-4">
                  {t('menu', 'api_key_desc')}
                </div>

                {/* Key preview */}
                {apiKeyInfo ? (
                  <div className="bg-gray-100 border-2 border-gray-300 p-3 mb-4 font-mono text-xs">
                    <div className="text-gray-500 mb-1">KEY</div>
                    <div className="text-black font-bold tracking-wider">{apiKeyInfo.keyPreview}</div>
                    <div className="text-gray-400 mt-2 text-xs">
                      {t('menu', 'api_key_last_used')}: {formatLastUsed(apiKeyInfo.lastUsedAt)}
                      {apiKeyInfo.lastUsedFromSkill && (
                        <span className="ml-2 text-gray-400">via {apiKeyInfo.lastUsedFromSkill}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-300 p-3 mb-4 font-mono text-xs text-gray-400">
                    {t('menu', 'api_key_none')}
                  </div>
                )}

                {/* Error message */}
                {apiKeyError && (
                  <div className="flex items-center gap-2 text-red-600 font-mono text-xs mb-3 p-2 bg-red-50 border border-red-300">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span>{apiKeyError}</span>
                  </div>
                )}

                {/* Regenerate warning */}
                {apiKeyInfo && (
                  <div className="font-mono text-xs text-amber-700 mb-3">
                    ⚠ {t('menu', 'api_key_warning')}
                  </div>
                )}

                <button
                  onClick={handleGenerateApiKey}
                  disabled={apiKeyLoading}
                  className={`px-4 py-2 font-mono text-xs border-2 border-black transition-all flex items-center gap-2 ${
                    apiKeyLoading
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  {apiKeyLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      {t('menu', 'api_key_generating')}
                    </>
                  ) : apiKeyInfo ? (
                    <>
                      <RefreshCw size={14} />
                      {t('menu', 'api_key_regenerate')}
                    </>
                  ) : (
                    <>
                      <Key size={14} />
                      {t('menu', 'api_key_generate')}
                    </>
                  )}
                </button>
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

      {/* Manage Subscription Modal */}
      {user && (
        <ManageSubscriptionModal
          isOpen={showManageModal}
          onClose={() => setShowManageModal(false)}
          userId={user.uid}
          userEmail={user.email || ''}
          subscriptionStatus={subscriptionStatus}
          onSubscriptionChange={loadSubscriptionStatus}
        />
      )}

      {/* Show New API Key Modal */}
      {showKeyModal && newlyGeneratedKey && (
        <ShowKeyModal
          apiKey={newlyGeneratedKey}
          onClose={() => {
            setShowKeyModal(false);
            setNewlyGeneratedKey(null);
          }}
          t={t}
        />
      )}

      {/* Promo Expired Notification */}
      {showPromoExpiredNotice && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-4 border-black p-6 max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-pixel text-xl">Promo Period Ended</h3>
              <button onClick={handleDismissPromoNotice} className="p-1 hover:bg-gray-200">
                <X size={20} />
              </button>
            </div>
            <p className="font-mono text-sm mb-6">
              Your promotional period has ended. Add a payment method to continue enjoying premium features.
            </p>
            <button
              onClick={handleDismissPromoNotice}
              className="w-full px-4 py-2 bg-black text-white font-mono border-2 border-black hover:bg-gray-800"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
