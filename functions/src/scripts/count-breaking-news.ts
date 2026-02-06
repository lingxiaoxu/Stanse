import * as admin from 'firebase-admin';

async function countBreakingNews() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });
  }

  const db = admin.firestore();
  
  const notificationsSnapshot = await db.collection('breaking_news_notifications').get();
  const locationsSnapshot = await db.collection('breaking_news_locations').get();
  
  console.log('breaking_news_notifications:', notificationsSnapshot.size);
  console.log('breaking_news_locations:', locationsSnapshot.size);
  console.log('Missing:', notificationsSnapshot.size - locationsSnapshot.size);
}

countBreakingNews().then(() => process.exit(0));
