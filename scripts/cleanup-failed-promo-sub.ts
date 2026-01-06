#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();
const userId = 'PSfxNR5noFh2vObUMcXa6f8cwIE2';

async function cleanup() {
  console.log('Cleaning up failed promo subscription...');
  
  // Delete the subscription document
  await db.collection('user_subscriptions').doc(userId).delete();
  console.log('✅ Deleted user_subscriptions document');
  
  // Reset MTESH455 promo code
  const promoSnapshot = await db.collection('promotion_codes')
    .where('code', '==', 'MTESH455').get();
  
  if (!promoSnapshot.empty) {
    await promoSnapshot.docs[0].ref.update({
      isUsed: false,
      userId: admin.firestore.FieldValue.delete(),
      userEmail: admin.firestore.FieldValue.delete(),
      usedAt: admin.firestore.FieldValue.delete()
    });
    console.log('✅ Reset MTESH455 to unused');
  }
  
  console.log('✅ Cleanup complete. User can try again with fixed code.');
}

cleanup().then(() => process.exit(0)).catch(console.error);
