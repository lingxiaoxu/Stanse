#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function restoreTrial() {
  const userId = 'O5zWHhv80ZN8uBohaM54eJA6m6B3';
  
  // Original subscription: Jan 6, 2026
  const originalSubStart = '2026-01-06T05:32:38.223Z';
  const trialEnd = new Date(originalSubStart);
  trialEnd.setDate(trialEnd.getDate() + 7); // +7 days
  
  console.log('Restoring trial for user:', userId);
  console.log('Original subscription:', originalSubStart);
  console.log('Trial ends at:', trialEnd.toISOString());
  
  // Delete the wrong RENEW record (again, from latest run)
  const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
  const renewSnapshot = await historyRef.where('type', '==', 'RENEW').get();
  
  for (const doc of renewSnapshot.docs) {
    console.log('Deleting RENEW record:', doc.data());
    await doc.ref.delete();
  }
  
  // Update subscription with trial info
  const subRef = db.collection('user_subscriptions').doc(userId);
  await subRef.update({
    currentPeriodStart: originalSubStart,
    currentPeriodEnd: '2026-02-01T05:00:00.000Z',
    latestAmount: 0,
    trialEndsAt: trialEnd.toISOString(),
    originalTrialEndsAt: trialEnd.toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  console.log('✅ Trial restored');
  console.log('  trialEndsAt:', trialEnd.toISOString());
  console.log('  latestAmount: $0.00');
}

restoreTrial().then(() => process.exit(0)).catch(console.error);
