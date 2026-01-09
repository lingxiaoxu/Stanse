/**
 * Question Generation Agent System for DUEL Arena
 *
 * Three-agent architecture:
 * 1. Question Generation Agent: Generates questions with 1 correct + 3 similar distractors
 * 2. Question Validation Agent: Validates structure and assigns difficulty
 * 3. Question Sequencing Agent: Assembles questions into gameplay sequences
 */

import { Question, QuestionDifficulty } from '../../types';

// ==================== Topic Clusters (Mock Data Source) ====================
// In production, this would be replaced with AI image generation API calls

interface TopicCluster {
  stem: string;
  correct: string;
  distractors: string[];
}

const TOPIC_CLUSTERS: Record<string, TopicCluster> = {
  flags_red: {
    stem: "Flag of Turkey",
    correct: "https://flagcdn.com/w320/tr.png",
    distractors: [
      "https://flagcdn.com/w320/tn.png", // Tunisia (Similar red, crescent)
      "https://flagcdn.com/w320/ma.png", // Morocco (Similar red)
      "https://flagcdn.com/w320/vn.png"  // Vietnam (Red star)
    ]
  },
  flags_nordic: {
    stem: "Flag of Sweden",
    correct: "https://flagcdn.com/w320/se.png",
    distractors: [
      "https://flagcdn.com/w320/fi.png", // Finland (Nordic cross)
      "https://flagcdn.com/w320/is.png", // Iceland (Nordic cross)
      "https://flagcdn.com/w320/no.png"  // Norway (Nordic cross)
    ]
  },
  flags_tricolor: {
    stem: "Flag of France",
    correct: "https://flagcdn.com/w320/fr.png",
    distractors: [
      "https://flagcdn.com/w320/nl.png", // Netherlands
      "https://flagcdn.com/w320/ru.png", // Russia
      "https://flagcdn.com/w320/it.png"  // Italy
    ]
  },
  flags_union: {
    stem: "Flag of United Kingdom",
    correct: "https://flagcdn.com/w320/gb.png",
    distractors: [
      "https://flagcdn.com/w320/au.png", // Australia (Union Jack)
      "https://flagcdn.com/w320/nz.png", // New Zealand (Union Jack)
      "https://flagcdn.com/w320/us.png"  // USA (Stars and stripes)
    ]
  },
  landmarks_tower: {
    stem: "The Tokyo Tower",
    correct: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=400&q=80",
    distractors: [
      "https://images.unsplash.com/photo-1511739001486-6bfe10ce7859?w=400&q=80", // Eiffel Tower
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&q=80", // Paris Tower
      "https://images.unsplash.com/photo-1543835070-65996639d2d4?w=400&q=80"  // Blackpool Tower
    ]
  },
  landmarks_bridge: {
    stem: "Golden Gate Bridge",
    correct: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=400&q=80",
    distractors: [
      "https://images.unsplash.com/photo-1513026705753-bc3fffca8bf4?w=400&q=80", // Brooklyn Bridge
      "https://images.unsplash.com/photo-1526495124232-a04e1849168c?w=400&q=80", // Tower Bridge
      "https://images.unsplash.com/photo-1558882224-dda166733046?w=400&q=80"  // Sydney Harbour
    ]
  },
  symbols_peace: {
    stem: "Symbol of Peace",
    correct: "https://cdn-icons-png.flaticon.com/512/0/608.png", // Dove
    distractors: [
      "https://cdn-icons-png.flaticon.com/512/32/32223.png", // Olive Branch
      "https://cdn-icons-png.flaticon.com/512/14/14556.png", // V sign
      "https://cdn-icons-png.flaticon.com/512/57/57095.png"  // CND Symbol
    ]
  },
  animals_bird: {
    stem: "American Bald Eagle",
    correct: "https://images.unsplash.com/photo-1611398751014-0dbe7e72b53b?w=400&q=80",
    distractors: [
      "https://images.unsplash.com/photo-1573935638377-c80a5b63423c?w=400&q=80", // Golden Eagle
      "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=400&q=80", // Hawk
      "https://images.unsplash.com/photo-1513135065346-a098a63a71ee?w=400&q=80"  // Falcon
    ]
  }
};

// ==================== AGENT 1: Question Generation Agent ====================

class QuestionGenerationAgent {
  /**
   * Generates a raw question from a topic cluster
   * Ensures 1 correct answer + 3 similar but incorrect distractors
   * Shuffles choices to randomize correct answer position
   */
  generate(topicKey: string): Omit<Question, 'id' | 'difficulty'> {
    const data = TOPIC_CLUSTERS[topicKey as keyof typeof TOPIC_CLUSTERS];

    if (!data) {
      throw new Error(`Topic cluster not found: ${topicKey}`);
    }

    // Create pool of 4 choices
    const pool = [data.correct, ...data.distractors];

    // Shuffle to randomize correct answer position
    const shuffled = pool
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);

    const correctIndex = shuffled.indexOf(data.correct);

