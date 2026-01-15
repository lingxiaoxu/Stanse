/**
 * List Recent Matches
 */

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function listMatches() {
  const snapshot = await db.collection('duel_matches')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  console.log(`\n📋 Last 5 matches:\n`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`Match: ${doc.id}`);
    console.log(`  Created: ${data.createdAt}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Winner: ${data.result.winner || 'pending'}`);
    console.log(`  Score: ${data.result.scoreA} - ${data.result.scoreB}`);
    console.log(`  Players: ${data.players.A.personaLabel} vs ${data.players.B.personaLabel}`);
    console.log('');
  }

  process.exit(0);
}

listMatches().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
