/**
 * Clear all documents from duel_questions collection
 *
 * Usage:
 *   cd functions
 *   npm run build
 *   node lib/scripts/clear-duel-questions.js
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'stanseproject',
  });
}
const db = admin.firestore();

/**
 * Delete all documents in a collection in batches
 */
async function deleteCollection(collectionPath: string, batchSize: number = 100): Promise<number> {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });

  async function deleteQueryBatch(query: admin.firestore.Query, resolve: (count: number) => void) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
      // No more documents to delete
      resolve(0);
      return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`  Deleted ${batchSize} documents`);

    // Recurse on the next batch
    process.nextTick(() => {
      deleteQueryBatch(query, resolve);
    });
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Clear DUEL Questions Collection');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get count first
  const snapshot = await db.collection('duel_questions').count().get();
  const totalCount = snapshot.data().count;

  console.log(`📊 Found ${totalCount} documents in duel_questions collection`);

  if (totalCount === 0) {
    console.log('✅ Collection is already empty');
    process.exit(0);
  }

  console.log('\n🗑️  Deleting all documents...\n');
  await deleteCollection('duel_questions');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  ✅ Successfully cleared duel_questions collection`);
  console.log('  Next step: Run populate-duel-questions.js to reload data');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
