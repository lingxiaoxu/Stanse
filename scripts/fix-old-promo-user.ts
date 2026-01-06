#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();
const userId = 'OkNexZrKwXb8ANVz2VSp3eC62i22';

async function fix() {
  console.log('Fixing old promo user - removing trial fields...');
  
  await db.collection('user_subscriptions').doc(userId).update({
    trialEndsAt: admin.firestore.FieldValue.delete(),
    originalTrialEndsAt: admin.firestore.FieldValue.delete()
  });
  
  console.log('✅ Removed trial fields from promo user');
  console.log('User now correctly shows only promo period (no conflicting trial)');
}

fix().then(() => process.exit(0)).catch(console.error);
