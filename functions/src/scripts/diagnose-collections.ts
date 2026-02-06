/**
 * 诊断脚本：检查 Firestore 中各个 collection 的数据情况
 *
 * Run: npx ts-node src/scripts/diagnose-collections.ts
 */
import * as admin from 'firebase-admin';

async function diagnoseCollections() {
  console.log('🔍 Starting Firestore collections diagnosis...\n');

  // Initialize Firebase Admin
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });
    console.log('✅ Firebase Admin initialized for project: stanseproject\n');
  }

  const db = admin.firestore();

  const collectionsToCheck = [
    'users',
    'news',
    'news_original',
    'breaking_news_notifications',
    'conflict_zones',
    'news_locations',
    'breaking_news_locations',
  ];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const collectionName of collectionsToCheck) {
    try {
      const snapshot = await db.collection(collectionName).limit(5).get();

      console.log(`📦 ${collectionName}:`);
      console.log(`   Documents: ${snapshot.size}`);

      if (snapshot.size > 0) {
        const firstDoc = snapshot.docs[0].data();
        console.log(`   Sample fields: ${Object.keys(firstDoc).slice(0, 10).join(', ')}`);

        // 特殊检查
        if (collectionName === 'users') {
          const usersWithLocation = snapshot.docs.filter(doc => {
            const data = doc.data();
            return data.birthCountry || data.currentCountry;
          });
          console.log(`   Users with location fields: ${usersWithLocation.length}/${snapshot.size}`);

          if (usersWithLocation.length > 0) {
            const sample = usersWithLocation[0].data();
            console.log(`   Sample: birthCountry=${sample.birthCountry}, currentCountry=${sample.currentCountry}, currentState=${sample.currentState}`);
          }
        }

        if (collectionName === 'news' || collectionName === 'news_original') {
          const firstNews = snapshot.docs[0].data();
          console.log(`   Sample title: ${firstNews.title?.substring(0, 50)}...`);
          console.log(`   Has publishedAt: ${!!firstNews.publishedAt}`);
        }
      }

      console.log('');
    } catch (error: any) {
      console.log(`❌ ${collectionName}: Error - ${error.message}\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check for user subcollections
  console.log('🔍 Checking user subcollections...\n');
  try {
    const usersSnapshot = await db.collection('users').limit(3).get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const locationsSub = await db
        .collection('users')
        .doc(userId)
        .collection('users_countries_locations')
        .limit(1)
        .get();

      console.log(`   User ${userId.substring(0, 10)}: ${locationsSub.size} location records`);
    }
  } catch (error: any) {
    console.log(`   Error checking subcollections: ${error.message}`);
  }

  console.log('\n✅ Diagnosis complete!');
}

// Run the script
diagnoseCollections()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
