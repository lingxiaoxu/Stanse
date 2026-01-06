#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function markUsed() {
  const snapshot = await db.collection('promotion_codes')
    .where('code', '==', 'B5FGYTB7').get();

  if (!snapshot.empty) {
    await snapshot.docs[0].ref.update({
      isUsed: true,
      userId: 'OkNexZrKwXb8ANVz2VSp3eC62i22',
      userEmail: 'anonymous.person.newyorkcity@gmail.com',
      usedAt: '2026-01-06T09:52:14.687Z'
    });
    console.log('✅ B5FGYTB7 marked as used by OkNexZrKwXb8ANVz2VSp3eC62i22');
  }
}

markUsed().then(() => process.exit(0)).catch(console.error);
