import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const MONTHLY_PRICE = 29.99;
const ADMIN_EMAIL = 'lx2158@columbia.edu'; // Configure this

/**
 * Send email notification (using Gmail SMTP via Sendgrid/similar in production)
 * For now, just logs - integrate with SendGrid/AWS SES/Gmail API as needed
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

  // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
  // Example with SendGrid:
  // await sendgrid.send({
  //   to: ADMIN_EMAIL,
  //   from: 'noreply@stanse.app',
  //   subject: subject,
  //   text: body
  // });

  // For now, just log to Cloud Functions logs
  if (isError) {
    console.error('❌ ERROR EMAIL:', subject);
  } else {
    console.log('✅ SUCCESS EMAIL:', subject);
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
      let skippedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

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

${errors.length > 0 ? `\nErrors:\n${errors.join('\n')}` : ''}

Status: ${errorCount > 0 ? 'COMPLETED WITH ERRORS' : 'SUCCESS'}
      `.trim();

      await sendEmailNotification(
        `[Stanse] Daily Trial Check - ${processedCount} Processed`,
        emailBody,
        errorCount > 0
      );

      return { success: true, processed: processedCount, errors: errorCount };
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
      let errorCount = 0;
      const errors: string[] = [];

      for (const doc of snapshot.docs) {
        const userId = doc.id;

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

          processedCount++;
        } catch (error: any) {
          console.error(`Failed to renew ${userId}:`, error);
          errors.push(`${userId}: ${error.message}`);
          errorCount++;
        }
      }

      const totalRevenue = processedCount * MONTHLY_PRICE;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Send summary email
      const emailBody = `
Monthly Renewal Summary
======================

Run Date: ${now.toISOString()}
Period: ${periodString}
Duration: ${duration}s

Results:
- Active subscriptions: ${snapshot.size}
- Successfully renewed: ${processedCount}
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

      return { success: true, processed: processedCount, revenue: totalRevenue };
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
