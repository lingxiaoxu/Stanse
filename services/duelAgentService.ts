/**
 * DUEL Arena Agent Service
 *
 * Frontend service to interact with DUEL Arena Agents via Cloud Functions.
 * All operations are secure - no API keys exposed to client.
 *
 * Agents:
 * - Question Generation Agent: Manages question pool
 * - Question Validation Agent: Validates question structure
 * - Question Sequencing Agent: Creates match sequences
 */

import { functions } from './firebase';
import { httpsCallable } from 'firebase/functions';

// ==================== Types ====================

export interface QuestionStats {
  total: number;
  easy: number;
  medium: number;
  hard: number;
  byCategory: Record<string, number>;
}

export interface SequenceStats {
  total: number;
  by30s: number;
  by45s: number;
  byStrategy: Record<string, number>;
}

export interface QuestionRef {
  questionId: string;
  order: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

export interface QuestionSequence {
  sequenceId: string;
  duration: 30 | 45;
  strategy: 'FLAT' | 'ASCENDING' | 'DESCENDING';
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

export interface RawQuestion {
  id: string;
  stem: string;
  category: string;
  difficulty: string;
  correct: string;
  distractors: string[];
}

export interface ValidationResult {
  valid: number;
  invalid: number;
  errors: Array<{ id: string; errors: string[] }>;
}

export interface AgentResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  logs?: string[];
}

// ==================== Question Generation Agent ====================

/**
 * Get statistics about questions in the pool
 * Uses Question Generation Agent
 */
export async function getQuestionStats(): Promise<AgentResponse<QuestionStats>> {
  try {
    const callable = httpsCallable(functions, 'getDuelQuestionStats');
    const result = await callable();
    // Cloud Function returns { success, stats }, convert to { success, data }
    const response = result.data as { success: boolean; stats?: QuestionStats; logs?: string[]; error?: string };
    return {
      success: response.success,
      data: response.stats,
      logs: response.logs,
      error: response.error
    };
  } catch (error) {
    console.error('[DuelAgentService] Error getting question stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ==================== Question Validation Agent ====================

/**
 * Validate an array of raw questions
 * Uses Question Validation Agent
 */
export async function validateQuestions(
  questions: RawQuestion[]
): Promise<AgentResponse<ValidationResult>> {
  try {
    const callable = httpsCallable(functions, 'validateDuelQuestions');
    const result = await callable({ questions });
    // Cloud Function returns { success, validation }, convert to { success, data }
    const response = result.data as { success: boolean; validation?: ValidationResult; logs?: string[]; error?: string };
    return {
      success: response.success,
      data: response.validation,
      logs: response.logs,
      error: response.error
    };
  } catch (error) {
    console.error('[DuelAgentService] Error validating questions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ==================== Question Sequencing Agent ====================

/**
 * Get statistics about sequences
 * Uses Question Sequencing Agent
 */
export async function getSequenceStats(): Promise<AgentResponse<SequenceStats>> {
  try {
    const callable = httpsCallable(functions, 'getDuelSequenceStats');
    const result = await callable();
    // Cloud Function returns { success, stats }, convert to { success, data }
    const response = result.data as { success: boolean; stats?: SequenceStats; logs?: string[]; error?: string };
    return {
      success: response.success,
      data: response.stats,
      logs: response.logs,
      error: response.error
    };
  } catch (error) {
    console.error('[DuelAgentService] Error getting sequence stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get a random question sequence for a match
 * Uses Question Sequencing Agent
 *
 * @param duration - Match duration (30 or 45 seconds)
 */
export async function getMatchSequence(
  duration: 30 | 45
): Promise<AgentResponse<QuestionSequence>> {
  try {
    const callable = httpsCallable(functions, 'getDuelMatchSequence');
    const result = await callable({ duration });
    // Cloud Function returns { success, sequence }, convert to { success, data }
    const response = result.data as { success: boolean; sequence?: QuestionSequence; error?: string };
    return {
      success: response.success,
      data: response.sequence,
      error: response.error
    };
  } catch (error) {
    console.error('[DuelAgentService] Error getting match sequence:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate all 12 pre-defined sequences
 * Uses Question Sequencing Agent
 *
 * This is an admin function that regenerates all sequences:
 * - 6 sequences for 30s matches (2 per strategy)
 * - 6 sequences for 45s matches (2 per strategy)
 */
export async function generateAllSequences(): Promise<AgentResponse<number>> {
  try {
    const callable = httpsCallable(functions, 'generateDuelSequences');
    const result = await callable();
    // Cloud Function returns { success, count }, convert to { success, data }
    const response = result.data as { success: boolean; count?: number; logs?: string[]; error?: string };
    return {
      success: response.success,
      data: response.count,
      logs: response.logs,
      error: response.error
    };
  } catch (error) {
    console.error('[DuelAgentService] Error generating sequences:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ==================== Combined Agent Operations ====================

/**
 * Get full system status
 * Calls multiple agents to get complete status
 */
export async function getSystemStatus(): Promise<{
  questions: AgentResponse<QuestionStats>;
  sequences: AgentResponse<SequenceStats>;
}> {
  const [questions, sequences] = await Promise.all([
    getQuestionStats(),
    getSequenceStats()
  ]);

  return { questions, sequences };
}

/**
 * Initialize DUEL system
 * Checks if questions and sequences exist, generates if needed
 */
export async function initializeDuelSystem(): Promise<{
  questionsReady: boolean;
  sequencesReady: boolean;
  message: string;
}> {
  try {
    const status = await getSystemStatus();

    const questionsReady = status.questions.success &&
      (status.questions.data?.total || 0) >= 150;

    const sequencesReady = status.sequences.success &&
      (status.sequences.data?.total || 0) >= 12;

    let message = '';

    if (!questionsReady) {
      message = 'Questions not ready. Upload questions using populate-duel-questions.html';
    } else if (!sequencesReady) {
      message = 'Generating sequences...';
      const genResult = await generateAllSequences();
      if (genResult.success) {
        message = `Generated ${genResult.data} sequences`;
        return { questionsReady: true, sequencesReady: true, message };
      } else {
        message = `Failed to generate sequences: ${genResult.error}`;
      }
    } else {
      message = 'DUEL system ready';
    }

    return { questionsReady, sequencesReady, message };
  } catch (error) {
    return {
      questionsReady: false,
      sequencesReady: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
