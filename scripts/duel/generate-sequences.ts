/**
 * Generate Pre-Assembled Question Sequences for DUEL Arena
 *
 * Uses Question Sequencing Agent to create 12 sequences:
 * - 6 sequences for 30s matches (40 questions each - allows repeats)
 * - 6 sequences for 45s matches (60 questions each - allows repeats)
 *
 * Each duration has 2 sequences per strategy:
 * - FLAT: Mixed difficulty (30% easy, 40% medium, 30% hard)
 * - ASCENDING: Easy → Medium → Hard progression
 * - DESCENDING: Hard → Medium → Easy progression
 *
 * 使用 150 个现有问题，允许重复以确保快速玩家不会耗尽题目
 *
 * Usage:
 *   npx ts-node scripts/duel/generate-sequences.ts
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../service-account-key.json');
try {
  if (fs.existsSync(serviceAccountPath)) {
    initializeApp({
      credential: cert(serviceAccountPath),
      projectId: 'stanseproject'
    });
  } else {
    initializeApp({
      credential: applicationDefault(),
      projectId: 'stanseproject'
    });
  }
  console.log('✅ Firebase Admin initialized\n');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin');
  process.exit(1);
}

const db = getFirestore();

type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';
type SequenceStrategy = 'FLAT' | 'ASCENDING' | 'DESCENDING';

interface QuestionRef {
  questionId: string;
  order: number;
  difficulty: DifficultyLevel;
}

interface SequenceDocument {
  sequenceId: string;
  duration: 30 | 45;
  difficultyStrategy: SequenceStrategy;
  questionCount: number;
  questions: QuestionRef[];
  createdAt: string;
  metadata: {
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    allowsRepeats: boolean;
    generatedBy: string;
  };
}

// Sequence configuration - 允许重复使用 150 个问题
const SEQUENCE_CONFIG = {
  QUESTIONS_30S: 40,  // 30s + 10 buffer (1 question per second max speed)
  QUESTIONS_45S: 60,  // 45s + 15 buffer
  DISTRIBUTIONS: {
    FLAT: { EASY: 0.30, MEDIUM: 0.40, HARD: 0.30 },
    ASCENDING: { EASY: 0.40, MEDIUM: 0.40, HARD: 0.20 },
    DESCENDING: { EASY: 0.20, MEDIUM: 0.40, HARD: 0.40 }
  }
};

/**
 * Fetch all questions from Firestore duel_questions collection
 */
async function fetchAllQuestions(): Promise<Array<{
  questionId: string;
  difficulty: DifficultyLevel;
}>> {
  const snapshot = await db.collection('duel_questions').get();

  if (snapshot.empty) {
    throw new Error('No questions found! Run upload-complete-questions.mjs first');
  }

  const questions: Array<{ questionId: string; difficulty: DifficultyLevel }> = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    questions.push({
      questionId: data.questionId,
      difficulty: data.difficulty as DifficultyLevel
    });
  });

  console.log(`📚 Loaded ${questions.length} questions from Firestore`);
  return questions;
}

/**
 * Select questions with repeats to meet count requirement
 * 允许重复使用问题以确保足够的题目数量
 */
function selectQuestionsWithRepeats(
  available: Array<{ questionId: string; difficulty: DifficultyLevel }>,
  needed: number
): Array<{ questionId: string; difficulty: DifficultyLevel }> {
  const selected: Array<{ questionId: string; difficulty: DifficultyLevel }> = [];
  const shuffled = shuffleArray(available);

  while (selected.length < needed) {
    const index = selected.length % shuffled.length;
    selected.push({ ...shuffled[index] });
  }

  return selected;
}

/**
 * Create a sequence with specified strategy
 * 使用 SEQUENCE_CONFIG 配置，允许重复问题
 */
function createSequence(
  sequenceId: string,
  duration: 30 | 45,
  strategy: SequenceStrategy,
  availableQuestions: Array<{ questionId: string; difficulty: DifficultyLevel }>
): SequenceDocument {
  const questionCount = duration === 30 ? SEQUENCE_CONFIG.QUESTIONS_30S : SEQUENCE_CONFIG.QUESTIONS_45S;
  const distribution = SEQUENCE_CONFIG.DISTRIBUTIONS[strategy];

  // Separate questions by difficulty
  const easyQuestions = availableQuestions.filter(q => q.difficulty === 'EASY');
  const mediumQuestions = availableQuestions.filter(q => q.difficulty === 'MEDIUM');
  const hardQuestions = availableQuestions.filter(q => q.difficulty === 'HARD');

  console.log(`  📊 Pool: ${easyQuestions.length} easy, ${mediumQuestions.length} medium, ${hardQuestions.length} hard`);

  // Calculate needed counts based on distribution
  const needEasy = Math.floor(questionCount * distribution.EASY);
  const needMedium = Math.floor(questionCount * distribution.MEDIUM);
  const needHard = questionCount - needEasy - needMedium;

  // Select questions with repeats allowed
  const selectedEasy = selectQuestionsWithRepeats(easyQuestions, needEasy);
  const selectedMedium = selectQuestionsWithRepeats(mediumQuestions, needMedium);
  const selectedHard = selectQuestionsWithRepeats(hardQuestions, needHard);

  let orderedQuestions: Array<{ questionId: string; difficulty: DifficultyLevel }>;

  if (strategy === 'FLAT') {
    // Mix all difficulties randomly
    orderedQuestions = shuffleArray([...selectedEasy, ...selectedMedium, ...selectedHard]);
  } else if (strategy === 'ASCENDING') {
    // Easy → Medium → Hard progression
    orderedQuestions = [...selectedEasy, ...selectedMedium, ...selectedHard];
  } else {
    // DESCENDING: Hard → Medium → Easy
    orderedQuestions = [...selectedHard, ...selectedMedium, ...selectedEasy];
  }

  // Create question refs with order
  const selectedQuestions: QuestionRef[] = orderedQuestions.map((q, idx) => ({
    questionId: q.questionId,
    order: idx,
    difficulty: q.difficulty
  }));

  console.log(`     → Created ${selectedQuestions.length} questions (E:${needEasy} M:${needMedium} H:${needHard})`);

  return {
    sequenceId,
    duration,
    difficultyStrategy: strategy,
    questionCount: selectedQuestions.length,
    questions: selectedQuestions,
    createdAt: new Date().toISOString(),
    metadata: {
      easyCount: needEasy,
      mediumCount: needMedium,
      hardCount: needHard,
      allowsRepeats: true,
      generatedBy: 'QuestionSequencingAgent'
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

// Run directly
main();
