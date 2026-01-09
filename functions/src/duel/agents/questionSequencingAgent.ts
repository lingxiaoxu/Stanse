/**
 * Question Sequencing Agent
 *
 * 职责：
 * - 将单题组合为完整对局所需的题目序列
 * - 确保题目数量足够覆盖 30 秒或 45 秒
 * - 即使用户反应极快，也不会出现题目耗尽
 * - 支持三种序列策略：FLAT(持平)、ASCENDING(递增)、DESCENDING(递减)
 *
 * 配合使用：
 * - /scripts/duel/generate-sequences.ts (生成12个预定义序列)
 * - 使用 150 个现有问题，允许重复
 */

import * as admin from 'firebase-admin';
import {
  QuestionSequence,
  QuestionRef,
  SequenceStrategy,
  DifficultyLevel,
  AgentResult
} from './types';

const db = admin.firestore();

// Sequence configuration - same as generate-sequences.ts
const SEQUENCE_CONFIG = {
  QUESTIONS_30S: 40,  // 30s + 10 buffer
  QUESTIONS_45S: 60,  // 45s + 15 buffer
  DISTRIBUTIONS: {
    FLAT: { EASY: 0.30, MEDIUM: 0.40, HARD: 0.30 },
    ASCENDING: { EASY: 0.40, MEDIUM: 0.40, HARD: 0.20 },
    DESCENDING: { EASY: 0.20, MEDIUM: 0.40, HARD: 0.40 }
  }
};

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
 * Select questions with repeats to meet count requirement
 * 允许重复使用问题以确保足够的题目数量
 * Same logic as generate-sequences.ts
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
 * Fetch all questions from Firestore duel_questions collection
 */
async function fetchAllQuestions(): Promise<Array<{
  questionId: string;
  difficulty: DifficultyLevel;
}>> {
  const snapshot = await db.collection('duel_questions').get();

  if (snapshot.empty) {
    throw new Error('No questions found in duel_questions. Run upload-complete-questions.mjs first.');
  }

  const questions: Array<{ questionId: string; difficulty: DifficultyLevel }> = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    questions.push({
      questionId: data.questionId,
      difficulty: data.difficulty as DifficultyLevel
    });
  });

  return questions;
}

/**
 * Create a sequence with specified strategy
 * Same logic as generate-sequences.ts createSequence function
 */
