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
const userEmail = 'anonymous.person.newyorkcity@gmail.com';

async function fixPromoUser() {
  console.log('Fixing promo user data...');
  
  // 1. Add missing billing history
  const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
  const historySnapshot = await historyRef.get();
  
  console.log(`Current billing records: ${historySnapshot.size}`);
  
  if (historySnapshot.size === 0) {
    await historyRef.add({
      type: 'PROMO_APPLIED',
      amount: 0,
      period: '2026-01',
      promoCode: 'B5FGYTB7',
      timestamp: '2026-01-06T09:52:14.543Z'
    });
    console.log('✅ Added billing history');
  }
  
  // 2. Add missing SUBSCRIBE event
  const eventsSnapshot = await db.collection('subscription_events')
    .where('userId', '==', userId)
    .where('eventType', '==', 'SUBSCRIBE')
    .get();
  
  console.log(`Current SUBSCRIBE events: ${eventsSnapshot.size}`);
  
  if (eventsSnapshot.size === 0) {
    await db.collection('subscription_events').add({
      userId,
      userEmail,
      eventType: 'SUBSCRIBE',
      timestamp: '2026-01-06T09:52:14.543Z',
      metadata: {
        promoCode: 'B5FGYTB7',
        promoExpiresAt: '2026-02-01T05:00:00.000Z',
        periodStart: '2026-01-06T09:52:14.543Z',
        periodEnd: '2026-02-01T05:00:00.000Z'
      }
    });
    console.log('✅ Added SUBSCRIBE event');
  }
  
  console.log('✅ User data fixed!');
}

fixPromoUser().then(() => process.exit(0)).catch(console.error);
