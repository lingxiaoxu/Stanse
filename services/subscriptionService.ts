import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit as firestoreLimit
} from 'firebase/firestore';
import { db } from './firebase';
import { UserSubscription, BillingRecord, PaymentMethod, PromotionCode } from '../types';

// Monthly subscription price
const MONTHLY_PRICE = 29.99;
const FREE_TRIAL_DAYS = 7;

/**
 * Get user's current subscription status
 */
export const getSubscriptionStatus = async (userId: string): Promise<UserSubscription | null> => {
  try {
    const subRef = doc(db, 'user_subscriptions', userId);
    const subSnap = await getDoc(subRef);

    if (!subSnap.exists()) {
      return null;
    }

    return subSnap.data() as UserSubscription;
  } catch (error) {
    console.error('Failed to get subscription status:', error);
    return null;
  }
};

/**
 * Get billing history for a user
 */
export const getBillingHistory = async (userId: string): Promise<BillingRecord[]> => {
  try {
    const historyRef = collection(db, 'user_subscriptions', userId, 'history');
    const q = query(historyRef, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data() as BillingRecord);
  } catch (error) {
    console.error('Failed to get billing history:', error);
    return [];
  }
};

/**
 * Get saved payment method for a user
 */
export const getPaymentMethod = async (userId: string): Promise<PaymentMethod | null> => {
  try {
    const pmRef = doc(db, 'payment_methods', userId);
    const pmSnap = await getDoc(pmRef);

    if (!pmSnap.exists()) {
      return null;
    }

    return pmSnap.data() as PaymentMethod;
  } catch (error) {
    console.error('Failed to get payment method:', error);
    return null;
  }
};

/**
 * Save payment method (simulated storage - in production would tokenize)
 */
export const savePaymentMethod = async (
  userId: string,
  cardInfo: Omit<PaymentMethod, 'userId' | 'createdAt'>
): Promise<void> => {
  const pmRef = doc(db, 'payment_methods', userId);
  await setDoc(pmRef, {
    ...cardInfo,
    userId,
    createdAt: new Date().toISOString()
  });
};

/**
 * Calculate prorated amount for first billing period
 */
export const calculateProratedAmount = (
  subscriptionStart: Date,
  hasUsedTrial: boolean
): number => {
  // Effective start = subscription start + 7 days if trial not used
  const effectiveStart = hasUsedTrial
    ? subscriptionStart
    : new Date(subscriptionStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Period end = 1st of next month
  const nextMonth = new Date(effectiveStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);

  // Calculate days billed
  const daysBilled = Math.ceil(
    (nextMonth.getTime() - effectiveStart.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysBilled <= 0) return 0;

  // Days in the month
  const daysInMonth = new Date(
    effectiveStart.getFullYear(),
    effectiveStart.getMonth() + 1,
    0
  ).getDate();

  return (MONTHLY_PRICE * daysBilled) / daysInMonth;
};

/**
 * Validate and use a promotion code
 */
export const validateAndUsePromoCode = async (
  code: string,
  userId: string,
  userEmail: string
): Promise<{ valid: boolean; error?: string }> => {
  try {
    // Query for the promotion code
    const promoRef = collection(db, 'promotion_codes');
    const q = query(promoRef, where('code', '==', code.toUpperCase()), firestoreLimit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { valid: false, error: 'Invalid promotion code' };
    }

    const promoDoc = snapshot.docs[0];
    const promoData = promoDoc.data() as PromotionCode;

    if (promoData.isUsed) {
      return { valid: false, error: 'Promotion code already used' };
    }

    // Mark as used
    await updateDoc(promoDoc.ref, {
      isUsed: true,
      userId,
      userEmail,
      usedAt: new Date().toISOString()
    });

    return { valid: true };
  } catch (error) {
    console.error('Failed to validate promo code:', error);
    return { valid: false, error: 'Failed to validate code' };
  }
};

/**
 * Subscribe user to premium
 */
export const subscribeToPremium = async (
  userId: string,
  userEmail: string,
  paymentInfo?: Omit<PaymentMethod, 'userId' | 'createdAt'>,
  promoCode?: string,
  savePayment: boolean = false
): Promise<{ success: boolean; error?: string; amount?: number }> => {
  try {
    const now = new Date();

    // Check current subscription status
    const currentSub = await getSubscriptionStatus(userId);
    const hasUsedTrial = currentSub?.hasUsedTrial || false;

    // Handle promotion code
    let isPromo = false;
    if (promoCode) {
      const promoResult = await validateAndUsePromoCode(promoCode, userId, userEmail);
      if (!promoResult.valid) {
        return { success: false, error: promoResult.error };
      }
      isPromo = true;
    }

    // Calculate billing amount
    let amount: number;
    let periodEnd: Date;

    if (isPromo) {
      // Promo code: free until next month's 1st
      amount = 0;
      periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(1);
      periodEnd.setHours(0, 0, 0, 0);
    } else {
      // Regular subscription: calculate prorated amount
      if (!paymentInfo) {
        return { success: false, error: 'Payment information required' };
      }

      amount = calculateProratedAmount(now, hasUsedTrial);
      periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(1);
      periodEnd.setHours(0, 0, 0, 0);

      // Save payment method if requested
      if (savePayment) {
        await savePaymentMethod(userId, paymentInfo);
      }
    }

    // Update subscription master document
    const subRef = doc(db, 'user_subscriptions', userId);
    await setDoc(subRef, {
      userId,
      status: 'active',
      hasUsedTrial: true, // Mark trial as used
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      latestAmount: amount,
      updatedAt: new Date().toISOString()
    });

    // Add to billing history
    const historyRef = collection(db, 'user_subscriptions', userId, 'history');
    const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await addDoc(historyRef, {
      type: isPromo ? 'PROMO_APPLIED' : 'SUBSCRIBE_SUCCESS',
      amount,
      period: periodString,
      paymentMethodUsed: paymentInfo ? `${paymentInfo.cardType}-${paymentInfo.cardNumber.slice(-4)}` : undefined,
      promoCode: isPromo ? promoCode : undefined,
      timestamp: new Date().toISOString()
    } as BillingRecord);

    console.log(`✅ User ${userId} subscribed successfully. Amount: $${amount.toFixed(2)}`);
    return { success: true, amount };

  } catch (error) {
    console.error('Failed to subscribe user:', error);
    return { success: false, error: 'Subscription failed' };
  }
};

/**
 * Cancel user's subscription
 */
export const cancelSubscription = async (userId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const subRef = doc(db, 'user_subscriptions', userId);

    // Update master document
    await updateDoc(subRef, {
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    });

    // Add to billing history
    const historyRef = collection(db, 'user_subscriptions', userId, 'history');
    const now = new Date();
    const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await addDoc(historyRef, {
      type: 'CANCEL',
      amount: 0,
      period: periodString,
      timestamp: new Date().toISOString()
    } as BillingRecord);

    console.log(`✅ User ${userId} cancelled subscription`);
    return { success: true };

  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return { success: false, error: 'Cancellation failed' };
  }
};

/**
 * Validate credit card number using Luhn algorithm
 */
export const validateCardNumber = (cardNumber: string): boolean => {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
};

/**
 * Detect card type from number
 */
export const detectCardType = (cardNumber: string): 'Visa' | 'Mastercard' | 'Amex' | null => {
  const digits = cardNumber.replace(/\D/g, '');

  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';

  return null;
};

/**
 * Validate expiry date (MM/YY format)
 */
export const validateExpiry = (expiry: string): boolean => {
  const match = expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!match) return false;

  const month = parseInt(match[1]);
  const year = 2000 + parseInt(match[2]);

  const now = new Date();
  const expiryDate = new Date(year, month - 1);

  return expiryDate > now;
};

