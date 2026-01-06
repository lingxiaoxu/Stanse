import React, { useState, useEffect } from 'react';
import { X, Clock, CreditCard, XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
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

type TabType = 'billing' | 'payment' | 'cancel';

export const ManageSubscriptionModal: React.FC<ManageSubscriptionModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  subscriptionStatus,
  onSubscriptionChange
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('billing');
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);

  // Load billing history and subscription details
  useEffect(() => {
    if (isOpen && userId) {
      loadData();
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
      const result = await cancelSubscription(userId);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
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

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation */}
          <div className="w-64 border-r-2 border-black bg-gray-50">
            <nav className="p-4 space-y-2">
              <button
                onClick={() => setActiveTab('billing')}
                className={`w-full p-3 font-mono text-sm text-left border-2 transition-all flex items-center gap-2 ${
                  activeTab === 'billing'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-black hover:bg-gray-100'
                }`}
              >
                <Clock size={16} />
                Billing History
              </button>
              <button
                onClick={() => setActiveTab('payment')}
                className={`w-full p-3 font-mono text-sm text-left border-2 transition-all flex items-center gap-2 ${
                  activeTab === 'payment'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-black hover:bg-gray-100'
                }`}
              >
                <CreditCard size={16} />
                Payment Methods
              </button>
              <button
                onClick={() => setActiveTab('cancel')}
                className={`w-full p-3 font-mono text-sm text-left border-2 transition-all flex items-center gap-2 ${
                  activeTab === 'cancel'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-black hover:bg-gray-100'
                }`}
                disabled={subscriptionStatus !== 'active'}
              >
                <XCircle size={16} />
                Cancel Subscription
              </button>
            </nav>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Billing History Tab */}
            {activeTab === 'billing' && (
              <div className="space-y-4">
                <h3 className="font-mono text-lg font-bold uppercase mb-4">Billing History</h3>

                {isLoadingHistory ? (
                  <div className="text-center py-12 font-mono text-sm text-gray-500">
                    LOADING...
                  </div>
                ) : billingHistory.length === 0 ? (
                  <div className="text-center py-12 font-mono text-sm text-gray-500">
                    No billing history yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {billingHistory.map((record, index) => (
                      <div
                        key={index}
                        className="border-2 border-black p-4 bg-white hover:bg-gray-50 transition-colors"
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

            {/* Payment Methods Tab */}
            {activeTab === 'payment' && (
              <div className="space-y-4">
                <h3 className="font-mono text-lg font-bold uppercase mb-4">Payment Methods</h3>

                {subscriptionStatus === 'active' ? (
                  <div className="bg-yellow-50 border-2 border-yellow-600 p-4 mb-6">
                    <p className="font-mono text-xs text-yellow-900">
                      You already have an active subscription. You can update your payment method
                      or add a promo code below.
                    </p>
                  </div>
                ) : null}

                <PaymentForm onSubmit={handlePaymentSubmit} isLoading={isSubmitting} />
              </div>
            )}

            {/* Cancel Subscription Tab */}
            {activeTab === 'cancel' && (
              <div className="space-y-4">
                <h3 className="font-mono text-lg font-bold uppercase mb-4 text-alert-red">
                  Cancel Subscription
                </h3>

                <div className="bg-red-50 border-2 border-alert-red p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={24} className="text-alert-red flex-shrink-0 mt-1" />
                    <div className="space-y-2">
                      <p className="font-mono text-sm font-bold">
                        Are you sure you want to cancel your subscription?
                      </p>
                      <p className="font-mono text-xs text-gray-700">
                        Your premium features will remain active until the end of your current
                        billing period.
                      </p>
                      {subscription && (
                        <p className="font-mono text-xs font-bold">
                          Current period ends: {formatDate(subscription.currentPeriodEnd)}
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

                <div className="border-2 border-black p-4 bg-gray-50">
                  <p className="font-mono text-xs text-gray-600">
                    After cancellation, you can resubscribe at any time. Your preferences and data
                    will be preserved.
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
