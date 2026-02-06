/**
 * Check failed news to see their content
 */
import * as admin from 'firebase-admin';

async function checkFailedNews() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });
  }

  const db = admin.firestore();

  const errorSnapshot = await db.collection('news_locations')
    .where('error', '==', true)
    .get();

  console.log(`Found ${errorSnapshot.size} failed news\n`);

  for (const doc of errorSnapshot.docs) {
    const newsId = doc.data().newsId;
    const newsDoc = await db.collection('news').doc(newsId).get();

    if (newsDoc.exists) {
      const data = newsDoc.data()!;
      console.log(`━━━ ${newsId} ━━━`);
      console.log(`Title: ${data.title?.substring(0, 80)}`);
      console.log(`Summary length: ${(data.summary || '').length} chars`);
      console.log(`Has summary: ${!!data.summary}`);
      console.log('');
    }
  }
}

checkFailedNews().then(() => process.exit(0));
