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
 * Validate promotion code (without marking as used)
 */
export const validatePromoCode = async (
  code: string
): Promise<{ valid: boolean; error?: string; docRef?: any }> => {
  try {
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

    return { valid: true, docRef: promoDoc.ref };
  } catch (error) {
    console.error('Failed to validate promo code:', error);
    return { valid: false, error: 'Failed to validate code' };
  }
};

/**
 * Mark promotion code as used
 */
export const markPromoCodeUsed = async (
  docRef: any,
  userId: string,
  userEmail: string
): Promise<void> => {
  await updateDoc(docRef, {
    isUsed: true,
    userId,
    userEmail,
    usedAt: new Date().toISOString()
  });
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
    const originalTrialEndsAt = currentSub?.originalTrialEndsAt;

    // Handle promotion code
    let isPromo = false;
    let promoDocRef: any = null;
    if (promoCode) {
      const promoResult = await validatePromoCode(promoCode);
      if (!promoResult.valid) {
        return { success: false, error: promoResult.error };
      }
      isPromo = true;
      promoDocRef = promoResult.docRef;
    }

    // Calculate period end (always next month's 1st for tracking)
    let periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(1);
    periodEnd.setHours(0, 0, 0, 0);

    // Determine trial end date (ONLY if not using promo code)
    // Rule: Promo and Trial are mutually exclusive
    let trialEndsAt: string | undefined;
    let isStillInTrial = false;

    if (!isPromo) {
      // Only set trial if not using promo code
      if (originalTrialEndsAt) {
        // User has subscribed before - check if still within original trial
        const originalTrialEnd = new Date(originalTrialEndsAt);
        if (originalTrialEnd > now) {
          // Still within original trial period!
          trialEndsAt = originalTrialEndsAt;
          isStillInTrial = true;
          console.log(`✅ User still within original trial period (ends ${originalTrialEndsAt})`);
        }
      } else if (!hasUsedTrial) {
        // First time subscriber - set new trial end date
        const newTrialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        trialEndsAt = newTrialEnd.toISOString();
      }
    }

    // Initial billing amount is always $0 during subscription/trial
    let initialAmount = 0;

    if (!isPromo && !paymentInfo) {
      return { success: false, error: 'Payment information required' };
    }

    // Save payment method if requested
    if (!isPromo && paymentInfo && savePayment) {
      await savePaymentMethod(userId, paymentInfo);
    }

    // Update subscription master document
    const subRef = doc(db, 'user_subscriptions', userId);
    const subscriptionData: any = {
      userId,
      status: 'active',
      hasUsedTrial: true, // Mark as true once user subscribes
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      latestAmount: initialAmount,
      updatedAt: new Date().toISOString()
    };

    // Set trial dates
    if (trialEndsAt) {
      subscriptionData.trialEndsAt = trialEndsAt;
    }
    if (!originalTrialEndsAt && trialEndsAt) {
      // First time setting trial - preserve this date forever
      subscriptionData.originalTrialEndsAt = trialEndsAt;
    } else if (originalTrialEndsAt) {
      // Preserve existing originalTrialEndsAt
      subscriptionData.originalTrialEndsAt = originalTrialEndsAt;
    }

    // Set promo fields if using promo code
    if (isPromo && promoCode) {
      subscriptionData.promoExpiresAt = periodEnd.toISOString(); // Next month's 1st
      subscriptionData.promoCodeUsed = promoCode;
      console.log(`✅ Promo code ${promoCode} applied, free until ${periodEnd.toISOString()}`);
    }

    await setDoc(subRef, subscriptionData);

    // Add to billing history
    const historyRef = collection(db, 'user_subscriptions', userId, 'history');
    const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const billingData: any = {
      type: isPromo ? 'PROMO_APPLIED' : 'SUBSCRIBE_SUCCESS',
      amount: initialAmount,
      period: periodString,
      timestamp: new Date().toISOString()
    };

    if (paymentInfo) {
      billingData.paymentMethodUsed = `${paymentInfo.cardType}-${paymentInfo.cardNumber.slice(-4)}`;
    }
    if (isPromo && promoCode) {
      billingData.promoCode = promoCode;
    }

    await addDoc(historyRef, billingData as BillingRecord);

    // Record SUBSCRIBE event for analytics
    try {
      const eventMetadata: any = {
        periodStart: now.toISOString(),
        periodEnd: periodEnd.toISOString()
      };

      if (isPromo && promoCode) eventMetadata.promoCode = promoCode;
      if (trialEndsAt) eventMetadata.trialEndsAt = trialEndsAt;
      if (isPromo) eventMetadata.promoExpiresAt = periodEnd.toISOString();

      await addDoc(collection(db, 'subscription_events'), {
        userId,
        userEmail,
        eventType: 'SUBSCRIBE',
        timestamp: now.toISOString(),
        metadata: eventMetadata
      });
      console.log(`📊 Event tracked: SUBSCRIBE`);
    } catch (eventError) {
      console.error('Failed to record SUBSCRIBE event (non-critical):', eventError);
    }

    // Mark promo code as used ONLY after subscription succeeds
    if (isPromo && promoDocRef) {
      try {
        await markPromoCodeUsed(promoDocRef, userId, userEmail);
        console.log(`✅ Promo code marked as used`);
      } catch (promoError) {
        console.error('Failed to mark promo code as used (non-critical):', promoError);
      }
    }

    console.log(`✅ User ${userId} subscribed successfully. Initial amount: $${initialAmount.toFixed(2)} (Trial active)`);
    return { success: true, amount: initialAmount };

  } catch (error) {
    console.error('Failed to subscribe user:', error);
    return { success: false, error: 'Subscription failed' };
  }
};

/**
 * Cancel user's subscription
 */
export const cancelSubscription = async (userId: string, userEmail: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const now = new Date();
    const subRef = doc(db, 'user_subscriptions', userId);

    // Get current subscription to check if canceling during trial/promo
    const sub = await getSubscriptionStatus(userId);
    const canceledDuringTrial = sub?.trialEndsAt ? new Date(sub.trialEndsAt) > now : false;
    const canceledDuringPromo = sub?.promoExpiresAt ? new Date(sub.promoExpiresAt) > now : false;

    // Update master document
    await updateDoc(subRef, {
      status: 'cancelled',
      updatedAt: now.toISOString()
    });

    // Add to billing history
    const historyRef = collection(db, 'user_subscriptions', userId, 'history');
    const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await addDoc(historyRef, {
      type: 'CANCEL',
      amount: 0,
      period: periodString,
      timestamp: now.toISOString()
    } as BillingRecord);

    // Record CANCEL event for analytics
    try {
      await addDoc(collection(db, 'subscription_events'), {
        userId,
        userEmail,
        eventType: 'CANCEL',
        timestamp: now.toISOString(),
        metadata: {
          canceledDuringTrial,
          canceledDuringPromo,
          trialEndsAt: sub?.trialEndsAt,
          promoExpiresAt: sub?.promoExpiresAt
        }
      });
      console.log(`📊 Event tracked: CANCEL (trial: ${canceledDuringTrial}, promo: ${canceledDuringPromo})`);
    } catch (eventError) {
      console.error('Failed to record CANCEL event (non-critical):', eventError);
    }

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
