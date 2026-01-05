#!/usr/bin/env node
/**
 * Check Tour Completion Status
 * Shows which users have completed the app tour in which languages
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

async function checkTourStatus() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Tour Completion Status for All Users');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  console.log(`Found ${snapshot.size} users\n`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const email = data.email || 'No email';
    const tourCompleted = data.tourCompleted || {};

    console.log(`👤 ${email}`);
    console.log(`   User ID: ${doc.id}`);

    if (!data.tourCompleted) {
      console.log(`   ⚠️  No tourCompleted field (will see tour on next login)`);
    } else {
      console.log(`   Tour Completed:`);
      console.log(`      EN (English):  ${tourCompleted.EN ? '✅' : '❌'}`);
      console.log(`      ZH (中文):     ${tourCompleted.ZH ? '✅' : '❌'}`);
      console.log(`      JA (日本語):   ${tourCompleted.JA ? '✅' : '❌'}`);
      console.log(`      FR (Français): ${tourCompleted.FR ? '✅' : '❌'}`);
      console.log(`      ES (Español):  ${tourCompleted.ES ? '✅' : '❌'}`);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Legend:');
  console.log('  ✅ = Tour completed in this language');
  console.log('  ❌ = Tour NOT completed (will show on next login in this language)');
  console.log('  ⚠️  = No tourCompleted field (old user, will see tour)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

checkTourStatus()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
