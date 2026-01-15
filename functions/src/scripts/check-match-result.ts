/**
 * Check Match Result
 *
 * Usage: npx ts-node src/scripts/check-match-result.ts match_xxx
 */

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function checkMatch() {
  const matchId = process.argv[2] || 'match_1768442572972_c0nx60';

  console.log(`\n🔍 Checking match: ${matchId}\n`);

  const doc = await db.collection('duel_matches').doc(matchId).get();

  if (!doc.exists) {
    console.log('❌ Match not found');
    return;
  }

  const data = doc.data() as any;
  console.log('=== MATCH RESULT ===');
  console.log('Winner:', data.result.winner);
  console.log('Score A:', data.result.scoreA);
  console.log('Score B:', data.result.scoreB);
  console.log('Status:', data.status);
  console.log('\nPlayer A:', data.players.A.userId.substring(0, 15) + '...', data.players.A.personaLabel);
  console.log('Player B:', data.players.B.userId.substring(0, 15) + '...', data.players.B.personaLabel);

  // Check answers
  const eventsSnapshot = await db.collection('duel_matches').doc(matchId).collection('gameplay_events').orderBy('timestamp').get();
  console.log('\n=== GAMEPLAY EVENTS ===');
  console.log('Total answers:', eventsSnapshot.size);

  let countA = 0, countB = 0, correctA = 0, correctB = 0;
  eventsSnapshot.forEach(eventDoc => {
    const event = eventDoc.data();
    if (event.playerId === data.players.A.userId) {
      countA++;
      if (event.isCorrect) correctA++;
      console.log(`  A: Q${event.questionOrder} - ${event.isCorrect ? '✓' : '✗'}`);
    } else {
      countB++;
      if (event.isCorrect) correctB++;
      console.log(`  B: Q${event.questionOrder} - ${event.isCorrect ? '✓' : '✗'}`);
    }
  });

  console.log(`\nPlayer A: ${countA} answers (${correctA} correct, ${countA - correctA} wrong) = Score ${correctA - (countA - correctA)}`);
  console.log(`Player B: ${countB} answers (${correctB} correct, ${countB - correctB} wrong) = Score ${correctB - (countB - correctB)}`);

  console.log('\n=== ANSWERS ARRAY (for real-time sync) ===');
  if (data.answers) {
    console.log('Answers A:', data.answers.A?.length || 0);
    console.log('Answers B:', data.answers.B?.length || 0);
    if (data.answers.A) {
      data.answers.A.forEach((ans: any) => {
        console.log(`  A: Q${ans.questionOrder} - ${ans.isCorrect ? '✓' : '✗'}`);
      });
    }
    if (data.answers.B) {
      data.answers.B.forEach((ans: any) => {
        console.log(`  B: Q${ans.questionOrder} - ${ans.isCorrect ? '✓' : '✗'}`);
      });
    }
  } else {
    console.log('⚠️  No answers array found (real-time sync not working)');
  }

  process.exit(0);
}

checkMatch().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
