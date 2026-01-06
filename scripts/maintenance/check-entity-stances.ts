#!/usr/bin/env node
/**
 * Check Entity Stances
 *
 * This script checks entity stances (SUPPORT/OPPOSE) for a specific user or all users.
 *
 * Usage:
 *   npx tsx scripts/maintenance/check-entity-stances.ts                    # Check all users
 *   npx tsx scripts/maintenance/check-entity-stances.ts <userId>           # Check specific user
 *   npx tsx scripts/maintenance/check-entity-stances.ts <userId> <entity>  # Check specific entity for user
 */

import admin from 'firebase-admin';

try {
  admin.app();
} catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function checkEntityStances() {
  const args = process.argv.slice(2);
  const userId = args[0];
  const entityFilter = args[1]?.toLowerCase();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Entity Stances Checker');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (userId) {
    // Check specific user
    await checkUserStances(userId, entityFilter);
  } else {
    // Check all users
    await checkAllUsersStances(entityFilter);
  }
}

async function checkUserStances(userId: string, entityFilter?: string) {
  console.log(`👤 User: ${userId}`);
  if (entityFilter) {
    console.log(`🔎 Filter: "${entityFilter}"`);
  }
  console.log('');

  // Get user info
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    console.log('❌ User not found!');
    return;
  }

  const userData = userDoc.data();
  console.log(`📧 Email: ${userData?.email || 'N/A'}`);
  console.log(`🏷️  Label: ${userData?.coordinates?.label || 'N/A'}`);
  console.log('');

  // Get entity stances
  const stancesRef = db.collection('entityStances').doc(userId).collection('entities');
  let query: FirebaseFirestore.Query = stancesRef;

  const snapshot = await query.get();

  if (snapshot.empty) {
    console.log('📝 No entity stances found for this user.');
    return;
  }

  let stances = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Apply entity filter if provided
  if (entityFilter) {
    stances = stances.filter(s =>
      s.id.includes(entityFilter) ||
      (s as any).entityName?.toLowerCase().includes(entityFilter)
    );
  }

  if (stances.length === 0) {
    console.log(`📝 No stances found matching "${entityFilter}"`);
    return;
  }

  console.log(`📊 Total stances: ${stances.length}`);
  console.log('');

  // Group by stance type
  const supportStances = stances.filter(s => (s as any).stance === 'SUPPORT');
  const opposeStances = stances.filter(s => (s as any).stance === 'OPPOSE');

  if (supportStances.length > 0) {
    console.log(`✅ SUPPORT (${supportStances.length}):`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    supportStances.forEach((stance: any) => {
      console.log(`  📌 ${stance.entityName || stance.id}`);
      if (stance.reason) console.log(`     Reason: ${stance.reason}`);
      console.log(`     Timestamp: ${stance.timestamp}`);
      console.log('');
    });
  }

  if (opposeStances.length > 0) {
    console.log(`⛔ OPPOSE (${opposeStances.length}):`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    opposeStances.forEach((stance: any) => {
      console.log(`  📌 ${stance.entityName || stance.id}`);
      if (stance.reason) console.log(`     Reason: ${stance.reason}`);
      console.log(`     Timestamp: ${stance.timestamp}`);
      console.log('');
    });
  }
}

async function checkAllUsersStances(entityFilter?: string) {
  console.log('👥 Checking all users...');
  if (entityFilter) {
    console.log(`🔎 Filter: "${entityFilter}"`);
  }
  console.log('');

  const usersSnapshot = await db.collection('users').get();
  console.log(`Found ${usersSnapshot.size} users\n`);

  let totalStances = 0;
  let usersWithStances = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    const stancesRef = db.collection('entityStances').doc(userId).collection('entities');
    const stancesSnapshot = await stancesRef.get();

    if (stancesSnapshot.empty) continue;

    let stances = stancesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Apply entity filter if provided
    if (entityFilter) {
      stances = stances.filter(s =>
        s.id.includes(entityFilter) ||
        (s as any).entityName?.toLowerCase().includes(entityFilter)
      );
    }

    if (stances.length === 0) continue;

    usersWithStances++;
    totalStances += stances.length;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👤 ${userData.email || 'No email'} (${userId})`);
    console.log(`   Stances: ${stances.length}`);
    console.log('');

    stances.forEach((stance: any) => {
      const icon = stance.stance === 'SUPPORT' ? '✅' : '⛔';
      console.log(`   ${icon} ${stance.entityName || stance.id} - ${stance.stance}`);
      if (stance.reason) console.log(`      → ${stance.reason}`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total users: ${usersSnapshot.size}`);
  console.log(`Users with stances: ${usersWithStances}`);
  console.log(`Total stances: ${totalStances}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

checkEntityStances()
  .then(() => {
    console.log('\n✅ Check completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
