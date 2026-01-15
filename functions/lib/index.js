"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDuelQuestions = exports.generateDuelSequences = exports.getDuelMatchSequence = exports.getDuelSequenceStats = exports.getDuelQuestionStats = exports.populateDuelQuestions = exports.finalizeDuelMatch = exports.submitDuelAnswer = exports.withdrawDuelCredits = exports.refundDuelCredits = exports.addDuelCredits = exports.getDuelCreditHistory = exports.getDuelCredits = exports.leaveDuelQueue = exports.joinDuelQueue = exports.checkDuelMatchmaking = exports.runDuelMatchmaking = exports.processMonthlyRenewals = exports.processTrialEndCharges = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const mail_1 = __importDefault(require("@sendgrid/mail"));
const secret_manager_1 = require("@google-cloud/secret-manager");
admin.initializeApp();
const db = admin.firestore();
const secretClient = new secret_manager_1.SecretManagerServiceClient();
const MONTHLY_PRICE = 29.99;
const ADMIN_EMAIL = 'lxu912@gmail.com';
const FROM_EMAIL = 'lxu912@gmail.com'; // Must be verified in SendGrid
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135'; // Where Secret Manager is
const SENDGRID_SECRET_NAME = 'SENDGRID_API_KEY'; // Your secret name in Secret Manager (case-sensitive!)
// Cache for SendGrid API key (loaded once per function instance)
let sendgridApiKey = null;
/**
 * Get SendGrid API key from Google Secret Manager
 */
