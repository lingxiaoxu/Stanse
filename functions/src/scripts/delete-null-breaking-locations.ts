/**
 * Delete breaking_news_locations with null coordinates
 */
import * as admin from 'firebase-admin';

async function deleteNullCoordinates() {
  console.log('🗑️  Deleting breaking news locations with null coordinates...\n');

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });
  }

  const db = admin.firestore();

  try {
    const snapshot = await db.collection('breaking_news_locations').get();
    console.log(`Checking ${snapshot.size} breaking news locations...\n`);

    let deleted = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const coords = data.coordinates;

      // Check if coordinates are null or have null lat/lng
      if (!coords || coords.latitude === null || coords.longitude === null) {
        console.log(`🗑️  Deleting ${doc.id.substring(0, 12)}: country=${data.country || 'null'}`);
        await doc.ref.delete();
        deleted++;
      }
    }

    console.log(`\n✅ Deleted ${deleted} records with null coordinates`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteNullCoordinates()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
