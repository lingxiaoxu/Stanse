"use strict";
/**
 * Credit Manager - Core credit operations for DUEL Arena
 *
 * Pattern: Similar to company_esg_by_ticker
 * - Main document: user_credits/{userId} (current state)
 * - History subcollection: user_credits/{userId}/history/{eventId} (immutable ledger)
 * - All operations are atomic using Firestore transactions
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_CREDITS_GRANT = void 0;
exports.getUserCredits = getUserCredits;
exports.grantInitialCredits = grantInitialCredits;
exports.holdCredits = holdCredits;
exports.releaseCredits = releaseCredits;
exports.deductCredits = deductCredits;
exports.rewardCredits = rewardCredits;
exports.getCreditHistory = getCreditHistory;
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.INITIAL_CREDITS_GRANT = 100; // $100 initial grant
/**
 * Get user's current credit balance
 * Creates account with initial grant if not exists
 */
async function getUserCredits(userId) {
    const docRef = db.collection('user_credits').doc(userId);
    const doc = await docRef.get();
    if (doc.exists) {
        return doc.data();
    }
    // First time accessing credits - grant initial amount
    await grantInitialCredits(userId);
    const newDoc = await docRef.get();
    return newDoc.data();
}
/**
 * Grant initial credits to new user
 * Called automatically on first duel entry
 */
async function grantInitialCredits(userId) {
    const now = new Date().toISOString();
    const batch = db.batch();
    const mainRef = db.collection('user_credits').doc(userId);
    const historyRef = db.collection('user_credits').doc(userId).collection('history').doc();
    // Create history event
    const event = {
        eventId: historyRef.id,
        type: 'GRANT',
        amount: exports.INITIAL_CREDITS_GRANT,
        balanceBefore: 0,
        balanceAfter: exports.INITIAL_CREDITS_GRANT,
        timestamp: now,
        metadata: {
            reason: 'Initial grant',
            description: 'Welcome bonus for first DUEL Arena entry'
        }
    };
    batch.set(historyRef, event);
    // Create/update main document
    const mainDoc = {
        userId,
        balance: exports.INITIAL_CREDITS_GRANT,
        totalGranted: exports.INITIAL_CREDITS_GRANT,
        totalSpent: 0,
        totalEarned: 0,
        updatedAt: now,
        lastTransactionAt: now
    };
    batch.set(mainRef, mainDoc, { merge: true });
    await batch.commit();
    console.log(`✅ Granted ${exports.INITIAL_CREDITS_GRANT} credits to user ${userId}`);
}
/**
 * Hold credits for match entry (freeze amount)
 * Credits are frozen but not yet deducted
 */
async function holdCredits(userId, amount, matchId) {
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
        const mainRef = db.collection('user_credits').doc(userId);
        const doc = await transaction.get(mainRef);
        if (!doc.exists) {
            throw new Error('User credits not initialized');
        }
        const current = doc.data();
        if (current.balance < amount) {
            throw new Error(`Insufficient balance: need ${amount}, have ${current.balance}`);
        }
        const historyRef = mainRef.collection('history').doc();
        const event = {
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
async function releaseCredits(userId, amount, matchId) {
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
        const mainRef = db.collection('user_credits').doc(userId);
        const doc = await transaction.get(mainRef);
        if (!doc.exists) {
            throw new Error('User credits not initialized');
        }
        const current = doc.data();
        const historyRef = mainRef.collection('history').doc();
        const event = {
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
async function deductCredits(userId, amount, matchId, reason = 'Match loss') {
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
        const mainRef = db.collection('user_credits').doc(userId);
        const doc = await transaction.get(mainRef);
        if (!doc.exists) {
            throw new Error('User credits not initialized');
        }
        const current = doc.data();
        const historyRef = mainRef.collection('history').doc();
        const event = {
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
async function rewardCredits(userId, amount, matchId) {
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
        const mainRef = db.collection('user_credits').doc(userId);
        const doc = await transaction.get(mainRef);
        if (!doc.exists) {
            throw new Error('User credits not initialized');
        }
        const current = doc.data();
        const historyRef = mainRef.collection('history').doc();
        const event = {
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
 * Get credit transaction history
 */
async function getCreditHistory(userId, limit = 50) {
    const historyRef = db
        .collection('user_credits')
        .doc(userId)
        .collection('history')
        .orderBy('timestamp', 'desc')
        .limit(limit);
    const snapshot = await historyRef.get();
    return snapshot.docs.map(doc => doc.data());
}
//# sourceMappingURL=creditManager.js.map