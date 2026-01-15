/**
 * Verify that questions are stored correctly in Firestore
 * Checks that correctIndex matches isCorrect in options array
 */

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'stanseproject',
  });
}
const db = admin.firestore();

async function main() {
  console.log('🔍 Verifying question data...\n');

  const snapshot = await db.collection('duel_questions').limit(5).get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`\n📋 ${data.questionId}: ${data.stem}`);
    console.log(`   correctIndex: ${data.correctIndex}`);
    console.log(`   Options:`);

    data.options.forEach((opt: any, idx: number) => {
      const marker = opt.isCorrect ? '✓' : ' ';
      const indexMarker = idx === data.correctIndex ? '←' : ' ';
      console.log(`     [${marker}] ${idx} ${indexMarker} ${opt.prompt.substring(0, 60)}...`);
    });

    console.log(`   Images array:`);
    data.images.forEach((img: any, idx: number) => {
      const marker = img.isCorrect ? '✓' : ' ';
      console.log(`     [${marker}] ${idx} url: "${img.url}" prompt: ${img.prompt.substring(0, 40)}...`);
    });

    // Verify correctness
    const correctOption = data.options[data.correctIndex];
    const correctImage = data.images[data.correctIndex];

    if (!correctOption.isCorrect) {
      console.log(`   ❌ ERROR: Option at correctIndex ${data.correctIndex} has isCorrect=false!`);
    } else {
      console.log(`   ✅ Correct option properly marked`);
    }

    if (!correctImage.isCorrect) {
      console.log(`   ❌ ERROR: Image at correctIndex ${data.correctIndex} has isCorrect=false!`);
    } else {
      console.log(`   ✅ Correct image properly marked`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
