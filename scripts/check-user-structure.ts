#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function checkUsers() {
  const targetUserId = 'O5zWHhv80ZN8uBohaM54eJA6m6B3';
  const testUserId = '3oySz7M09JX4P9Ucr7ofsj916Z33';
  
  const targetDoc = await db.collection('users').doc(targetUserId).get();
  const testDoc = await db.collection('users').doc(testUserId).get();
  
  const targetData = targetDoc.data();
  const testData = testDoc.data();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ TARGET FORMAT (O5zWHhv80ZN8uBohaM54eJA6m6B3)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Email:', targetData?.email);
  console.log('coordinates keys:', Object.keys(targetData?.coordinates || {}));
  console.log('tourCompleted:', targetData?.tourCompleted);
  console.log('');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  NEEDS MIGRATION (3oySz7M09JX4P9Ucr7ofsj916Z33)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Email:', testData?.email);
  console.log('coordinates keys:', Object.keys(testData?.coordinates || {}));
  console.log('tourCompleted:', testData?.tourCompleted);
  console.log('');
  
  const targetKeys = Object.keys(targetData?.coordinates || {});
  const testKeys = Object.keys(testData?.coordinates || {});
  const missing = targetKeys.filter(k => !testKeys.includes(k));
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Missing coordinates fields:', missing);
  console.log('Missing tourCompleted languages:', 
    Object.keys(targetData?.tourCompleted || {}).filter(
      k => !Object.keys(testData?.tourCompleted || {}).includes(k)
    )
  );
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

checkUsers().then(() => process.exit(0)).catch(console.error);
