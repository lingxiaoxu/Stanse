#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function checkSubscription() {
  const userId = 'O5zWHhv80ZN8uBohaM54eJA6m6B3'; // Your test user
  
  console.log('Checking subscription for user:', userId);
  console.log('');
  
  // Check subscription master doc
  const subDoc = await db.collection('user_subscriptions').doc(userId).get();
  if (subDoc.exists) {
    console.log('✅ Subscription found:');
    console.log(JSON.stringify(subDoc.data(), null, 2));
  } else {
    console.log('❌ No subscription document found');
  }
  
  console.log('');
  console.log('Checking billing history...');
  
  // Check billing history subcollection
  const historyRef = db.collection('user_subscriptions').doc(userId).collection('history');
  const historySnap = await historyRef.get();
  
  console.log(`Found ${historySnap.size} billing records`);
  console.log('');
  
  historySnap.forEach((doc) => {
    console.log('Record:', JSON.stringify(doc.data(), null, 2));
  });
}

checkSubscription().then(() => process.exit(0)).catch(console.error);
