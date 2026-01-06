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
exports.processMonthlyRenewals = exports.processTrialEndCharges = void 0;
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
        let skippedCount = 0;
        let errorCount = 0;
        const errors = [];
        for (const doc of snapshot.docs) {
            const subData = doc.data();
            const userId = doc.id;
            // Check if trial end date exists and has passed
            if (!subData.trialEndsAt) {
                skippedCount++;
                continue;
            }
            const trialEndDate = new Date(subData.trialEndsAt);
            if (trialEndDate > now) {
                skippedCount++;
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
        // Save to revenue collection for reporting
        const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const revenueData = {
            type: 'TRIAL_END_CHARGE',
            period: periodString,
            timestamp: now.toISOString(),
            totalSubscriptions: snapshot.size,
            chargedCount: processedCount,
            skippedCount: skippedCount,
            errorCount: errorCount,
            totalRevenue: totalRevenue,
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
- Skipped (trial active): ${skippedCount}
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
        let skippedCount = 0;
        let errorCount = 0;
        const errors = [];
        for (const doc of snapshot.docs) {
            const subData = doc.data();
            const userId = doc.id;
            // Skip if user still in trial period
            if (subData.trialEndsAt) {
                const trialEndDate = new Date(subData.trialEndsAt);
                if (trialEndDate > now) {
                    console.log(`⏭️  Skipping ${userId}: Still in trial (ends ${subData.trialEndsAt})`);
                    skippedCount++;
                    continue;
                }
            }
            try {
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
        // Save to revenue collection for reporting
        const revenueData = {
            type: 'MONTHLY_RENEWAL',
            period: periodString,
            timestamp: now.toISOString(),
            totalSubscriptions: snapshot.size,
            chargedCount: processedCount,
            skippedCount: skippedCount,
            errorCount: errorCount,
            totalRevenue: totalRevenue,
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
- Skipped (still in trial): ${skippedCount}
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
//# sourceMappingURL=index.js.map