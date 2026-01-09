/**
 * Generate Pre-Assembled Question Sequences for DUEL Arena
 *
 * Creates 12 sequences:
 * - 6 sequences for 30s matches (60 questions each)
 * - 6 sequences for 45s matches (90 questions each)
 *
 * Each duration has 2 sequences per strategy:
 * - FLAT: Mixed difficulty
 * - ASCENDING: Easy → Medium → Hard
 * - DESCENDING: Hard → Medium → Easy
 *
 * Usage:
 *   npx ts-node scripts/duel/generate-sequences.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../service-account-key.json');
if (fs.existsSync(serviceAccountPath)) {
  initializeApp({
    credential: cert(serviceAccountPath)
  });
} else {
  initializeApp();
}

const db = getFirestore();

interface QuestionRef {
  questionId: string;
  order: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

interface SequenceDocument {
  sequenceId: string;
  duration: 30 | 45;
  difficultyStrategy: 'FLAT' | 'ASCENDING' | 'DESCENDING';
  questionCount: number;
  questions: QuestionRef[];
  createdAt: string;
  metadata: {
    easyCount: number;
    mediumCount: number;
    hardCount: number;
  };
}

/**
 * Fetch all questions from Firestore
 */
async function fetchAllQuestions(): Promise<Array<{
  questionId: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}>> {
  const snapshot = await db.collection('duel_questions').get();

  if (snapshot.empty) {
    throw new Error('No questions found! Run generate-questions-with-ai-images.ts first');
  }

  const questions: Array<{ questionId: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' }> = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    questions.push({
      questionId: data.questionId,
      difficulty: data.difficulty
    });
  });

  console.log(`📚 Loaded ${questions.length} questions from Firestore`);
  return questions;
}

/**
 * Create a sequence with specified strategy
 */
function createSequence(
  sequenceId: string,
  duration: 30 | 45,
  strategy: 'FLAT' | 'ASCENDING' | 'DESCENDING',
  availableQuestions: Array<{ questionId: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' }>
): SequenceDocument {
  const questionCount = duration === 30 ? 60 : 90;

  // Separate questions by difficulty
  const easyQuestions = availableQuestions.filter(q => q.difficulty === 'EASY');
  const mediumQuestions = availableQuestions.filter(q => q.difficulty === 'MEDIUM');
  const hardQuestions = availableQuestions.filter(q => q.difficulty === 'HARD');

  console.log(`  📊 Available: ${easyQuestions.length} easy, ${mediumQuestions.length} medium, ${hardQuestions.length} hard`);

  let selectedQuestions: QuestionRef[] = [];

  if (strategy === 'FLAT') {
    // Mix all difficulties evenly
    // Ratio: 40% medium, 30% easy, 30% hard
    const needEasy = Math.floor(questionCount * 0.3);
    const needMedium = Math.floor(questionCount * 0.4);
    const needHard = questionCount - needEasy - needMedium;

    const selected = [
      ...shuffleArray(easyQuestions).slice(0, needEasy),
      ...shuffleArray(mediumQuestions).slice(0, needMedium),
      ...shuffleArray(hardQuestions).slice(0, needHard)
    ];

    // Shuffle to mix difficulties
    selectedQuestions = shuffleArray(selected).map((q, idx) => ({
      questionId: q.questionId,
      order: idx,
      difficulty: q.difficulty
    }));
  } else if (strategy === 'ASCENDING') {
    // Easy → Medium → Hard progression
    const needEasy = Math.floor(questionCount * 0.4);
    const needMedium = Math.floor(questionCount * 0.4);
    const needHard = questionCount - needEasy - needMedium;

    const selected = [
      ...shuffleArray(easyQuestions).slice(0, needEasy),
      ...shuffleArray(mediumQuestions).slice(0, needMedium),
      ...shuffleArray(hardQuestions).slice(0, needHard)
    ];

    selectedQuestions = selected.map((q, idx) => ({
      questionId: q.questionId,
      order: idx,
      difficulty: q.difficulty
    }));
  } else {
    // DESCENDING: Hard → Medium → Easy
    const needHard = Math.floor(questionCount * 0.4);
    const needMedium = Math.floor(questionCount * 0.4);
    const needEasy = questionCount - needHard - needMedium;

    const selected = [
      ...shuffleArray(hardQuestions).slice(0, needHard),
      ...shuffleArray(mediumQuestions).slice(0, needMedium),
      ...shuffleArray(easyQuestions).slice(0, needEasy)
    ];

    selectedQuestions = selected.map((q, idx) => ({
      questionId: q.questionId,
      order: idx,
      difficulty: q.difficulty
    }));
  }

  // Calculate metadata
  const easyCount = selectedQuestions.filter(q => q.difficulty === 'EASY').length;
  const mediumCount = selectedQuestions.filter(q => q.difficulty === 'MEDIUM').length;
  const hardCount = selectedQuestions.filter(q => q.difficulty === 'HARD').length;

  return {
    sequenceId,
    duration,
    difficultyStrategy: strategy,
    questionCount: selectedQuestions.length,
    questions: selectedQuestions,
    createdAt: new Date().toISOString(),
    metadata: {
      easyCount,
      mediumCount,
      hardCount
    }
  };
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate all sequences
 */
async function generateAllSequences(): Promise<void> {
  console.log('🎲 Generating pre-assembled question sequences...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Fetch all questions
  const allQuestions = await fetchAllQuestions();

  const sequences: SequenceDocument[] = [];

  // 30-second sequences (6 total: 2 per strategy)
  for (let i = 0; i < 2; i++) {
    sequences.push(createSequence(`30s_flat_${i + 1}`, 30, 'FLAT', allQuestions));
    sequences.push(createSequence(`30s_ascending_${i + 1}`, 30, 'ASCENDING', allQuestions));
    sequences.push(createSequence(`30s_descending_${i + 1}`, 30, 'DESCENDING', allQuestions));
  }

  // 45-second sequences (6 total: 2 per strategy)
  for (let i = 0; i < 2; i++) {
    sequences.push(createSequence(`45s_flat_${i + 1}`, 45, 'FLAT', allQuestions));
    sequences.push(createSequence(`45s_ascending_${i + 1}`, 45, 'ASCENDING', allQuestions));
    sequences.push(createSequence(`45s_descending_${i + 1}`, 45, 'DESCENDING', allQuestions));
  }

  console.log(`\n📦 Generated ${sequences.length} sequences\n`);

  // Store in Firestore
  const batch = db.batch();

  for (const sequence of sequences) {
    console.log(`  💾 Storing ${sequence.sequenceId}: ${sequence.questionCount} questions (${sequence.difficultyStrategy})`);
    console.log(`     Easy: ${sequence.metadata.easyCount}, Medium: ${sequence.metadata.mediumCount}, Hard: ${sequence.metadata.hardCount}`);

    const docRef = db.collection('duel_sequences').doc(sequence.sequenceId);
    batch.set(docRef, sequence);
  }

  await batch.commit();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All sequences stored in Firestore!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Summary
  console.log('📊 Sequence Summary:');
  console.log(`   30s matches: 6 sequences (60 questions each)`);
  console.log(`   45s matches: 6 sequences (90 questions each)`);
  console.log(`   Total: ${sequences.length} sequences\n`);
}

/**
 * Main execution
 */
async function main() {
  try {
    await generateAllSequences();
    console.log('🎉 Sequence generation complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
