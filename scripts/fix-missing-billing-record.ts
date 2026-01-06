#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function fixBillingRecord() {
  const userId = 'O5zWHhv80ZN8uBohaM54eJA6m6B3';
  
  // Get subscription data
  const subDoc = await db.collection('user_subscriptions').doc(userId).get();
  if (!subDoc.exists) {
    console.log('No subscription found');
    return;
  }
  
  const subData = subDoc.data();
  console.log('Subscription data:', subData);
  
  // Add the missing billing record
  const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
  
  const startDate = new Date(subData!.currentPeriodStart);
  const periodString = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
  
  await historyRef.add({
    type: 'SUBSCRIBE_SUCCESS',
    amount: subData!.latestAmount,
    period: periodString,
    timestamp: subData!.currentPeriodStart
  });
  
  console.log('✅ Added billing record');
  console.log(`  Type: SUBSCRIBE_SUCCESS`);
  console.log(`  Amount: $${subData!.latestAmount.toFixed(2)}`);
  console.log(`  Period: ${periodString}`);
}

fixBillingRecord().then(() => process.exit(0)).catch(console.error);
