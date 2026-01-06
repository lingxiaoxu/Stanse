#!/usr/bin/env node
/**
 * Monthly Subscription Renewal Script
 *
 * This script processes monthly renewals for all active subscriptions.
 * Run on the 1st of every month to charge $29.99 for full month.
 *
 * Cloud Scheduler setup (recommended):
 *   Schedule: 0 0 1 * * (Every month on 1st at midnight UTC)
 *   Target: Cloud Run job that calls processMonthlyRenewals()
 *
 * Manual run: npx tsx scripts/subscription/run-monthly-renewal.ts
 */

import admin from 'firebase-admin';
import { collection, query, where, getDocs, addDoc, updateDoc } from 'firebase/firestore';

// Initialize Firebase Admin
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

async function runMonthlyRenewal() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Monthly Subscription Renewal');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log('');

  try {
    const subsRef = db.collection('user_subscriptions');
    const snapshot = await subsRef.where('status', '==', 'active').get();

    if (snapshot.empty) {
      console.log('✅ No active subscriptions found');
      return { processed: 0, errors: 0, totalRevenue: 0 };
    }

    console.log(`Found ${snapshot.size} active subscriptions`);
    console.log('');

    const now = new Date();
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(1);
    currentPeriodStart.setHours(0, 0, 0, 0);

    const currentPeriodEnd = new Date(currentPeriodStart);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const periodString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let processedCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
      const userId = doc.id;
      const userData = doc.data();

      try {
        // Get user email for logging
        const userDoc = await db.collection('users').doc(userId).get();
        const userEmail = userDoc.data()?.email || 'N/A';

        console.log(`📝 Processing: ${userEmail} (${userId})`);

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

        console.log(`  ✅ Charged $${MONTHLY_PRICE.toFixed(2)} for period ${periodString}`);
        processedCount++;
      } catch (error: any) {
        console.error(`  ❌ Failed to process ${userId}:`, error.message);
        errorCount++;
      }

      console.log('');
    }

    const totalRevenue = processedCount * MONTHLY_PRICE;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Renewal Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total active subscriptions: ${snapshot.size}`);
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total revenue (simulated): $${totalRevenue.toFixed(2)}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return { processed: processedCount, errors: errorCount, totalRevenue };
  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    throw error;
  }
}

runMonthlyRenewal()
  .then(() => {
    console.log('\n✅ Monthly renewal completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Monthly renewal failed:', error);
    process.exit(1);
  });
