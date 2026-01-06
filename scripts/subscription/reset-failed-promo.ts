#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function resetPromo() {
  const code = 'B5FGYTB7';

  const snapshot = await db.collection('promotion_codes')
    .where('code', '==', code).get();

  if (snapshot.empty) {
    console.log(`Promo code ${code} not found`);
    return;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  console.log(`Found promo code: ${code}`);
  console.log(`  isUsed: ${data.isUsed}`);
  console.log(`  userId: ${data.userId}`);

  await doc.ref.update({
    isUsed: false,
    userId: admin.firestore.FieldValue.delete(),
    userEmail: admin.firestore.FieldValue.delete(),
    usedAt: admin.firestore.FieldValue.delete()
  });

  console.log(`✅ Promo code ${code} reset to unused state`);
}

resetPromo().then(() => process.exit(0)).catch(console.error);
