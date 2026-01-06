#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function fixWrongRenewal() {
  const userId = 'O5zWHhv80ZN8uBohaM54eJA6m6B3';
  
  console.log('Fixing wrong renewal for user:', userId);
  
  // Get all billing history
  const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
  const snapshot = await historyRef.orderBy('timestamp', 'desc').get();
  
  console.log(`Found ${snapshot.size} billing records`);
  
  // Find and delete the RENEW record from today
  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`\nRecord: ${data.type} - $${data.amount} - ${data.timestamp}`);
    
    if (data.type === 'RENEW' && data.period === '2026-01') {
      console.log('  ❌ Deleting wrong RENEW record...');
      await doc.ref.delete();
      console.log('  ✅ Deleted');
    }
  }
  
  // Restore subscription data
  const subRef = db.collection('user_subscriptions').doc(userId);
  await subRef.update({
    latestAmount: 0,
    currentPeriodStart: '2026-01-06T05:32:38.223Z', // Original subscription start
    currentPeriodEnd: '2026-02-01T05:00:00.000Z',
    updatedAt: new Date().toISOString()
  });
  
  console.log('\n✅ Subscription restored to trial state');
}

fixWrongRenewal().then(() => process.exit(0)).catch(console.error);
