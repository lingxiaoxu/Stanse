/**
 * Credit Manager - Core credit operations for DUEL Arena
 *
 * Pattern: Similar to company_esg_by_ticker
 * - Main document: user_credits/{userId} (current state)
 * - History subcollection: user_credits/{userId}/history/{eventId} (immutable ledger)
 * - All operations are atomic using Firestore transactions
 */

import * as admin from 'firebase-admin';

const db = admin.firestore();

export const INITIAL_CREDITS_GRANT = 100; // $100 initial grant

export interface CreditEvent {
  eventId: string;
  type: 'GRANT' | 'HOLD' | 'RELEASE' | 'DEDUCT' | 'REWARD';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  matchId?: string;
  timestamp: string;
  metadata?: {
    reason?: string;
    description?: string;
  };
}

export interface UserCreditsDocument {
  userId: string;
  balance: number;
  totalGranted: number;
  totalSpent: number;
  totalEarned: number;
  updatedAt: string;
  lastTransactionAt: string;
}

/**
 * Get user's current credit balance
 * Creates account with initial grant if not exists
 */
export async function getUserCredits(userId: string): Promise<UserCreditsDocument> {
  const docRef = db.collection('user_credits').doc(userId);
  const doc = await docRef.get();

  if (doc.exists) {
    return doc.data() as UserCreditsDocument;
  }

  // First time accessing credits - grant initial amount
  await grantInitialCredits(userId);

  const newDoc = await docRef.get();
  return newDoc.data() as UserCreditsDocument;
}

/**
 * Grant initial credits to new user
 * Called automatically on first duel entry
 */
export async function grantInitialCredits(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const batch = db.batch();

  const mainRef = db.collection('user_credits').doc(userId);
  const historyRef = db.collection('user_credits').doc(userId).collection('history').doc();

  // Create history event
  const event: CreditEvent = {
    eventId: historyRef.id,
    type: 'GRANT',
    amount: INITIAL_CREDITS_GRANT,
    balanceBefore: 0,
    balanceAfter: INITIAL_CREDITS_GRANT,
    timestamp: now,
    metadata: {
      reason: 'Initial grant',
      description: 'Welcome bonus for first DUEL Arena entry'
    }
  };

  batch.set(historyRef, event);

  // Create/update main document
  const mainDoc: UserCreditsDocument = {
    userId,
    balance: INITIAL_CREDITS_GRANT,
    totalGranted: INITIAL_CREDITS_GRANT,
    totalSpent: 0,
    totalEarned: 0,
    updatedAt: now,
    lastTransactionAt: now
  };

  batch.set(mainRef, mainDoc, { merge: true });

  await batch.commit();
  console.log(`✅ Granted ${INITIAL_CREDITS_GRANT} credits to user ${userId}`);
}

/**
 * Hold credits for match entry (freeze amount)
 * Credits are frozen but not yet deducted
 */
export async function holdCredits(
  userId: string,
  amount: number,
  matchId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const mainRef = db.collection('user_credits').doc(userId);
    const doc = await transaction.get(mainRef);

    if (!doc.exists) {
      throw new Error('User credits not initialized');
    }

    const current = doc.data() as UserCreditsDocument;

    if (current.balance < amount) {
      throw new Error(`Insufficient balance: need ${amount}, have ${current.balance}`);
    }

    const historyRef = mainRef.collection('history').doc();

    const event: CreditEvent = {
      eventId: historyRef.id,
      type: 'HOLD',
      amount,
      balanceBefore: current.balance,
      balanceAfter: current.balance - amount,
      matchId,
      timestamp: now,
      metadata: {
        reason: 'Match entry hold',
        description: `Credits frozen for match ${matchId}`
      }
    };

    transaction.set(historyRef, event);
    transaction.update(mainRef, {
      balance: current.balance - amount,
      updatedAt: now,
      lastTransactionAt: now
    });
  });

  console.log(`✅ Held ${amount} credits for user ${userId}, match ${matchId}`);
}

/**
 * Release held credits (refund on match cancel or draw)
 */
export async function releaseCredits(
  userId: string,
  amount: number,
  matchId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const mainRef = db.collection('user_credits').doc(userId);
    const doc = await transaction.get(mainRef);

    if (!doc.exists) {
      throw new Error('User credits not initialized');
    }

    const current = doc.data() as UserCreditsDocument;
    const historyRef = mainRef.collection('history').doc();

    const event: CreditEvent = {
      eventId: historyRef.id,
      type: 'RELEASE',
      amount,
      balanceBefore: current.balance,
      balanceAfter: current.balance + amount,
      matchId,
      timestamp: now,
      metadata: {
        reason: 'Credits released',
        description: `Match ${matchId} cancelled or drew`
      }
    };

    transaction.set(historyRef, event);
    transaction.update(mainRef, {
      balance: current.balance + amount,
      updatedAt: now,
      lastTransactionAt: now
    });
  });

  console.log(`✅ Released ${amount} credits for user ${userId}, match ${matchId}`);
}

/**
 * Deduct credits from loser
 */