    return {
      stem: data.stem,
      choices: shuffled,
      correctIndex: correctIndex
    };
  }

  /**
   * Generate multiple questions from random topics
   */
  generateBatch(count: number): Array<Omit<Question, 'id' | 'difficulty'>> {
    const topics = Object.keys(TOPIC_CLUSTERS);
    const questions: Array<Omit<Question, 'id' | 'difficulty'>> = [];

    for (let i = 0; i < count; i++) {
      const topicKey = topics[i % topics.length];
      questions.push(this.generate(topicKey));
    }

    return questions;
  }
}

// ==================== AGENT 2: Question Validation Agent ====================

class QuestionValidationAgent {
  /**
   * Validates question structure and assigns difficulty rating
   * Returns validated Question with ID and difficulty, or null if invalid
   */
  validateAndTag(rawQuestion: Omit<Question, 'id' | 'difficulty'>): Question | null {
    // Structural validation
    if (!rawQuestion.stem || rawQuestion.stem.trim().length === 0) {
      console.warn('Question validation failed: empty stem');
      return null;
    }

    if (rawQuestion.choices.length !== 4) {
      console.warn('Question validation failed: must have exactly 4 choices');
      return null;
    }

    // Check for duplicate choices
    const uniqueChoices = new Set(rawQuestion.choices);
    if (uniqueChoices.size !== 4) {
      console.warn('Question validation failed: duplicate choices detected');
      return null;
    }

    // Validate correct index
    if (rawQuestion.correctIndex < 0 || rawQuestion.correctIndex > 3) {
      console.warn('Question validation failed: invalid correctIndex');
      return null;
    }

    // Assign difficulty based on various factors
    // In production, this could use computer vision to analyze visual similarity
    // For now, we simulate difficulty based on randomness + heuristics
    const difficulty = this.calculateDifficulty(rawQuestion);

    return {
      id: this.generateQuestionId(),
      ...rawQuestion,
      difficulty
    };
  }

  /**
   * Calculate difficulty based on question characteristics
   * In production: analyze visual similarity between images, text complexity, etc.
   */
  private calculateDifficulty(question: Omit<Question, 'id' | 'difficulty'>): QuestionDifficulty {
    // Simulate difficulty calculation
    const rand = Math.random();

    // Weighted distribution: 30% easy, 50% medium, 20% hard
    if (rand < 0.3) {
      return QuestionDifficulty.EASY;
    } else if (rand < 0.8) {
      return QuestionDifficulty.MEDIUM;
    } else {
      return QuestionDifficulty.HARD;
    }
  }

  /**
   * Generate unique question ID
   */
  private generateQuestionId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ==================== AGENT 3: Question Sequencing Agent ====================

class QuestionSequencingAgent {
  private generationAgent = new QuestionGenerationAgent();
  private validationAgent = new QuestionValidationAgent();

  /**
   * Generate a complete question sequence for a duel match
   * Ensures enough questions for the given duration and applies difficulty strategy
   *
   * @param durationSeconds - Match duration (30 or 45 seconds)
   * @param strategy - Difficulty progression strategy
   * @returns Array of validated questions in sequence
   */
  async generateSequence(
    durationSeconds: number,
    strategy: 'FLAT' | 'ASCENDING' | 'DESCENDING' = 'ASCENDING'
  ): Promise<Question[]> {
    // Calculate required question count
    // Assume max human speed: 1.5 seconds per question
    // Add buffer to ensure we never run out
    const baseCount = durationSeconds === 30 ? 20 : 30;
    const bufferMultiplier = 1.2; // 20% buffer
    const countNeeded = Math.ceil(baseCount * bufferMultiplier);

    const sequence: Question[] = [];

    // Generate and validate questions
    const rawQuestions = this.generationAgent.generateBatch(countNeeded);

    for (const rawQuestion of rawQuestions) {
      const validated = this.validationAgent.validateAndTag(rawQuestion);
      if (validated) {
        sequence.push(validated);
      }
    }

    // Apply difficulty strategy
    this.applyStrategy(sequence, strategy);

    return sequence;
  }

  /**
   * Apply difficulty strategy to question sequence
   */
  private applyStrategy(sequence: Question[], strategy: 'FLAT' | 'ASCENDING' | 'DESCENDING'): void {
    const difficultyOrder = {
      [QuestionDifficulty.EASY]: 1,
      [QuestionDifficulty.MEDIUM]: 2,
      [QuestionDifficulty.HARD]: 3
    };

    switch (strategy) {
      case 'ASCENDING':
        // Easy -> Medium -> Hard
        sequence.sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]);
        break;

      case 'DESCENDING':
        // Hard -> Medium -> Easy
        sequence.sort((a, b) => difficultyOrder[b.difficulty] - difficultyOrder[a.difficulty]);
        break;

      case 'FLAT':
        // Random shuffle - keep difficulty mixed
        sequence.sort(() => Math.random() - 0.5);
        break;
    }
  }
}

// ==================== Export Agent System ====================

export const questionSequencingAgent = new QuestionSequencingAgent();