/**
 * Format card number for display (show last 4 digits)
 */
export const formatCardNumberForDisplay = (cardNumber: string): string => {
  const last4 = cardNumber.slice(-4);
  return `•••• •••• •••• ${last4}`;
};

/**
 * Process monthly renewals for all active subscriptions
 * Should be run on the 1st of every month via Cloud Scheduler
 *
 * Rule 5.2.5: Users active on 1st of month are charged full $29.99
 * No prorating for mid-month cancellations
 */
export const processMonthlyRenewals = async (): Promise<{
  processed: number;
  errors: number;
  totalRevenue: number;
}> => {
  try {
    const subsRef = collection(db, 'user_subscriptions');
    const q = query(subsRef, where('status', '==', 'active'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { processed: 0, errors: 0, totalRevenue: 0 };
    }

    const now = new Date();
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(1);
    currentPeriodStart.setHours(0, 0, 0, 0);

    const currentPeriodEnd = new Date(currentPeriodStart);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let processedCount = 0;
    let errorCount = 0;

    for (const docSnap of snapshot.docs) {
      const userId = docSnap.id;

      try {
        // Add billing history record
        const historyRef = collection(db, 'user_subscriptions', userId, 'history');
        await addDoc(historyRef, {
          type: 'RENEW',
          amount: MONTHLY_PRICE,
          period: periodString,
          timestamp: now.toISOString()
        } as BillingRecord);

        // Update subscription document
        await updateDoc(docSnap.ref, {
          currentPeriodStart: currentPeriodStart.toISOString(),
          currentPeriodEnd: currentPeriodEnd.toISOString(),
          latestAmount: MONTHLY_PRICE,
          updatedAt: now.toISOString()
        });

        processedCount++;
      } catch (error) {
        console.error(`Failed to renew subscription for ${userId}:`, error);
        errorCount++;
      }
    }

    const totalRevenue = processedCount * MONTHLY_PRICE;
    console.log(`✅ Processed ${processedCount} renewals. Total: $${totalRevenue.toFixed(2)}`);

    return { processed: processedCount, errors: errorCount, totalRevenue };
  } catch (error) {
    console.error('Failed to process monthly renewals:', error);
    throw error;
  }
};
