/**
 * DUEL Arena Agent Types
 * Shared type definitions for all question-related agents
 */

// ============ Question Generation Agent Types ============

export interface QuestionStem {
  noun: string;           // The main concept/noun (e.g., "Flag of Japan")
  category: QuestionCategory;
}

export type QuestionCategory =
  | 'FLAGS'
  | 'LANDMARKS'
  | 'ANIMALS'
  | 'FOOD'
  | 'LOGOS'
  | 'SYMBOLS';

export interface ImageOption {
  url: string;
  prompt: string;         // Description used to generate/identify the image
  isCorrect: boolean;
  index: number;
  generatedAt: string;
}

export interface GeneratedQuestion {
  questionId: string;
  stem: string;           // The noun/concept to identify
  category: QuestionCategory;
  images: ImageOption[];  // Exactly 4 images: 1 correct + 3 distractors
  correctIndex: number;   // Index of the correct answer (0-3)
  metadata: {
    imageGenModel: string;
    imageSize: string;
    stylePrompt?: string;
    generatedBy: string;
  };
}

// ============ Question Validation Agent Types ============

export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidatedQuestion extends GeneratedQuestion {
  difficulty: DifficultyLevel;
  validation: {
    validatedAt: string;
    validatedBy: string;
    structureCheck: boolean;
    uniquenessCheck: boolean;
    correctnessCheck: boolean;
  };
  createdAt: string;
}

// ============ Question Sequencing Agent Types ============

export type SequenceStrategy = 'FLAT' | 'ASCENDING' | 'DESCENDING';

export interface QuestionRef {
  questionId: string;
  order: number;
  difficulty: DifficultyLevel;
}

export interface QuestionSequence {
  sequenceId: string;
  duration: 30 | 45;
  strategy: SequenceStrategy;
  questionCount: number;
  questions: QuestionRef[];  // Can include repeats from 150-question pool
  createdAt: string;
  metadata: {
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    allowsRepeats: boolean;
    generatedBy: string;
  };
}

// ============ Agent Interface ============

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  logs: string[];
}

export interface QuestionGenerationAgentInput {
  stem: QuestionStem;
  useAI?: boolean;        // If true, use AI to generate images; otherwise use placeholders
}

export interface QuestionValidationAgentInput {
  question: GeneratedQuestion;
}

export interface QuestionSequencingAgentInput {
  duration: 30 | 45;
  strategy: SequenceStrategy;
  minQuestions?: number;  // Minimum questions needed (default: enough for duration)
}