export async function deductCredits(
  userId: string,
  amount: number,
  matchId: string,
  reason: string = 'Match loss'
): Promise<void> {
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const mainRef = db.collection('user_credits').doc(userId);
    const doc = await transaction.get(mainRef);

    if (!doc.exists) {
      throw new Error('User credits not initialized');
    }

    const current = doc.data() as UserCreditsDocument;
    const historyRef = mainRef.collection('history').doc();

    const event: CreditEvent = {
      eventId: historyRef.id,
      type: 'DEDUCT',
      amount,
      balanceBefore: current.balance,
      balanceAfter: current.balance,
      matchId,
      timestamp: now,
      metadata: {
        reason,
        description: `Deducted from match ${matchId}`
      }
    };

    transaction.set(historyRef, event);
    transaction.update(mainRef, {
      totalSpent: current.totalSpent + amount,
      updatedAt: now,
      lastTransactionAt: now
    });
  });

  console.log(`✅ Deducted ${amount} credits from user ${userId}, match ${matchId}`);
}

/**
 * Reward credits to winner
 */
export async function rewardCredits(
  userId: string,
  amount: number,
  matchId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const mainRef = db.collection('user_credits').doc(userId);
    const doc = await transaction.get(mainRef);

    if (!doc.exists) {
      throw new Error('User credits not initialized');
    }

    const current = doc.data() as UserCreditsDocument;
    const historyRef = mainRef.collection('history').doc();

    const event: CreditEvent = {
      eventId: historyRef.id,
      type: 'REWARD',
      amount,
      balanceBefore: current.balance,
      balanceAfter: current.balance + amount,
      matchId,
      timestamp: now,
      metadata: {
        reason: 'Victory reward',
        description: `System-issued reward for match ${matchId}`
      }
    };

    transaction.set(historyRef, event);
    transaction.update(mainRef, {
      balance: current.balance + amount,
      totalEarned: current.totalEarned + amount,
      updatedAt: now,
      lastTransactionAt: now
    });
  });

  console.log(`✅ Rewarded ${amount} credits to user ${userId}, match ${matchId}`);
}

/**
 * Withdraw credits from user balance
 */
export async function withdrawCredits(
  userId: string,
  amount: number
): Promise<void> {
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const mainRef = db.collection('user_credits').doc(userId);
    const doc = await transaction.get(mainRef);

    if (!doc.exists) {
      throw new Error('User credits not initialized');
    }

    const current = doc.data() as UserCreditsDocument;

    if (current.balance < amount) {
      throw new Error(`Insufficient balance: need ${amount}, have ${current.balance}`);
    }

    const historyRef = mainRef.collection('history').doc();

    const event: CreditEvent = {
      eventId: historyRef.id,
      type: 'DEDUCT',
      amount,
      balanceBefore: current.balance,
      balanceAfter: current.balance - amount,
      timestamp: now,
      metadata: {
        reason: 'Withdrawal',
        description: 'User requested withdrawal'
      }
    };

    transaction.set(historyRef, event);
    transaction.update(mainRef, {
      balance: current.balance - amount,
      totalSpent: current.totalSpent + amount,
      updatedAt: now,
      lastTransactionAt: now
    });
  });

  console.log(`✅ Withdrew ${amount} credits from user ${userId}`);
}

/**
 * Add credits to user balance (deposit)
 */
export async function addCredits(
  userId: string,
  amount: number
): Promise<void> {
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const mainRef = db.collection('user_credits').doc(userId);
    const doc = await transaction.get(mainRef);

    if (!doc.exists) {
      // Initialize with the deposit amount
      await grantInitialCredits(userId);
      // Re-run to add the deposit on top
      const newDoc = await mainRef.get();
      const current = newDoc.data() as UserCreditsDocument;

      const historyRef = mainRef.collection('history').doc();
      const event: CreditEvent = {
        eventId: historyRef.id,
        type: 'GRANT',
        amount,
        balanceBefore: current.balance,
        balanceAfter: current.balance + amount,
        timestamp: now,
        metadata: {
          reason: 'Deposit',
          description: 'User deposited credits'
        }
      };

      await historyRef.set(event);
      await mainRef.update({
        balance: current.balance + amount,
        totalGranted: current.totalGranted + amount,
        updatedAt: now,
        lastTransactionAt: now
      });
      return;
    }

    const current = doc.data() as UserCreditsDocument;
    const historyRef = mainRef.collection('history').doc();

    const event: CreditEvent = {
      eventId: historyRef.id,
      type: 'GRANT',
      amount,
      balanceBefore: current.balance,
      balanceAfter: current.balance + amount,
      timestamp: now,
      metadata: {
        reason: 'Deposit',
        description: 'User deposited credits'
      }
    };

    transaction.set(historyRef, event);
    transaction.update(mainRef, {
      balance: current.balance + amount,
      totalGranted: current.totalGranted + amount,
      updatedAt: now,
      lastTransactionAt: now
    });
  });

  console.log(`✅ Added ${amount} credits to user ${userId}`);
}

/**
 * Get credit transaction history
 */
export async function getCreditHistory(
  userId: string,
  limit: number = 50
): Promise<CreditEvent[]> {
  const historyRef = db
    .collection('user_credits')
    .doc(userId)
    .collection('history')
    .orderBy('timestamp', 'desc')
    .limit(limit);

  const snapshot = await historyRef.get();
  return snapshot.docs.map(doc => doc.data() as CreditEvent);
}
