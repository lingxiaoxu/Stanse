#!/usr/bin/env node
/**
 * Process Trial End Charges
 *
 * This script should run daily to check for trials that have ended
 * and generate prorated charges for the remaining days in the month.
 *
 * Schedule: Daily at midnight UTC
 * Cloud Scheduler: 0 0 * * * (Every day at midnight)
 *
 * Logic:
 * - Find subscriptions where trialEndsAt <= now
 * - Calculate prorated amount from trial end to month end
 * - Generate billing record
 * - Clear trialEndsAt field
 *
 * Run: npx tsx scripts/subscription/process-trial-end-charges.ts
 */

import admin from 'firebase-admin';

try {
  admin.app();
} catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();
const MONTHLY_PRICE = 29.99;

/**
 * Calculate prorated amount from trial end to period end
 */
function calculateProratedFromTrialEnd(trialEndDate: Date, periodEndDate: Date): number {
  const trialEnd = new Date(trialEndDate);
  const periodEnd = new Date(periodEndDate);

  // Days from trial end to period end
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const daysBilled = Math.ceil((periodEnd.getTime() - trialEnd.getTime()) / millisecondsPerDay);

  if (daysBilled <= 0) return 0;

  // Days in the billing month (month of trial end date)
  const daysInMonth = new Date(
    trialEnd.getFullYear(),
    trialEnd.getMonth() + 1,
    0
  ).getDate();

  const amount = (MONTHLY_PRICE * daysBilled) / daysInMonth;
  return Math.round(amount * 100) / 100; // Round to 2 decimals
}

async function processTrialEndCharges() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Processing Trial End Charges');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log('');

  try {
    const now = new Date();
    const subsRef = db.collection('user_subscriptions');

    // Get all active subscriptions
    const snapshot = await subsRef.where('status', '==', 'active').get();

    if (snapshot.empty) {
      console.log('✅ No active subscriptions found');
      return;
    }

    console.log(`Found ${snapshot.size} active subscriptions`);
    console.log('');

    let processedCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
      const subData = doc.data();
      const userId = doc.id;

      // Check if trial end date exists and has passed
      if (!subData.trialEndsAt) {
        skippedCount++;
        continue; // No trial to process (already processed or never had trial)
      }

      const trialEndDate = new Date(subData.trialEndsAt);
      if (trialEndDate > now) {
        skippedCount++;
        continue; // Trial hasn't ended yet
      }

      // Trial has ended! Generate prorated charge
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userEmail = userDoc.data()?.email || 'N/A';

        console.log(`📝 Processing: ${userEmail} (${userId})`);
        console.log(`   Trial ended: ${trialEndDate.toISOString()}`);

        // Calculate prorated amount from trial end to current period end
        const periodEnd = new Date(subData.currentPeriodEnd);
        const proratedAmount = calculateProratedFromTrialEnd(trialEndDate, periodEnd);

        console.log(`   Period end: ${periodEnd.toISOString()}`);
        console.log(`   Prorated amount: $${proratedAmount.toFixed(2)}`);

        // Add billing record
        const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
        const periodString = `${trialEndDate.getFullYear()}-${String(trialEndDate.getMonth() + 1).padStart(2, '0')}`;

        await historyRef.add({
          type: 'TRIAL_END_CHARGE',
          amount: proratedAmount,
          period: periodString,
          timestamp: now.toISOString()
        });

        // Update subscription: clear trialEndsAt, update latestAmount
        await doc.ref.update({
          trialEndsAt: admin.firestore.FieldValue.delete(),
          latestAmount: proratedAmount,
          updatedAt: now.toISOString()
        });

        console.log(`   ✅ Charged $${proratedAmount.toFixed(2)}`);
        processedCount++;
      } catch (error: any) {
        console.error(`   ❌ Failed to process ${userId}:`, error.message);
      }

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total subscriptions checked: ${snapshot.size}`);
    console.log(`Trial end charges processed: ${processedCount}`);
    console.log(`Skipped (trial not ended or no trial): ${skippedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

processTrialEndCharges()
  .then(() => {
    console.log('\n✅ Trial end processing completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Trial end processing failed:', error);
    process.exit(1);
  });
