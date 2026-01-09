/**
 * Duel Service - Match Logic and Settlement
 *
 * Handles:
 * - Entry validation
 * - Opponent matchmaking
 * - Match initialization
 * - Result calculation
 * - Credit settlement
 *
 * 重要: 使用 duel_questions (150个问题) 和 duel_sequences (12个序列) 集合
 * 不再使用旧的 mock 数据
 */

import { DuelConfig, DuelMatch, DuelPlayer, UserCredits } from '../types';
import { getMatchSequence } from './duelAgentService';
import { getQuestionSequence } from './duelFirebaseService';

export const SAFETY_BELT_COST = 5; // $5 safety belt fee
export const SAFETY_BELT_THRESHOLD = 18; // Minimum entry fee to enable safety belt
export const INITIAL_CREDITS_GRANT = 100; // Initial credits granted to new users

// ==================== Entry Validation ====================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate user can enter a duel with given configuration
 */
export const validateEntry = (
  userCredits: number,
  config: DuelConfig
): ValidationResult => {
  let requiredCredits = config.entryFee;

  // Add safety belt cost if enabled
  if (config.safetyBelt) {
    if (config.entryFee < SAFETY_BELT_THRESHOLD) {
      return {
        valid: false,
        error: `Safety belt only available for entry fee ≥ $${SAFETY_BELT_THRESHOLD}`
      };
    }
    requiredCredits += SAFETY_BELT_COST;
  }

  // Check sufficient balance
  if (userCredits < requiredCredits) {
    return {
      valid: false,
      error: `Insufficient balance. Need $${requiredCredits}, have $${userCredits}`
    };
  }

  // Validate entry fee range
  if (config.entryFee < 1 || config.entryFee > 20) {
    return {
      valid: false,
      error: 'Entry fee must be between $1 and $20'
    };
  }

  return { valid: true };
};

// ==================== Opponent Matchmaking ====================

// Mock opponent pool - different persona types
const OPPONENT_POOLS = [
  { stanceType: 'conservative-nationalist', label: 'Conservative Nationalist' },
  { stanceType: 'socialist-libertarian', label: 'Socialist Libertarian' },
  { stanceType: 'capitalist-globalist', label: 'Capitalist Globalist' },
  { stanceType: 'moderate-traditionalist', label: 'Moderate Traditionalist' },
  { stanceType: 'progressive-internationalist', label: 'Progressive Internationalist' },
  { stanceType: 'libertarian-isolationist', label: 'Libertarian Isolationist' }
];

/**
 * Find opponent for matchmaking
 * Ensures opponent has different stanceType
 * Simulates network ping and returns mock opponent
 *
 * In production: This would query Firestore for real users waiting in matchmaking queue
 */
export const findOpponent = async (
  userStanceType: string,
  userPing: number
): Promise<DuelPlayer> => {
  return new Promise((resolve) => {
    // Simulate matchmaking delay (1.5-3 seconds)
    const delay = Math.random() * 1500 + 1500;

    setTimeout(() => {
      // Filter opponents with different stance type
      const available = OPPONENT_POOLS.filter(p => p.stanceType !== userStanceType);

      // Select random opponent
      const randomOpponent = available[Math.floor(Math.random() * available.length)];

      // Generate opponent ping (similar to user, ±20ms for fairness)
      const opponentPing = Math.max(15, Math.min(100, userPing + (Math.random() * 40 - 20)));

      resolve({
        id: 'opponent_bot_' + Math.random().toString(36).slice(2, 10),
        personaLabel: randomOpponent.label,
        stanceType: randomOpponent.stanceType,
        ping: Math.round(opponentPing),
        score: 0
      });
    }, delay);
  });
};

/**
 * Check if ping difference is acceptable for fair gameplay
 * Maximum allowed difference: 60ms
 */
export const validatePingDifference = (pingA: number, pingB: number): boolean => {
  const MAX_PING_DIFF = 60;
  return Math.abs(pingA - pingB) <= MAX_PING_DIFF;
};

// ==================== Match Initialization ====================

