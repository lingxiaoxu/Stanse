import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

admin.initializeApp();
const db = admin.firestore();
const secretClient = new SecretManagerServiceClient();

const MONTHLY_PRICE = 29.99;
const ADMIN_EMAIL = 'lxu912@gmail.com';
const FROM_EMAIL = 'lxu912@gmail.com'; // Must be verified in SendGrid
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135'; // Where Secret Manager is
const SENDGRID_SECRET_NAME = 'SENDGRID_API_KEY'; // Your secret name in Secret Manager (case-sensitive!)

// Cache for SendGrid API key (loaded once per function instance)
let sendgridApiKey: string | null = null;

/**
 * Get SendGrid API key from Google Secret Manager
 */
async function getSendGridApiKey(): Promise<string> {
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
      sgMail.setApiKey(apiKey);
      sendgridApiKey = apiKey; // Cache it
      console.log('✅ SendGrid API key loaded from Secret Manager (cross-project)');
      return apiKey;
    }
  } catch (error) {
    console.error('Failed to load SendGrid API key from Secret Manager:', error);
  }

  return '';
}

/**
 * Send email notification via SendGrid
 * Falls back to logging if SendGrid not configured
 */
async function sendEmailNotification(
  subject: string,
  body: string,
  isError: boolean = false
): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📧 Email Notification: ${subject}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(body);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Load SendGrid API key from Secret Manager
  const apiKey = await getSendGridApiKey();

  if (apiKey) {
    try {
      await sgMail.send({
        to: ADMIN_EMAIL,
        from: FROM_EMAIL,
        subject: subject,
        text: body,
        html: `<pre style="font-family: monospace; font-size: 12px;">${body}</pre>`
      });
      console.log(`✅ Email sent successfully to ${ADMIN_EMAIL}`);
    } catch (error: any) {
      console.error('❌ Failed to send email via SendGrid:', error.message);
      if (error.response) {
        console.error('SendGrid error:', error.response.body);
      }
    }
  } else {
    console.log('ℹ️ Email not sent (SendGrid API key not available)');
  }
}

/**
 * Process trial end charges - runs daily at midnight UTC
 */
export const processTrialEndCharges = functions.scheduler.onSchedule(
  {
    schedule: '0 0 * * *', // Every day at midnight UTC
    timeZone: 'UTC',
    region: 'us-central1'
  },
  async (event) => {
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
      const errors: string[] = [];

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
            const daysInMonth = new Date(
              trialEndDate.getFullYear(),
              trialEndDate.getMonth() + 1,
              0
            ).getDate();
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
          } catch (e) {
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
          } catch (eventError) {
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
        } catch (error: any) {
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
      const revenueData: any = {
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

      await sendEmailNotification(
        `[Stanse] Daily Trial Check - ${processedCount} Processed`,
        emailBody,
        errorCount > 0
      );

      console.log(`✅ Completed: ${processedCount} processed, ${errorCount} errors, $${totalRevenue.toFixed(2)} revenue`);
    } catch (error: any) {
      console.error('Fatal error:', error);

      await sendEmailNotification(
        '[Stanse] Daily Trial Check - FAILED',
        `Fatal error occurred:\n\n${error.message}\n\n${error.stack}`,
        true
      );

      throw error;
    }
  }
);

/**
 * Process monthly renewals - runs on 1st of every month at midnight UTC
 */
export const processMonthlyRenewals = functions.scheduler.onSchedule(
  {
    schedule: '0 0 1 * *', // 1st of every month at midnight UTC
    timeZone: 'UTC',
    region: 'us-central1'
  },
  async (event) => {
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
      const errors: string[] = [];

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
          } else {
            // Promo expired - check if user has payment method
            const promoCodeUsed = subData.promoCodeUsed || '';
            let userEmail = '';
            try {
              const userDoc = await db.collection('users').doc(userId).get();
              userEmail = userDoc.data()?.email || '';
            } catch (e) {
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
            } catch (eventError) {
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

        try{
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
        } catch (error: any) {
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
      const revenueData: any = {
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

      await sendEmailNotification(
        `[Stanse] Monthly Renewal - $${totalRevenue.toFixed(2)} Revenue`,
        emailBody,
        errorCount > 0
      );

      console.log(`✅ Completed: ${processedCount} renewals, $${totalRevenue.toFixed(2)} revenue`);
    } catch (error: any) {
      console.error('Fatal error:', error);

      await sendEmailNotification(
        '[Stanse] Monthly Renewal - FAILED',
        `Fatal error occurred:\n\n${error.message}\n\n${error.stack}`,
        true
      );

      throw error;
    }
  }
);
