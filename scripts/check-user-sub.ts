import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();
const userId = 'OkNexZrKwXb8ANVz2VSp3eC62i22';

async function check() {
  const subDoc = await db.collection('user_subscriptions').doc(userId).get();
  console.log('Subscription exists:', subDoc.exists);
  if (subDoc.exists) {
    console.log('Data:', subDoc.data());
  }
}

check().then(() => process.exit(0)).catch(console.error);
