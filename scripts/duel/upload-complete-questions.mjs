#!/usr/bin/env node
/**
 * Upload Complete 150 Questions to Firestore using Firebase Admin SDK
 * Run from project root: node scripts/duel/upload-complete-questions.mjs
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin with Application Default Credentials
try {
  initializeApp({
    credential: applicationDefault(),
    projectId: 'stanseproject'
  });
  console.log('✅ Firebase Admin initialized with ADC\n');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
  process.exit(1);
}

const db = getFirestore();

// Difficulty colors for placeholder images using placehold.co (more reliable)
function getPlaceholderUrl(text, difficulty, index) {
  const colors = {
    EASY: ['86efac', '4ade80', '22c55e', '16a34a'],
    MEDIUM: ['fde047', 'facc15', 'eab308', 'ca8a04'],
    HARD: ['fca5a5', 'f87171', 'ef4444', 'dc2626']
  };
  const color = colors[difficulty][index % 4];
  // Truncate text to 25 chars and encode for URL
  const shortText = text.substring(0, 25).replace(/[^a-zA-Z0-9 ]/g, '');
  const encodedText = encodeURIComponent(shortText);
  // Using placehold.co which is more reliable than via.placeholder.com
  return `https://placehold.co/512x512/${color}/000000?text=${encodedText}`;
}

async function clearExistingQuestions() {
  console.log('🗑️  Checking for existing questions...');
  const snapshot = await db.collection('duel_questions').get();

  if (snapshot.empty) {
    console.log('   No existing questions found.');
    return;
  }

  console.log(`   Found ${snapshot.size} existing questions. Clearing...`);

  // Delete in batches
  const batchSize = 50;
  let batch = db.batch();
  let count = 0;

  for (const docSnapshot of snapshot.docs) {
    batch.delete(docSnapshot.ref);
    count++;

    if (count % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`   Deleted ${count}/${snapshot.size}...`);
    }
  }

  if (count % batchSize !== 0) {
    await batch.commit();
  }

  console.log(`   ✅ Cleared ${count} existing questions.\n`);
}

async function uploadQuestions() {
  console.log('🎲 DUEL Arena Question Bank Upload');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Load questions from JSON
  const questionsPath = join(__dirname, 'complete-questions.json');
  console.log(`📂 Loading questions from: ${questionsPath}`);

  if (!existsSync(questionsPath)) {
    throw new Error(`Questions file not found: ${questionsPath}`);
  }

  const questionsData = JSON.parse(readFileSync(questionsPath, 'utf-8'));
  console.log(`   Found ${questionsData.length} questions\n`);

  // Clear existing questions first
  await clearExistingQuestions();

  // Upload in batches
  console.log('📤 Uploading questions to Firestore...\n');

  const batchSize = 50;
  let batch = db.batch();
  let count = 0;

  const stats = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const categoryStats = {};

  for (const q of questionsData) {
    // Create image array with correct answer and distractors
    const allOptions = [
      { description: q.correct, isCorrect: true },
      ...q.distractors.map(d => ({ description: d, isCorrect: false }))
    ];

    // Shuffle options
    const shuffled = allOptions
      .map((value, idx) => ({ value, sort: Math.random(), originalIdx: idx }))
      .sort((a, b) => a.sort - b.sort);

    const correctIndex = shuffled.findIndex(item => item.value.isCorrect);

    // Generate images array
    const images = shuffled.map((item, idx) => ({
      url: getPlaceholderUrl(item.value.description, q.difficulty, idx),
      isCorrect: item.value.isCorrect,
      prompt: item.value.description,
      index: idx,
      generatedAt: new Date().toISOString()
    }));

    const questionDoc = {
      questionId: q.id,
      stem: q.stem,
      category: q.category,
      difficulty: q.difficulty,
      images: images,
      correctIndex: correctIndex,
      createdAt: new Date().toISOString(),
      metadata: {
        imageGenModel: 'placeholder-v2',
        imageSize: '512x512',
        stylePrompt: 'Educational trivia image',
        generatedBy: 'complete-questions-upload'
      }
    };

    const docRef = db.collection('duel_questions').doc(q.id);
    batch.set(docRef, questionDoc);

    stats[q.difficulty]++;
    categoryStats[q.category] = (categoryStats[q.category] || 0) + 1;
    count++;

    if (count % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`   ✅ Uploaded ${count}/${questionsData.length} questions...`);
    }
  }

  // Commit remaining
  if (count % batchSize !== 0) {
    await batch.commit();
  }

  console.log(`   ✅ Uploaded ${count}/${questionsData.length} questions!\n`);

  // Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('By Difficulty:');
  console.log(`   EASY:   ${stats.EASY} questions`);
  console.log(`   MEDIUM: ${stats.MEDIUM} questions`);
  console.log(`   HARD:   ${stats.HARD} questions`);
  console.log(`   TOTAL:  ${count} questions\n`);

  console.log('By Category:');
  for (const [cat, num] of Object.entries(categoryStats).sort()) {
    console.log(`   ${cat}: ${num} questions`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ UPLOAD COMPLETE!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Next steps:');
  console.log('1. Open your app and go to DUEL Arena');
  console.log('2. Start a match to test the questions');
  console.log('3. Questions are now ready for matchmaking!\n');
}

uploadQuestions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