/**
 * Initialize a new duel match
 * 从 Firestore duel_sequences 集合获取预生成的问题序列
 * 使用 duel_questions 集合中的 150 个问题
 */
export const initMatch = async (
  playerA: DuelPlayer,
  playerB: DuelPlayer,
  config: DuelConfig
): Promise<DuelMatch> => {
  // 从 Firestore 获取随机序列 (使用 Cloud Function)
  const sequenceResult = await getMatchSequence(config.duration);

  if (!sequenceResult.success || !sequenceResult.data) {
    throw new Error(sequenceResult.error || 'Failed to get question sequence');
  }

  // 获取序列中的所有问题详情
  const questions = await getQuestionSequence(sequenceResult.data.sequenceId);

  if (questions.length === 0) {
    throw new Error('No questions found in sequence');
  }

  const match: DuelMatch = {
    id: 'match_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    playerA,
    playerB,
    config,
    questions,
    currentQuestionIndex: 0,
    winner: null,
    earnings: 0,
    createdAt: new Date().toISOString()
  };

  return match;
};

// ==================== Result Calculation ====================

export interface MatchResults {
  netChangeA: number; // Net credit change for player A
  netChangeB: number; // Net credit change for player B
  victoryReward: number; // Total victory reward (feeA + feeB)
}

/**
 * Calculate match results and credit changes
 *
 * Victory Reward = feeA + feeB (system-issued reward)
 * Winner receives: +victoryReward - entryCost
 * Loser loses: -entryFee (or -half if safety belt active) - safety belt fee
 *
 * This structure prepares for real money integration:
 * - Victory reward is "system issued" not "taken from opponent"
 * - Clear accounting of entry fees vs rewards
 * - Safety belt acts as loss protection insurance
 */
export const calculateResults = (match: DuelMatch): MatchResults => {
  const fee = match.config.entryFee;
  const hasBeltA = match.config.safetyBelt;
  const hasBeltB = match.config.safetyBelt; // In full implementation, each player chooses independently

  // Victory reward is always system-issued: feeA + feeB
  const victoryReward = fee * 2;

  if (match.winner === 'A') {
    // Player A wins
    const costA = fee + (hasBeltA ? SAFETY_BELT_COST : 0);
    const netA = victoryReward - costA;

    // Player B loses
    const lossB = hasBeltB ? Math.ceil(fee / 2) : fee;
    const costB = lossB + (hasBeltB ? SAFETY_BELT_COST : 0);
    const netB = -costB;

    return {
      netChangeA: netA,
      netChangeB: netB,
      victoryReward
    };
  } else if (match.winner === 'B') {
    // Player B wins
    const costB = fee + (hasBeltB ? SAFETY_BELT_COST : 0);
    const netB = victoryReward - costB;

    // Player A loses
    const lossA = hasBeltA ? Math.ceil(fee / 2) : fee;
    const costA = lossA + (hasBeltA ? SAFETY_BELT_COST : 0);
    const netA = -costA;

    return {
      netChangeA: netA,
      netChangeB: netB,
      victoryReward
    };
  } else {
    // Draw - refund entry fees (safety belt fees are also refunded on draw)
    return {
      netChangeA: 0,
      netChangeB: 0,
      victoryReward: 0
    };
  }
};

// ==================== Credit Management ====================

/**
 * Grant initial credits to new user
 * Should be called once when user completes onboarding
 */
export const grantInitialCredits = (): UserCredits => {
  return {
    balance: INITIAL_CREDITS_GRANT,
    updatedAt: new Date().toISOString(),
    initialGrant: INITIAL_CREDITS_GRANT,
    grantedAt: new Date().toISOString()
  };
};

/**
 * Format credits as currency string
 * 1 credit = $1.00
 */
export const formatCredits = (credits: number): string => {
  return `$${credits}`;
};

/**
 * Measure user's network ping (simulated)
 * In production: Could use WebRTC or ping API endpoints
 */
export const measurePing = async (): Promise<number> => {
  return new Promise((resolve) => {
    // Simulate ping measurement
    const basePing = 25 + Math.random() * 30; // 25-55ms
    setTimeout(() => {
      resolve(Math.round(basePing));
    }, 500);
  });
};
