import React, { useState, useEffect } from 'react';
import { X, Clock, CreditCard, XCircle, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { PixelButton } from '../ui/PixelButton';
import { PaymentForm } from '../ui/PaymentForm';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  getBillingHistory,
  subscribeToPremium,
  cancelSubscription,
  getSubscriptionStatus
} from '../../services/subscriptionService';
import { BillingRecord, UserSubscription } from '../../types';

interface ManageSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  subscriptionStatus: 'active' | 'cancelled' | null;
  onSubscriptionChange: () => void;
}

type SectionType = 'billing' | 'payment' | 'cancel';

export const ManageSubscriptionModal: React.FC<ManageSubscriptionModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  subscriptionStatus,
  onSubscriptionChange
}) => {
  const { t } = useLanguage();

  // Accordion state - track which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Set<SectionType>>(new Set(['payment']));
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);

  // Load billing history and subscription details when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      loadData();
      // Clear error/success messages when modal opens
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, userId]);

  const loadData = async () => {
    setIsLoadingHistory(true);
    try {
      const [history, subData] = await Promise.all([
        getBillingHistory(userId),
        getSubscriptionStatus(userId)
      ]);
      setBillingHistory(history);
      setSubscription(subData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load subscription details');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const toggleSection = (section: SectionType) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handlePaymentSubmit = async (
    paymentInfo?: {
      cardholderName: string;
      cardNumber: string;
      cardType: 'Visa' | 'Mastercard' | 'Amex';
      expiry: string;
      cvv: string;
      billingZip: string;
    },
    promoCode?: string,
    savePayment?: boolean
  ) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await subscribeToPremium(
        userId,
        userEmail,
        paymentInfo,
        promoCode,
        savePayment
      );

      if (result.success) {
        setSuccess(
          promoCode
            ? 'Promo code activated successfully!'
            : `Subscription activated! Charged $${result.amount?.toFixed(2)}`
        );
        // Reload data and notify parent
        await loadData();
        onSubscriptionChange();
        // Close modal after 2 seconds
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError(result.error || 'Subscription failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Subscription error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription?')) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await cancelSubscription(userId, userEmail);

      if (result.success) {
        setSuccess('Subscription cancelled successfully');
        // Reload data and notify parent
        await loadData();
        onSubscriptionChange();
        // Close modal after 2 seconds
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError(result.error || 'Cancellation failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Cancellation error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatAmount = (amount: number): string => {
    return `$${amount.toFixed(2)}`;
  };

  const getStatusBadge = (type: BillingRecord['type']) => {
    switch (type) {
      case 'SUBSCRIBE_SUCCESS':
        return (
          <span className="px-2 py-1 bg-green-100 border border-green-600 text-green-800 font-mono text-xs">
            SUBSCRIBED
          </span>
        );
      case 'TRIAL_END_CHARGE':
        return (
          <span className="px-2 py-1 bg-purple-100 border border-purple-600 text-purple-800 font-mono text-xs">
            TRIAL ENDED
          </span>
        );
      case 'PROMO_APPLIED':
        return (
          <span className="px-2 py-1 bg-yellow-100 border border-yellow-600 text-yellow-800 font-mono text-xs">
            PROMO
          </span>
        );
      case 'RENEW':
        return (
          <span className="px-2 py-1 bg-blue-100 border border-blue-600 text-blue-800 font-mono text-xs">
            RENEWED
          </span>
        );
      case 'CANCEL':
        return (
          <span className="px-2 py-1 bg-red-100 border border-red-600 text-red-800 font-mono text-xs">
            CANCELLED
          </span>
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  const isSectionExpanded = (section: SectionType) => expandedSections.has(section);

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black w-full max-w-xl max-h-[90vh] overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b-2 border-black bg-gray-50 flex justify-between items-center">
          <h2 className="font-pixel text-2xl">MANAGE SUBSCRIPTION</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 transition-colors border-2 border-transparent hover:border-black"
          >
            <X size={20} />
          </button>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border-2 border-green-600 flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" />
            <span className="font-mono text-xs text-green-800">{success}</span>
          </div>
        )}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border-2 border-alert-red flex items-center gap-2">
            <AlertTriangle size={16} className="text-alert-red" />
            <span className="font-mono text-xs text-alert-red">{error}</span>
          </div>
        )}

        {/* Accordion Sections */}
        <div className="flex-1 overflow-y-auto">
          {/* Section 1: Billing History */}
          <div className="border-b-2 border-black">
            <button
              onClick={() => toggleSection('billing')}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Clock size={20} />
                <span className="font-mono text-sm font-bold uppercase">Billing History</span>
              </div>
              {isSectionExpanded('billing') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {isSectionExpanded('billing') && (
              <div className="p-6 bg-gray-50 border-t-2 border-black">
                {isLoadingHistory ? (
                  <div className="text-center py-8 font-mono text-sm text-gray-500">
                    LOADING...
                  </div>
                ) : billingHistory.length === 0 ? (
                  <div className="text-center py-8 font-mono text-sm text-gray-500">
                    No billing history yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {billingHistory.map((record, index) => (
                      <div
                        key={index}
                        className="border-2 border-black p-4 bg-white"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusBadge(record.type)}
                              <span className="font-mono text-xs text-gray-500">
                                {formatDate(record.timestamp)}
                              </span>
                            </div>
                            <div className="font-mono text-sm">
                              Period: {record.period}
                            </div>
                            {record.paymentMethodUsed && (
                              <div className="font-mono text-xs text-gray-600">
                                Payment: {record.paymentMethodUsed}
                              </div>
                            )}
                            {record.promoCode && (
                              <div className="font-mono text-xs text-yellow-600 font-bold">
                                Promo Code: {record.promoCode}
                              </div>
                            )}
                          </div>
                          <div className="font-mono text-lg font-bold">
                            {record.promoCode ? (
                              <span className="text-yellow-600">$0.00 (PROMO)</span>
                            ) : (
                              formatAmount(record.amount)
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Payment Methods */}
          <div className="border-b-2 border-black">
            <button
              onClick={() => toggleSection('payment')}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <CreditCard size={20} />
                <span className="font-mono text-sm font-bold uppercase">Payment Methods</span>
              </div>
              {isSectionExpanded('payment') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {isSectionExpanded('payment') && (
              <div className="p-6 bg-white border-t-2 border-black">
                {subscriptionStatus === 'active' && (
                  <div className="bg-yellow-50 border-2 border-yellow-600 p-4 mb-6">
                    <p className="font-mono text-xs text-yellow-900">
                      You already have an active subscription. You can update your payment method below.
                    </p>
                    <p className="font-mono text-xs text-yellow-900 mt-2 font-bold">
                      Note: Promotion codes can only be used when first subscribing.
                    </p>
                  </div>
                )}

                <PaymentForm
                  onSubmit={handlePaymentSubmit}
                  isLoading={isSubmitting}
                  disablePromoCode={subscriptionStatus === 'active'}
                />
              </div>
            )}
          </div>

          {/* Section 3: Cancel Subscription */}
          <div>
            <button
              onClick={() => toggleSection('cancel')}
              disabled={subscriptionStatus !== 'active'}
              className={`w-full p-4 flex items-center justify-between transition-colors ${
                subscriptionStatus !== 'active'
                  ? 'opacity-50 cursor-not-allowed bg-gray-100'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <XCircle size={20} className={subscriptionStatus !== 'active' ? 'text-gray-400' : ''} />
                <span className="font-mono text-sm font-bold uppercase">Cancel Subscription</span>
              </div>
              {subscriptionStatus === 'active' && (
                isSectionExpanded('cancel') ? <ChevronUp size={20} /> : <ChevronDown size={20} />
              )}
            </button>

            {isSectionExpanded('cancel') && subscriptionStatus === 'active' && (
              <div className="p-6 bg-white border-t-2 border-black">
                <div className="bg-red-50 border-2 border-alert-red p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={24} className="text-alert-red flex-shrink-0 mt-1" />
                    <div className="space-y-2">
                      <p className="font-mono text-sm font-bold">
                        Are you sure you want to cancel your subscription?
                      </p>
                      <p className="font-mono text-xs text-gray-700">
                        {subscription?.trialEndsAt
                          ? 'Your free trial will end on the date below. No charges will apply.'
                          : subscription?.promoExpiresAt
                          ? 'Your promo period will end on the date below. No charges will apply.'
                          : 'Your premium features will remain active until the end of your current billing period.'}
                      </p>
                      {subscription && (
                        <p className="font-mono text-xs font-bold">
                          {subscription.trialEndsAt
                            ? `Trial ends: ${formatDate(subscription.trialEndsAt)}`
                            : subscription.promoExpiresAt
                            ? `Promo expires: ${formatDate(subscription.promoExpiresAt)}`
                            : `Current period ends: ${formatDate(subscription.currentPeriodEnd)}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <PixelButton
                    variant="alert"
                    onClick={handleCancelSubscription}
                    isLoading={isSubmitting}
                    className="w-full py-3"
                  >
                    CONFIRM CANCELLATION
                  </PixelButton>
                </div>

                <div className="border-2 border-black p-4 bg-gray-50 mt-4">
                  <p className="font-mono text-xs text-gray-600">
                    After cancellation, you can resubscribe at any time.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