function createSequence(
  sequenceId: string,
  duration: 30 | 45,
  strategy: SequenceStrategy,
  availableQuestions: Array<{ questionId: string; difficulty: DifficultyLevel }>
): QuestionSequence {
  const questionCount = duration === 30 ? SEQUENCE_CONFIG.QUESTIONS_30S : SEQUENCE_CONFIG.QUESTIONS_45S;
  const distribution = SEQUENCE_CONFIG.DISTRIBUTIONS[strategy];

  // Separate questions by difficulty
  const easyQuestions = availableQuestions.filter(q => q.difficulty === 'EASY');
  const mediumQuestions = availableQuestions.filter(q => q.difficulty === 'MEDIUM');
  const hardQuestions = availableQuestions.filter(q => q.difficulty === 'HARD');

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
  const questions: QuestionRef[] = orderedQuestions.map((q, idx) => ({
    questionId: q.questionId,
    order: idx,
    difficulty: q.difficulty
  }));

  return {
    sequenceId,
    duration,
    strategy,
    questionCount: questions.length,
    questions,
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
 * Create a match sequence on-the-fly
 * Used for dynamic sequence generation (alternative to pre-generated sequences)
 */
export async function createMatchSequence(
  duration: 30 | 45,
  strategy: SequenceStrategy
): Promise<AgentResult<QuestionSequence>> {
  const logs: string[] = [];
  logs.push(`[QuestionSequencingAgent] Creating ${duration}s sequence with ${strategy} strategy`);

  try {
    const allQuestions = await fetchAllQuestions();
    logs.push(`[QuestionSequencingAgent] Loaded ${allQuestions.length} questions from pool`);

    const sequenceId = `${duration}s_${strategy.toLowerCase()}_${Date.now()}`;
    const sequence = createSequence(sequenceId, duration, strategy, allQuestions);

    logs.push(`[QuestionSequencingAgent] Created sequence with ${sequence.questionCount} questions`);

    return {
      success: true,
      data: sequence,
      logs
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`[QuestionSequencingAgent] ERROR: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      logs
    };
  }
}

/**
 * Get a random pre-generated sequence from Firestore
 * Uses sequences created by generate-sequences.ts
 */
export async function getRandomSequence(
  duration: 30 | 45
): Promise<AgentResult<QuestionSequence>> {
  const logs: string[] = [];
  logs.push(`[QuestionSequencingAgent] Fetching random ${duration}s sequence`);

  try {
    const snapshot = await db.collection('duel_sequences')
      .where('duration', '==', duration)
      .get();

    if (snapshot.empty) {
      throw new Error(`No ${duration}s sequences found. Run generate-sequences.ts first.`);
    }

    // Pick random sequence
    const docs = snapshot.docs;
    const randomIndex = Math.floor(Math.random() * docs.length);
    const data = docs[randomIndex].data();

    // Convert Firestore format to QuestionSequence
    const sequence: QuestionSequence = {
      sequenceId: data.sequenceId,
      duration: data.duration,
      strategy: data.difficultyStrategy as SequenceStrategy,
      questionCount: data.questionCount,
      questions: data.questions,
      createdAt: data.createdAt,
      metadata: data.metadata
    };

    logs.push(`[QuestionSequencingAgent] Selected sequence: ${sequence.sequenceId}`);

    return {
      success: true,
      data: sequence,
      logs
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`[QuestionSequencingAgent] ERROR: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      logs
    };
  }
}

/**
 * Generate all 12 pre-defined sequences
 * Same logic as generate-sequences.ts generateAllSequences function
 */
export async function generateAllSequences(): Promise<AgentResult<QuestionSequence[]>> {
  const logs: string[] = [];
  logs.push('[QuestionSequencingAgent] Generating all 12 pre-defined sequences');

  try {
    const allQuestions = await fetchAllQuestions();
    logs.push(`[QuestionSequencingAgent] Loaded ${allQuestions.length} questions`);

    const sequences: QuestionSequence[] = [];
    const strategies: SequenceStrategy[] = ['FLAT', 'ASCENDING', 'DESCENDING'];

    // 30-second sequences (6 total)
    for (let i = 0; i < 2; i++) {
      for (const strategy of strategies) {
        const sequenceId = `30s_${strategy.toLowerCase()}_${i + 1}`;
        sequences.push(createSequence(sequenceId, 30, strategy, allQuestions));
      }
    }

    // 45-second sequences (6 total)
    for (let i = 0; i < 2; i++) {
      for (const strategy of strategies) {
        const sequenceId = `45s_${strategy.toLowerCase()}_${i + 1}`;
        sequences.push(createSequence(sequenceId, 45, strategy, allQuestions));
      }
    }

    logs.push(`[QuestionSequencingAgent] Generated ${sequences.length} sequences`);

    return {
      success: true,
      data: sequences,
      logs
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`[QuestionSequencingAgent] ERROR: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      logs
    };
  }
}

/**
 * Store sequences to Firestore
 * Same logic as generate-sequences.ts batch store
 */
export async function storeSequencesToFirestore(
  sequences: QuestionSequence[]
): Promise<AgentResult<number>> {
  const logs: string[] = [];
  logs.push(`[QuestionSequencingAgent] Storing ${sequences.length} sequences to Firestore`);

  try {
    // Clear existing sequences
    const existingSnapshot = await db.collection('duel_sequences').get();
    if (!existingSnapshot.empty) {
      const deleteBatch = db.batch();
      existingSnapshot.forEach(doc => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
      logs.push(`[QuestionSequencingAgent] Cleared ${existingSnapshot.size} existing sequences`);
    }

    // Store new sequences (convert to Firestore format)
    const batch = db.batch();
    for (const sequence of sequences) {
      const docRef = db.collection('duel_sequences').doc(sequence.sequenceId);
      batch.set(docRef, {
        sequenceId: sequence.sequenceId,
        duration: sequence.duration,
        difficultyStrategy: sequence.strategy,  // Match generate-sequences.ts field name
        questionCount: sequence.questionCount,
        questions: sequence.questions,
        createdAt: sequence.createdAt,
        metadata: sequence.metadata
      });
    }
    await batch.commit();

    logs.push(`[QuestionSequencingAgent] Stored ${sequences.length} sequences`);

    return {
      success: true,
      data: sequences.length,
      logs
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`[QuestionSequencingAgent] ERROR: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      logs
    };
  }
}

/**
 * Get sequence stats from Firestore
 */
export async function getSequenceStats(): Promise<AgentResult<{
  total: number;
  by30s: number;
  by45s: number;
  byStrategy: Record<string, number>;
}>> {
  const logs: string[] = [];
  logs.push('[QuestionSequencingAgent] Fetching sequence stats');

  try {
    const snapshot = await db.collection('duel_sequences').get();

    const stats = {
      total: 0,
      by30s: 0,
      by45s: 0,
      byStrategy: {} as Record<string, number>
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      stats.total++;

      if (data.duration === 30) stats.by30s++;
      else if (data.duration === 45) stats.by45s++;

      const strategy = data.difficultyStrategy;
      stats.byStrategy[strategy] = (stats.byStrategy[strategy] || 0) + 1;
    });

    logs.push(`[QuestionSequencingAgent] Stats: ${stats.total} total (${stats.by30s} 30s, ${stats.by45s} 45s)`);

    return {
      success: true,
      data: stats,
      logs
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`[QuestionSequencingAgent] ERROR: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      logs
    };
  }
}
