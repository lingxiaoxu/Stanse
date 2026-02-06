/**
 * Check for null coordinates in breaking_news_locations
 */
import * as admin from 'firebase-admin';

async function checkNullCoordinates() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });
  }

  const db = admin.firestore();

  const snapshot = await db.collection('breaking_news_locations').get();
  console.log(`Total breaking news locations: ${snapshot.size}\n`);

  let nullCount = 0;
  const nullDocs: string[] = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (!data.coordinates ||
        data.coordinates.latitude === null ||
        data.coordinates.longitude === null ||
        data.coordinates.latitude === undefined ||
        data.coordinates.longitude === undefined) {
      nullCount++;
      nullDocs.push(doc.id);
      console.log(`❌ ${doc.id.substring(0, 12)}: country=${data.country || 'null'}, coords=${JSON.stringify(data.coordinates)}`);
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Total: ${snapshot.size}`);
  console.log(`   With null coordinates: ${nullCount}`);
  console.log(`   Valid: ${snapshot.size - nullCount}`);

  if (nullDocs.length > 0) {
    console.log(`\n🗑️  Null coordinate IDs:`);
    console.log(nullDocs.join(', '));
  }
}

checkNullCoordinates().then(() => process.exit(0));
