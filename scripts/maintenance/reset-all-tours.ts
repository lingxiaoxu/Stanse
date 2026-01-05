#!/usr/bin/env node
/**
 * Reset All Tour Completion Status
 *
 * This script resets tourCompleted for all users to allow everyone
 * to experience the tour again in all languages.
 *
 * Run: npx tsx scripts/maintenance/reset-all-tours.ts
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

async function resetAllTours() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Resetting Tour Completion Status for All Users');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  console.log(`Found ${snapshot.size} users to reset\n`);

  let resetCount = 0;
  let createdCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const email = data.email || 'No email';

    // Reset tourCompleted to all false for all languages
    const resetTourData = {
      tourCompleted: {
        EN: false,
        ZH: false,
        JA: false,
        FR: false,
        ES: false
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const hadTourField = !!data.tourCompleted;

    await doc.ref.update(resetTourData);

    if (hadTourField) {
      console.log(`🔄 ${email}`);
      console.log(`   User ID: ${doc.id}`);
      console.log(`   Reset existing tourCompleted field`);
      console.log(`   All languages now: ❌ (will show tour)`);
      resetCount++;
    } else {
      console.log(`✨ ${email}`);
      console.log(`   User ID: ${doc.id}`);
      console.log(`   Created new tourCompleted field`);
      console.log(`   All languages set to: ❌ (will show tour)`);
      createdCount++;
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total users: ${snapshot.size}`);
  console.log(`Reset existing fields: ${resetCount}`);
  console.log(`Created new fields: ${createdCount}`);
  console.log('');
  console.log('All users will now see the tour on next login in ANY language!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

resetAllTours()
  .then(() => {
    console.log('\n✅ Reset completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Reset failed:', error);
    process.exit(1);
  });
