#!/usr/bin/env node
/**
 * Cleanup Old Social Connections Structure
 *
 * This script migrates from the old structure (multiple docs per user+platform)
 * to the new structure (one main doc per user+platform with history subcollection).
 *
 * OLD Structure (BAD):
 *   socialConnections/
 *     ├── randomId1 (userId: user1, platform: TWITTER, isActive: false)
 *     ├── randomId2 (userId: user1, platform: TWITTER, isActive: true)  ← Duplicate!
 *
 * NEW Structure (GOOD):
 *   socialConnections/
 *     ├── user1_TWITTER/           ← Main doc (current state)
 *     │   ├── isActive: true
 *     │   └── history/             ← Subcollection (history)
 *     │       ├── timestamp1 (action: connected)
 *     │       ├── timestamp2 (action: disconnected)
 *
 * Run: npx tsx scripts/maintenance/cleanup-social-connections.ts
 */

import admin from 'firebase-admin';

// Initialize Firebase Admin
try {
  admin.app();
} catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

/**
 * Clean up and migrate social connections
 */
async function cleanupSocialConnections() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧹 Cleaning Up Social Connections Structure');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    const connectionsRef = db.collection('socialConnections');
    const snapshot = await connectionsRef.get();

    console.log(`Found ${snapshot.size} connection documents to process`);
    console.log('');

    // Group connections by userId + platform
    const connectionsByUserPlatform = new Map<string, any[]>();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const userId = data.userId;
      const platform = data.platform;

      if (!userId || !platform) {
        console.log(`⚠️  Skipping ${doc.id}: Missing userId or platform`);
        continue;
      }

      const key = `${userId}_${platform}`;

      if (!connectionsByUserPlatform.has(key)) {
        connectionsByUserPlatform.set(key, []);
      }

      connectionsByUserPlatform.get(key)!.push({
        id: doc.id,
        data: data
      });
    }

    console.log(`Found ${connectionsByUserPlatform.size} unique user+platform combinations`);
    console.log('');

    let migratedCount = 0;
    let deletedCount = 0;
    let skippedCount = 0;

    for (const [newDocId, docs] of connectionsByUserPlatform.entries()) {
      console.log(`\n🔄 Processing: ${newDocId}`);
      console.log(`   Found ${docs.length} documents for this user+platform`);

      // If already using new structure (docId = userId_platform), skip
      if (docs.length === 1 && docs[0].id === newDocId) {
        console.log(`   ✅ Already using new structure`);
        skippedCount++;
        continue;
      }

      // Find the most recent active connection
      const sortedDocs = docs.sort((a, b) => {
        const timeA = new Date(a.data.updatedAt || a.data.connectedAt || 0).getTime();
        const timeB = new Date(b.data.updatedAt || b.data.connectedAt || 0).getTime();
        return timeB - timeA;
      });

      const activeDoc = sortedDocs.find(d => d.data.isActive) || sortedDocs[0];

      console.log(`   📝 Using document: ${activeDoc.id} (active: ${activeDoc.data.isActive})`);

      // Create main document with new ID (userId_platform)
      const newDocRef = db.collection('socialConnections').doc(newDocId);
      await newDocRef.set({
        ...activeDoc.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`   ✅ Created main document: ${newDocId}`);

      // Migrate all old docs to history subcollection
      const historyRef = newDocRef.collection('history');

      for (const oldDoc of sortedDocs) {
        await historyRef.add({
          ...oldDoc.data,
          action: oldDoc.data.isActive ? 'migrated_active' : 'migrated_inactive',
          timestamp: oldDoc.data.updatedAt || oldDoc.data.connectedAt || new Date().toISOString(),
          originalDocId: oldDoc.id
        });

        console.log(`   📜 Added to history: ${oldDoc.id}`);
      }

      // Delete old documents
      for (const oldDoc of docs) {
        if (oldDoc.id !== newDocId) {
          await db.collection('socialConnections').doc(oldDoc.id).delete();
          console.log(`   🗑️  Deleted old document: ${oldDoc.id}`);
          deletedCount++;
        }
      }

      migratedCount++;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Cleanup Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Unique user+platform combinations: ${connectionsByUserPlatform.size}`);
    console.log(`Migrated to new structure: ${migratedCount}`);
    console.log(`Already using new structure: ${skippedCount}`);
    console.log(`Old documents deleted: ${deletedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
cleanupSocialConnections()
  .then(() => {
    console.log('\n✅ Cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