async function getSendGridApiKey() {
    if (sendgridApiKey) {
        return sendgridApiKey;
    }
    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${SENDGRID_SECRET_NAME}/versions/latest`,
        });
        const payload = version.payload?.data?.toString();
        if (payload) {
            const apiKey = payload;
            mail_1.default.setApiKey(apiKey);
            sendgridApiKey = apiKey; // Cache it
            console.log('✅ SendGrid API key loaded from Secret Manager (cross-project)');
            return apiKey;
        }
    }
    catch (error) {
        console.error('Failed to load SendGrid API key from Secret Manager:', error);
    }
    return '';
}
/**
 * Send email notification via SendGrid
 * Falls back to logging if SendGrid not configured
 */
async function sendEmailNotification(subject, body, isError = false) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 Email Notification: ${subject}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(body);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // Load SendGrid API key from Secret Manager
    const apiKey = await getSendGridApiKey();
    if (apiKey) {
        try {
            await mail_1.default.send({
                to: ADMIN_EMAIL,
                from: FROM_EMAIL,
                subject: subject,
                text: body,
                html: `<pre style="font-family: monospace; font-size: 12px;">${body}</pre>`
            });
            console.log(`✅ Email sent successfully to ${ADMIN_EMAIL}`);
        }
        catch (error) {
            console.error('❌ Failed to send email via SendGrid:', error.message);
            if (error.response) {
                console.error('SendGrid error:', error.response.body);
            }
        }
    }
    else {
        console.log('ℹ️ Email not sent (SendGrid API key not available)');
    }
}
/**
 * Process trial end charges - runs daily at midnight UTC
 */
exports.processTrialEndCharges = functions.scheduler.onSchedule({
    schedule: '0 0 * * *', // Every day at midnight UTC
    timeZone: 'UTC',
    region: 'us-central1'
}, async (event) => {
    const startTime = Date.now();
    console.log('🔄 Starting daily trial end processing...');
    try {
        const now = new Date();
        const subsRef = db.collection('user_subscriptions');
        const snapshot = await subsRef.where('status', '==', 'active').get();
        let processedCount = 0;
        let skippedPromoCount = 0;
        let skippedTrialCount = 0;
        let errorCount = 0;
        const errors = [];
        for (const doc of snapshot.docs) {
            const subData = doc.data();
            const userId = doc.id;
            // Skip if user is in promo period
            if (subData.promoExpiresAt) {
                const promoExpiry = new Date(subData.promoExpiresAt);
                if (promoExpiry > now) {
                    console.log(`⏭️  Skipping ${userId}: Promo active until ${subData.promoExpiresAt}`);
                    skippedPromoCount++;
                    continue;
                }
            }
            // Check if trial end date exists and has passed
            if (!subData.trialEndsAt) {
                continue; // Already processed or no trial
            }
            const trialEndDate = new Date(subData.trialEndsAt);
            if (trialEndDate > now) {
                skippedTrialCount++;
                continue;
            }
            try {
                // Calculate prorated amount from trial end to period end
                const periodEnd = new Date(subData.currentPeriodEnd);
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                const daysBilled = Math.ceil((periodEnd.getTime() - trialEndDate.getTime()) / millisecondsPerDay);
                let proratedAmount = 0;
                if (daysBilled > 0) {
                    const daysInMonth = new Date(trialEndDate.getFullYear(), trialEndDate.getMonth() + 1, 0).getDate();
                    proratedAmount = Math.round((MONTHLY_PRICE * daysBilled * 100) / daysInMonth) / 100;
                }
                // Add billing record
                const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
                const periodString = `${trialEndDate.getFullYear()}-${String(trialEndDate.getMonth() + 1).padStart(2, '0')}`;
                await historyRef.add({
                    type: 'TRIAL_END_CHARGE',
                    amount: proratedAmount,
                    period: periodString,
                    timestamp: now.toISOString()
                });
                // Get user email for event tracking
                let userEmail = '';
                try {
                    const userDoc = await db.collection('users').doc(userId).get();
                    userEmail = userDoc.data()?.email || '';
                }
                catch (e) {
                    console.error(`Failed to get email for ${userId}`);
                }
                // Record TRIAL_END event
                try {
                    await db.collection('subscription_events').add({
                        userId,
                        userEmail,
                        eventType: 'TRIAL_END',
                        timestamp: now.toISOString(),
                        metadata: {
                            convertedToActive: true,
                            chargedAmount: proratedAmount
                        }
                    });
                    console.log(`📊 Event tracked: TRIAL_END for ${userId}`);
                }
                catch (eventError) {
                    console.error('Failed to record TRIAL_END event (non-critical):', eventError);
                }
                // Clear trialEndsAt
                await doc.ref.update({
                    trialEndsAt: admin.firestore.FieldValue.delete(),
                    latestAmount: proratedAmount,
                    updatedAt: now.toISOString()
                });
                console.log(`✅ Charged ${userId}: $${proratedAmount.toFixed(2)}`);
                processedCount++;
            }
            catch (error) {
                console.error(`❌ Failed to process ${userId}:`, error);
                errors.push(`${userId}: ${error.message}`);
                errorCount++;
            }
        }
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const totalRevenue = processedCount * MONTHLY_PRICE; // Approximate (actual amounts vary)
        const avgRevenue = processedCount > 0 ? totalRevenue / processedCount : 0;
        const totalSkipped = skippedPromoCount + skippedTrialCount;
        // Calculate potential revenue and loss
        const potentialRevenue = (processedCount + skippedPromoCount) * MONTHLY_PRICE;
        const revenueLoss = skippedPromoCount * MONTHLY_PRICE;
        // Save to revenue collection for reporting
        const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const revenueData = {
            type: 'TRIAL_END_CHARGE',
            period: periodString,
            timestamp: now.toISOString(),
            totalSubscriptions: snapshot.size,
            chargedCount: processedCount,
            skippedCount: totalSkipped,
            skippedPromoCount: skippedPromoCount,
            skippedTrialCount: skippedTrialCount,
            errorCount: errorCount,
            totalRevenue: totalRevenue,
            potentialRevenue: potentialRevenue,
            revenueLoss: revenueLoss,
            averageRevenue: avgRevenue
        };
        if (errors.length > 0) {
            revenueData.details = { errors: errors };
        }
        await db.collection('revenue').add(revenueData);
        // Send summary email
        const emailBody = `
Trial End Charges Summary
========================

Run Date: ${now.toISOString()}
Duration: ${duration}s

Results:
- Total subscriptions checked: ${snapshot.size}
- Trial end charges processed: ${processedCount}
- Skipped (promo active): ${skippedPromoCount}
- Skipped (trial active): ${skippedTrialCount}
- Errors: ${errorCount}
- Total revenue: $${totalRevenue.toFixed(2)}

${errors.length > 0 ? `\nErrors:\n${errors.join('\n')}` : ''}

Status: ${errorCount > 0 ? 'COMPLETED WITH ERRORS' : 'SUCCESS'}
      `.trim();
        await sendEmailNotification(`[Stanse] Daily Trial Check - ${processedCount} Processed`, emailBody, errorCount > 0);
        console.log(`✅ Completed: ${processedCount} processed, ${errorCount} errors, $${totalRevenue.toFixed(2)} revenue`);
    }
    catch (error) {
        console.error('Fatal error:', error);
        await sendEmailNotification('[Stanse] Daily Trial Check - FAILED', `Fatal error occurred:\n\n${error.message}\n\n${error.stack}`, true);
        throw error;
    }
});
/**
 * Process monthly renewals - runs on 1st of every month at midnight UTC
 */
exports.processMonthlyRenewals = functions.scheduler.onSchedule({
    schedule: '0 0 1 * *', // 1st of every month at midnight UTC
    timeZone: 'UTC',
    region: 'us-central1'
}, async (event) => {
    const startTime = Date.now();
    console.log('🔄 Starting monthly renewal processing...');
    try {
        const now = new Date();
        const subsRef = db.collection('user_subscriptions');
        const snapshot = await subsRef.where('status', '==', 'active').get();
        const currentPeriodStart = new Date(now);
        currentPeriodStart.setDate(1);
        currentPeriodStart.setHours(0, 0, 0, 0);
        const currentPeriodEnd = new Date(currentPeriodStart);
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let processedCount = 0;
        let skippedPromoCount = 0;
        let skippedTrialCount = 0;
        let errorCount = 0;
        const errors = [];
        for (const doc of snapshot.docs) {
            const subData = doc.data();
            const userId = doc.id;
            // Skip if user is in promo period
            if (subData.promoExpiresAt) {
                const promoExpiry = new Date(subData.promoExpiresAt);
                if (promoExpiry > now) {
                    console.log(`⏭️  Skipping ${userId}: Promo active until ${subData.promoExpiresAt}`);
                    skippedPromoCount++;
                    continue;
                }
                else {
                    // Promo expired - check if user has payment method
                    const promoCodeUsed = subData.promoCodeUsed || '';
                    let userEmail = '';
                    try {
                        const userDoc = await db.collection('users').doc(userId).get();
                        userEmail = userDoc.data()?.email || '';
                    }
                    catch (e) {
                        console.error(`Failed to get email for ${userId}`);
                    }
                    // Check for payment method
                    const paymentDoc = await db.collection('payment_methods').doc(userId).get();
                    if (!paymentDoc.exists) {
                        // No payment method after promo - cancel subscription
                        console.log(`⚠️  Promo expired, no payment method for ${userId}, canceling`);
                        await doc.ref.update({
                            status: 'cancelled',
                            promoExpiresAt: admin.firestore.FieldValue.delete(),
                            promoEndedWithoutPayment: true, // Flag for notification
                            updatedAt: now.toISOString()
                        });
                        const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
                        await historyRef.add({
                            type: 'CANCEL',
                            amount: 0,
                            period: periodString,
                            timestamp: now.toISOString()
                        });
                        errors.push(`${userId}: Promo ended, no payment method, auto-canceled`);
                        errorCount++;
                        continue;
                    }
                    // Has payment method - record PROMO_END and continue to renewal
                    try {
                        await db.collection('subscription_events').add({
                            userId,
                            userEmail,
                            eventType: 'PROMO_END',
                            timestamp: now.toISOString(),
                            metadata: {
                                convertedToActive: true,
                                promoCodeUsed
                            }
                        });
                        console.log(`📊 Event tracked: PROMO_END for ${userId}`);
                    }
                    catch (eventError) {
                        console.error('Failed to record PROMO_END event (non-critical):', eventError);
                    }
                    await doc.ref.update({
                        promoExpiresAt: admin.firestore.FieldValue.delete(),
                        updatedAt: now.toISOString()
                    });
                    console.log(`✅ Cleared expired promo for ${userId}, will proceed to renewal`);
                }
            }
            // Skip if user still in trial period
            if (subData.trialEndsAt) {
                const trialEndDate = new Date(subData.trialEndsAt);
                if (trialEndDate > now) {
                    console.log(`⏭️  Skipping ${userId}: Still in trial (ends ${subData.trialEndsAt})`);
                    skippedTrialCount++;
                    continue;
                }
            }
            try {
                // Check if user has payment method
                const paymentDoc = await db.collection('payment_methods').doc(userId).get();
                if (!paymentDoc.exists) {
                    // No payment method - cancel subscription instead of renewing
                    console.log(`⚠️  No payment method for ${userId}, canceling subscription`);
                    await doc.ref.update({
                        status: 'cancelled',
                        updatedAt: now.toISOString()
                    });
                    const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
                    await historyRef.add({
                        type: 'CANCEL',
                        amount: 0,
                        period: periodString,
                        timestamp: now.toISOString()
                    });
                    errors.push(`${userId}: No payment method, subscription auto-canceled`);
                    errorCount++;
                    continue;
                }
                // Add billing history record
                const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
                await historyRef.add({
                    type: 'RENEW',
                    amount: MONTHLY_PRICE,
                    period: periodString,
                    timestamp: now.toISOString()
                });
                // Update subscription document
                await doc.ref.update({
                    currentPeriodStart: currentPeriodStart.toISOString(),
                    currentPeriodEnd: currentPeriodEnd.toISOString(),
                    latestAmount: MONTHLY_PRICE,
                    updatedAt: now.toISOString()
                });
                console.log(`✅ Renewed ${userId}: $${MONTHLY_PRICE}`);
                processedCount++;
            }
            catch (error) {
                console.error(`Failed to renew ${userId}:`, error);
                errors.push(`${userId}: ${error.message}`);
                errorCount++;
            }
        }
        const totalRevenue = processedCount * MONTHLY_PRICE;
        const avgRevenue = processedCount > 0 ? totalRevenue / processedCount : 0;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const totalSkipped = skippedPromoCount + skippedTrialCount;
        // Calculate potential revenue and loss
        const potentialRevenue = (processedCount + skippedPromoCount) * MONTHLY_PRICE;
        const revenueLoss = skippedPromoCount * MONTHLY_PRICE;
        // Save to revenue collection for reporting
        const revenueData = {
            type: 'MONTHLY_RENEWAL',
            period: periodString,
            timestamp: now.toISOString(),
            totalSubscriptions: snapshot.size,
            chargedCount: processedCount,
            skippedCount: totalSkipped,
            skippedPromoCount: skippedPromoCount,
            skippedTrialCount: skippedTrialCount,
            errorCount: errorCount,
            totalRevenue: totalRevenue,
            potentialRevenue: potentialRevenue,
            revenueLoss: revenueLoss,
            averageRevenue: avgRevenue
        };
        if (errors.length > 0) {
            revenueData.details = { errors: errors };
        }
        await db.collection('revenue').add(revenueData);
        // Send summary email
        const emailBody = `
Monthly Renewal Summary
======================

Run Date: ${now.toISOString()}
Period: ${periodString}
Duration: ${duration}s

Results:
- Active subscriptions checked: ${snapshot.size}
- Successfully renewed: ${processedCount}
- Skipped (promo active): ${skippedPromoCount}
- Skipped (still in trial): ${skippedTrialCount}
- Errors: ${errorCount}
- Total revenue: $${totalRevenue.toFixed(2)}

${errors.length > 0 ? `\nErrors:\n${errors.join('\n')}` : ''}

Status: ${errorCount > 0 ? 'COMPLETED WITH ERRORS' : 'SUCCESS'}
      `.trim();
        await sendEmailNotification(`[Stanse] Monthly Renewal - $${totalRevenue.toFixed(2)} Revenue`, emailBody, errorCount > 0);
        console.log(`✅ Completed: ${processedCount} renewals, $${totalRevenue.toFixed(2)} revenue`);
    }
    catch (error) {
        console.error('Fatal error:', error);
        await sendEmailNotification('[Stanse] Monthly Renewal - FAILED', `Fatal error occurred:\n\n${error.message}\n\n${error.stack}`, true);
        throw error;
    }
});
// ==================== DUEL Arena Cloud Functions ====================
const matchmaking_1 = require("./duel/matchmaking");
const settlement_1 = require("./duel/settlement");
const creditManager_1 = require("./duel/creditManager");
const populate_duel_questions_1 = require("./scripts/populate-duel-questions");
// DUEL Arena Agents
const agents_1 = require("./duel/agents");
/**
 * Matchmaking Scheduler - Runs every 1 minute
 * Matches waiting users based on stance type, ping, and entry fee
 * Also creates AI opponents for users waiting > 30 seconds
 */
exports.runDuelMatchmaking = functions.scheduler.onSchedule({
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    region: 'us-central1'
}, async () => {
    await (0, matchmaking_1.processMatchmakingQueue)();
});
/**
 * Force Matchmaking Check (HTTP Callable)
 * Client can call this after waiting to trigger AI opponent creation
 */
exports.checkDuelMatchmaking = functions.https.onCall(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        // Run matchmaking which will create AI opponent if user waited > 30s
        await (0, matchmaking_1.processMatchmakingQueue)();
        return { success: true };
    }
    catch (error) {
        console.error('Error checking matchmaking:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Join Matchmaking Queue (HTTP Callable)
 * Also triggers immediate matchmaking attempt
 */
exports.joinDuelQueue = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const queueId = await (0, matchmaking_1.joinMatchmakingQueue)({
            userId: auth.uid,
            stanceType: data.stanceType,
            personaLabel: data.personaLabel,
            pingMs: data.pingMs,
            entryFee: data.entryFee,
            safetyBelt: data.safetyBelt,
            duration: data.duration
        });
        // Trigger immediate matchmaking attempt (non-blocking)
        // This allows instant matching if another player is waiting
        (0, matchmaking_1.processMatchmakingQueue)().catch(err => {
            console.error('Background matchmaking error:', err);
        });
        return { success: true, queueId };
    }
    catch (error) {
        console.error('Error joining queue:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Leave Matchmaking Queue (HTTP Callable)
 */
exports.leaveDuelQueue = functions.https.onCall(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        await (0, matchmaking_1.leaveMatchmakingQueue)(auth.uid);
        return { success: true };
    }
    catch (error) {
        console.error('Error leaving queue:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Get User Credits (HTTP Callable)
 */
exports.getDuelCredits = functions.https.onCall(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const credits = await (0, creditManager_1.getUserCredits)(auth.uid);
        return { success: true, credits };
    }
    catch (error) {
        console.error('Error getting credits:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Get Credit History (HTTP Callable)
 */
exports.getDuelCreditHistory = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const limit = data?.limit || 50;
        const history = await (0, creditManager_1.getCreditHistory)(auth.uid, limit);
        return { success: true, history };
    }
    catch (error) {
        console.error('Error getting credit history:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Add Credits (HTTP Callable) - For testing/deposit simulation
 * Adds credits to user's balance
 */
exports.addDuelCredits = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const amount = data?.amount || 100;
    if (amount <= 0 || amount > 1000) {
        throw new functions.https.HttpsError('invalid-argument', 'Amount must be between 1 and 1000');
    }
    try {
        const now = new Date().toISOString();
        const mainRef = db.collection('user_credits').doc(auth.uid);
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(mainRef);
            if (!doc.exists) {
                // Create new user credits document
                const newDoc = {
                    userId: auth.uid,
                    balance: amount,
                    totalGranted: amount,
                    totalSpent: 0,
                    totalEarned: 0,
                    updatedAt: now,
                    lastTransactionAt: now
                };
                transaction.set(mainRef, newDoc);
            }
            else {
                const current = doc.data();
                transaction.update(mainRef, {
                    balance: current.balance + amount,
                    totalGranted: (current.totalGranted || 0) + amount,
                    updatedAt: now,
                    lastTransactionAt: now
                });
            }
            // Add history entry
            const historyRef = mainRef.collection('history').doc();
            transaction.set(historyRef, {
                eventId: historyRef.id,
                type: 'GRANT',
                amount,
                balanceBefore: doc.exists ? doc.data().balance : 0,
                balanceAfter: (doc.exists ? doc.data().balance : 0) + amount,
                timestamp: now,
                metadata: {
                    reason: 'Deposit',
                    description: 'User deposit simulation'
                }
            });
        });
        const updatedDoc = await mainRef.get();
        return { success: true, credits: updatedDoc.data() };
    }
    catch (error) {
        console.error('Error adding credits:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Refund Credits (HTTP Callable)
 * Releases held credits back to user when match fails/errors
 */
exports.refundDuelCredits = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const matchId = data?.matchId;
    const amount = data?.amount;
    if (!matchId || typeof amount !== 'number' || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'matchId and positive amount required');
    }
    try {
        await (0, creditManager_1.releaseCredits)(auth.uid, amount, matchId);
        // Get updated balance
        const credits = await (0, creditManager_1.getUserCredits)(auth.uid);
        return { success: true, credits };
    }
    catch (error) {
        console.error('Error refunding credits:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Withdraw Credits (HTTP Callable)
 * Deducts credits from user balance (withdrawal simulation)
 */
exports.withdrawDuelCredits = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const amount = data?.amount;
    if (typeof amount !== 'number' || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Positive amount required');
    }
    try {
        await (0, creditManager_1.withdrawCredits)(auth.uid, amount);
        // Get updated balance
        const credits = await (0, creditManager_1.getUserCredits)(auth.uid);
        return { success: true, credits };
    }
    catch (error) {
        console.error('Error withdrawing credits:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Submit Gameplay Event (HTTP Callable)
 * Records each question answered during match
 */
exports.submitDuelAnswer = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        await (0, settlement_1.submitGameplayEvent)({
            matchId: data.matchId,
            userId: auth.uid,
            questionId: data.questionId,
            questionOrder: data.questionOrder,
            answerIndex: data.answerIndex,
            timestamp: data.timestamp,
            timeElapsed: data.timeElapsed
        });
        return { success: true };
    }
    catch (error) {
        console.error('Error submitting answer:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Finalize Match (HTTP Callable)
 * Called when match time expires
 */
exports.finalizeDuelMatch = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        await (0, settlement_1.finalizeMatch)(data.matchId);
        return { success: true };
    }
    catch (error) {
        console.error('Error finalizing match:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Populate Questions (HTTP Callable - Admin Only)
 * One-time function to populate 150 questions to Firestore
 */
exports.populateDuelQuestions = functions.https.onCall(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const result = await (0, populate_duel_questions_1.populateQuestions)();
        return result;
    }
    catch (error) {
        console.error('Error populating questions:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// ==================== DUEL Arena Agent Functions ====================
/**
 * Get Question Stats (HTTP Callable)
 * Returns stats about questions in duel_questions collection
 */
exports.getDuelQuestionStats = functions.https.onCall(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const result = await (0, agents_1.getQuestionStats)();
        if (!result.success) {
            throw new Error(result.error);
        }
        return { success: true, stats: result.data, logs: result.logs };
    }
    catch (error) {
        console.error('Error getting question stats:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Get Sequence Stats (HTTP Callable)
 * Returns stats about sequences in duel_sequences collection
 */
exports.getDuelSequenceStats = functions.https.onCall(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const result = await (0, agents_1.getSequenceStats)();
        if (!result.success) {
            throw new Error(result.error);
        }
        return { success: true, stats: result.data, logs: result.logs };
    }
    catch (error) {
        console.error('Error getting sequence stats:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Get Random Sequence for Match (HTTP Callable)
 * Used by matchmaking to get a sequence for a new match
 */
exports.getDuelMatchSequence = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const duration = data?.duration || 30;
    if (duration !== 30 && duration !== 45) {
        throw new functions.https.HttpsError('invalid-argument', 'Duration must be 30 or 45');
    }
    try {
        const result = await (0, agents_1.getRandomSequence)(duration);
        if (!result.success) {
            throw new Error(result.error);
        }
        return { success: true, sequence: result.data };
    }
    catch (error) {
        console.error('Error getting match sequence:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Generate All Sequences (HTTP Callable - Admin Only)
 * Generates and stores 12 pre-defined sequences to Firestore
 */
exports.generateDuelSequences = functions.https.onCall(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        // Generate sequences
        const genResult = await (0, agents_1.generateAllSequences)();
        if (!genResult.success || !genResult.data) {
            throw new Error(genResult.error || 'Failed to generate sequences');
        }
        // Store to Firestore
        const storeResult = await (0, agents_1.storeSequencesToFirestore)(genResult.data);
        if (!storeResult.success) {
            throw new Error(storeResult.error || 'Failed to store sequences');
        }
        return {
            success: true,
            count: storeResult.data,
            logs: [...genResult.logs, ...storeResult.logs]
        };
    }
    catch (error) {
        console.error('Error generating sequences:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Validate Questions (HTTP Callable)
 * Validates raw questions from complete-questions.json format
 */
exports.validateDuelQuestions = functions.https.onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    if (!data?.questions || !Array.isArray(data.questions)) {
        throw new functions.https.HttpsError('invalid-argument', 'questions array required');
    }
    try {
        const result = await (0, agents_1.batchValidateRawQuestions)(data.questions);
        return {
            success: result.success,
            validation: result.data,
            logs: result.logs
        };
    }
    catch (error) {
        console.error('Error validating questions:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=index.js.map