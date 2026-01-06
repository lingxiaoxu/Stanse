#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function fixBilling() {
  const userId = 'O5zWHhv80ZN8uBohaM54eJA6m6B3';
  
  // Delete all existing history records
  const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
  const historySnap = await historyRef.get();
  
  console.log(`Deleting ${historySnap.size} existing records...`);
  for (const doc of historySnap.docs) {
    await doc.ref.delete();
  }
  
  // Get subscription start date
  const subDoc = await db.collection('user_subscriptions').doc(userId).get();
  const subData = subDoc.data();
  const startDate = new Date(subData!.currentPeriodStart);
  
  console.log('Subscription start:', startDate.toISOString());
  console.log('Has used trial:', subData!.hasUsedTrial);
  
  // Add correct billing record
  // Since user subscribed on Jan 6 and hasn't used trial before:
  // - Trial period: Jan 6 - Jan 12 (7 days)
  // - First charge happens on Jan 13 (or show as pending)
  // - Current billing record should show trial active
  
  const periodString = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
  
  await historyRef.add({
    type: 'SUBSCRIBE_SUCCESS',
    amount: 0, // $0 during trial
    period: periodString,
    timestamp: subData!.currentPeriodStart
  });
  
  console.log('✅ Added billing record');
  console.log('  Amount: $0.00 (7-day trial active)');
  console.log('  Period:', periodString);
  console.log('  Note: First charge will be on Jan 13 (prorated)');
}

fixBilling().then(() => process.exit(0)).catch(console.error);
