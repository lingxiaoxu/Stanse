#!/usr/bin/env node
/**
 * Backfill Subscription Events
 *
 * Creates SUBSCRIBE events for existing subscriptions that don't have events yet.
 * This is needed for users who subscribed before event tracking was implemented.
 *
 * Run: npx tsx scripts/subscription/backfill-subscription-events.ts
 */

import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function backfillEvents() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Backfilling Subscription Events');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // Get all subscriptions
    const subsSnapshot = await db.collection('user_subscriptions').get();
    console.log(`Found ${subsSnapshot.size} subscriptions`);
    console.log('');

    // Get all existing events
    const eventsSnapshot = await db.collection('subscription_events').get();
    const existingUserIds = new Set(eventsSnapshot.docs.map(d => d.data().userId));
    console.log(`Found ${eventsSnapshot.size} existing events for ${existingUserIds.size} users`);
    console.log('');

    let backfilledCount = 0;
    let skippedCount = 0;

    for (const subDoc of subsSnapshot.docs) {
      const userId = subDoc.id;
      const subData = subDoc.data();

      // Skip if user already has events
      if (existingUserIds.has(userId)) {
        console.log(`⏭️  Skipping ${userId}: Already has events`);
        skippedCount++;
        continue;
      }

      // Get user email
      let userEmail = '';
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        userEmail = userDoc.data()?.email || 'unknown@example.com';
      } catch (e) {
        console.error(`Failed to get email for ${userId}`);
        userEmail = 'unknown@example.com';
      }

      // Create SUBSCRIBE event based on subscription data
      const subscribeTime = subData.currentPeriodStart || new Date().toISOString();

      const metadata: any = {
        periodStart: subData.currentPeriodStart,
        periodEnd: subData.currentPeriodEnd
      };

      if (subData.promoCodeUsed) metadata.promoCode = subData.promoCodeUsed;
      if (subData.originalTrialEndsAt || subData.trialEndsAt) {
        metadata.trialEndsAt = subData.originalTrialEndsAt || subData.trialEndsAt;
      }
      if (subData.promoExpiresAt) metadata.promoExpiresAt = subData.promoExpiresAt;

      try {
        await db.collection('subscription_events').add({
          userId,
          userEmail,
          eventType: 'SUBSCRIBE',
          timestamp: subscribeTime,
          metadata
        });

        console.log(`✅ Backfilled SUBSCRIBE event for ${userEmail}`);
        backfilledCount++;
      } catch (error: any) {
        console.error(`❌ Failed to backfill event for ${userId}:`, error.message);
      }
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Backfill Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total subscriptions: ${subsSnapshot.size}`);
    console.log(`Events backfilled: ${backfilledCount}`);
    console.log(`Skipped (already had events): ${skippedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

backfillEvents()
  .then(() => {
    console.log('\n✅ Backfill completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  });
