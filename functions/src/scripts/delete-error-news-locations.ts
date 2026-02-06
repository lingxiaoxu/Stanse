/**
 * Delete news_locations documents with error:true
 * Then we can re-run initialize-news-locations.ts to retry them
 *
 * Run: npx ts-node src/scripts/delete-error-news-locations.ts
 */
import * as admin from 'firebase-admin';

async function deleteErrorNewsLocations() {
  console.log('🗑️  Deleting error news locations...\n');

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });
  }

  const db = admin.firestore();

  try {
    // Find all news_locations with error:true
    const errorSnapshot = await db.collection('news_locations')
      .where('error', '==', true)
      .get();

    console.log(`Found ${errorSnapshot.size} error records to delete\n`);

    let deleted = 0;

    for (const doc of errorSnapshot.docs) {
      const newsId = doc.data().newsId;
      console.log(`🗑️  Deleting ${newsId.substring(0, 10)}...`);
      await doc.ref.delete();
      deleted++;
    }

    console.log(`\n✅ Deleted ${deleted} error records`);
    console.log('Now you can run: npx ts-node src/scripts/initialize-news-locations.ts');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteErrorNewsLocations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
