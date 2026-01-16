/**
 * Settlement System for DUEL Arena
 *
 * Server-side settlement with anti-cheat validation
 * - Validates gameplay events
 * - Calculates final scores
 * - Updates credits atomically
 * - Records platform revenue
 */

import * as admin from 'firebase-admin';
import { releaseCredits, deductCredits, rewardCredits } from './creditManager';

const db = admin.firestore();

interface GameplayEvent {
  eventId: string;
  questionId: string;
  questionOrder: number;
  playerId: string;
  answerIndex: number;
  isCorrect: boolean;
  timestamp: string;
  timeElapsed: number;
  currentScoreA: number;
  currentScoreB: number;
}

interface MatchDocument {
  matchId: string;
  status: string;
  players: {
    A: { userId: string; stanceType: string; personaLabel: string; pingMs: number };
    B: { userId: string; stanceType: string; personaLabel: string; pingMs: number };
  };
  entry: {
    A: { fee: number; safetyBelt: boolean; safetyFee: number };
    B: { fee: number; safetyBelt: boolean; safetyFee: number };
  };
  holds: {
    A: number;
    B: number;
  };
  result: {
    winner: 'A' | 'B' | 'draw' | null;
    scoreA: number;
    scoreB: number;
    victoryReward: number;
    deductionA: number;
    deductionB: number;
    settledAt?: string;
  };
}

/**
 * Validate gameplay events for anti-cheat
 */
function validateGameplayEvents(events: GameplayEvent[]): {
  valid: boolean;
  reason?: string;
} {
  if (events.length === 0) {
    return { valid: false, reason: 'No gameplay events found' };
  }

  // Check timestamps are sequential
  for (let i = 1; i < events.length; i++) {
    const prev = new Date(events[i - 1].timestamp).getTime();
    const curr = new Date(events[i].timestamp).getTime();

    if (curr < prev) {
      return { valid: false, reason: 'Non-sequential timestamps detected' };
    }
  }

  // Check for impossibly fast answers (< 100ms)
  const MIN_HUMAN_REACTION_TIME = 100; // milliseconds
  let suspiciousCount = 0;

  for (let i = 1; i < events.length; i++) {
    const timeDiff = new Date(events[i].timestamp).getTime() - new Date(events[i - 1].timestamp).getTime();

    if (timeDiff < MIN_HUMAN_REACTION_TIME && events[i].isCorrect) {
      suspiciousCount++;
    }
  }

  // Flag if more than 30% of answers are suspiciously fast
  if (suspiciousCount / events.length > 0.3) {
    return { valid: false, reason: `Suspicious answer speed: ${suspiciousCount}/${events.length} too fast` };
  }

  return { valid: true };
}

/**
 * Calculate final scores from gameplay events
 */
function calculateScores(events: GameplayEvent[], userIdA: string, userIdB: string): {
  scoreA: number;
  scoreB: number;
} {
  let scoreA = 0;
  let scoreB = 0;

  for (const event of events) {
    // Skip "too slow" markers (answerIndex=-1) - these are 0 points
    if (event.answerIndex === -1) {
      continue;
    }

    // Unified scoring rule: +1 for correct, -2 for wrong
    const scoreChange = event.isCorrect ? 1 : -2;

    if (event.playerId === userIdA) {
      scoreA += scoreChange;
    } else if (event.playerId === userIdB) {
      scoreB += scoreChange;
    }
  }

  return { scoreA, scoreB };
}

/**
 * Settle a completed match
 * Called when match time expires or all questions answered
 */
export async function settleMatch(matchId: string): Promise<void> {
  console.log(`💰 Settling match ${matchId}...`);

  const matchRef = db.collection('duel_matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new Error(`Match ${matchId} not found`);
  }

  const match = matchDoc.data() as MatchDocument;

  if (match.status === 'finished' || match.status === 'settling') {
    console.log(`  ℹ️  Match already settled or currently settling`);
    return;
  }

  // Mark as settling to prevent concurrent settlement
  await matchRef.update({ status: 'settling' });
  console.log(`  🔒 Locked match for settlement`);

  // Fetch all gameplay events
  const eventsSnapshot = await matchRef
    .collection('gameplay_events')
    .orderBy('timestamp')
    .get();

  const events: GameplayEvent[] = [];
  eventsSnapshot.forEach(doc => {
    events.push(doc.data() as GameplayEvent);
  });

  // Validate events (anti-cheat)
  const validation = validateGameplayEvents(events);
  if (!validation.valid) {
    console.error(`❌ Anti-cheat failed: ${validation.reason}`);
    // Cancel match and refund
    await cancelMatch(matchId, match, `Anti-cheat: ${validation.reason}`);
    return;
  }

  // Calculate final scores
  const { scoreA, scoreB } = calculateScores(events, match.players.A.userId, match.players.B.userId);

  // Determine winner
  let winner: 'A' | 'B' | 'draw';
  if (scoreA > scoreB) {
    winner = 'A';
  } else if (scoreB > scoreA) {
    winner = 'B';
  } else {
    winner = 'draw';
  }

  // Calculate credit changes
  const settlement = calculateSettlement(match, winner, scoreA, scoreB);

  // Execute settlement atomically
  await executeSettlement(match, settlement);

  console.log(`✅ Match ${matchId} settled: ${winner} wins`);
}

/**
 * Calculate settlement amounts
 */
function calculateSettlement(
  match: MatchDocument,
  winner: 'A' | 'B' | 'draw',
  scoreA: number,
  scoreB: number
): {
  winner: 'A' | 'B' | 'draw';
  scoreA: number;
  scoreB: number;
  victoryReward: number;
  deductionA: number;
  deductionB: number;
  rewardA: number;
  rewardB: number;
  platformRevenue: number;
} {
  const feeA = match.entry.A.fee;
  const feeB = match.entry.B.fee;
  const beltA = match.entry.A.safetyBelt;
  const beltB = match.entry.B.safetyBelt;
  const beltFeeA = match.entry.A.safetyFee;
  const beltFeeB = match.entry.B.safetyFee;

  // Victory reward is always: feeA + feeB (system-issued)
  const victoryReward = feeA + feeB;

  let deductionA = 0;
  let deductionB = 0;
  let rewardA = 0;
  let rewardB = 0;
  let platformRevenue = 0;

  if (winner === 'A') {
    // A wins
    rewardA = victoryReward;
    deductionA = 0; // Winner doesn't lose entry fee (already held)

    // B loses
    const lossB = beltB ? Math.ceil(feeB / 2) : feeB;
    deductionB = lossB;

    // Platform earns all safety belt fees
    platformRevenue = beltFeeA + beltFeeB;
  } else if (winner === 'B') {
    // B wins
    rewardB = victoryReward;
    deductionB = 0;

    // A loses
    const lossA = beltA ? Math.ceil(feeA / 2) : feeA;
    deductionA = lossA;

    platformRevenue = beltFeeA + beltFeeB;
  } else {
    // Draw - refund all (including safety belt fees)
    deductionA = 0;
    deductionB = 0;
    rewardA = 0;
    rewardB = 0;
    platformRevenue = 0; // Refund safety belt fees on draw
  }

  return {
    winner,
    scoreA,
    scoreB,
    victoryReward,
    deductionA,
    deductionB,
    rewardA,
    rewardB,
    platformRevenue
  };
}

/**
 * Check if a user ID belongs to an AI bot
 */
function isAIBot(userId: string): boolean {
  return userId.startsWith('ai_bot_');
}

/**
 * Execute settlement - update credits and match document atomically
 */
async function executeSettlement(
  match: MatchDocument,
  settlement: ReturnType<typeof calculateSettlement>
): Promise<void> {
  const now = new Date().toISOString();
  const matchId = match.matchId;

  const playerAIsBot = isAIBot(match.players.A.userId);
  const playerBIsBot = isAIBot(match.players.B.userId);

  // Apply final credit changes (only for human players)
  // IMPORTANT: Don't RELEASE then DEDUCT - that causes double operations
  // Instead: directly DEDUCT losers, REWARD winners (reward includes their hold)

  if (!playerAIsBot) {
    if (settlement.deductionA > 0) {
      // Player A lost - deduct from their held credits
      await deductCredits(match.players.A.userId, settlement.deductionA, matchId, 'Match loss');
      console.log(`  💰 Player A deducted ${settlement.deductionA} credits`);
    } else if (settlement.rewardA > 0) {
      // Player A won or drew - release hold and add reward
      await releaseCredits(match.players.A.userId, match.holds.A, matchId);
      if (settlement.rewardA > match.holds.A) {
        // Add additional reward beyond their own hold
        await rewardCredits(match.players.A.userId, settlement.rewardA - match.holds.A, matchId);
      }
      console.log(`  💰 Player A rewarded ${settlement.rewardA} credits total`);
    } else {
      // Drew - just release hold
      await releaseCredits(match.players.A.userId, match.holds.A, matchId);
      console.log(`  💰 Player A credits released (drew)`);
    }
  }

  if (!playerBIsBot) {
    if (settlement.deductionB > 0) {
      // Player B lost - deduct from their held credits
      await deductCredits(match.players.B.userId, settlement.deductionB, matchId, 'Match loss');
      console.log(`  💰 Player B deducted ${settlement.deductionB} credits`);
    } else if (settlement.rewardB > 0) {
      // Player B won or drew - release hold and add reward
      await releaseCredits(match.players.B.userId, match.holds.B, matchId);
      if (settlement.rewardB > match.holds.B) {
        // Add additional reward beyond their own hold
        await rewardCredits(match.players.B.userId, settlement.rewardB - match.holds.B, matchId);
      }
      console.log(`  💰 Player B rewarded ${settlement.rewardB} credits total`);
    } else {
      // Drew - just release hold
      await releaseCredits(match.players.B.userId, match.holds.B, matchId);
      console.log(`  💰 Player B credits released (drew)`);
    }
  }

  // Update match document
  await db.collection('duel_matches').doc(matchId).update({
    status: 'finished',
    'result.winner': settlement.winner,
    'result.scoreA': settlement.scoreA,
    'result.scoreB': settlement.scoreB,
    'result.victoryReward': settlement.victoryReward,
    'result.deductionA': settlement.deductionA,
    'result.deductionB': settlement.deductionB,
    'result.settledAt': now
  });

  // Record platform revenue
  if (settlement.platformRevenue > 0) {
    await recordPlatformRevenue(matchId, settlement.platformRevenue, now);
  }
}

/**
 * Cancel match and refund all credits
 */
async function cancelMatch(
  matchId: string,
  match: MatchDocument,
  reason: string
): Promise<void> {
  console.log(`🚫 Cancelling match ${matchId}: ${reason}`);

  // Release all held credits (only for human players)
  if (!isAIBot(match.players.A.userId) && match.holds.A > 0) {
    await releaseCredits(match.players.A.userId, match.holds.A, matchId);
  }
  if (!isAIBot(match.players.B.userId) && match.holds.B > 0) {
    await releaseCredits(match.players.B.userId, match.holds.B, matchId);
  }

  // Update match status
  await db.collection('duel_matches').doc(matchId).update({
    status: 'cancelled',
    'audit.notes': reason
  });
}

/**
 * Record platform revenue from safety belt fees
 */
async function recordPlatformRevenue(
  matchId: string,
  amount: number,
  timestamp: string
): Promise<void> {
  const monthId = timestamp.substring(0, 7); // "2026-01"

  const revenueRef = db.collection('duel_platform_revenue').doc(monthId);
  const revenueDoc = await revenueRef.get();

  if (revenueDoc.exists) {
    // Update existing month
    await revenueRef.update({
      totalMatches: admin.firestore.FieldValue.increment(1),
      safetyBeltFeesCollected: admin.firestore.FieldValue.increment(amount),
      updatedAt: timestamp
    });
  } else {
    // Create new month record
    await revenueRef.set({
      monthId,
      period: monthId,
      totalMatches: 1,
      safetyBeltFeesCollected: amount,
      matchesWith30s: 0,
      matchesWith45s: 0,
      drawCount: 0,
      cancelledCount: 0,
      safetyBeltUsageRate: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  console.log(`✅ Recorded $${amount} platform revenue for ${monthId}`);
}

/**
 * Submit gameplay event (called by client during match)
 * Records each question answered
 */
export async function submitGameplayEvent(data: {
  matchId: string;
  userId: string;
  questionId: string;
  questionOrder: number;
  answerIndex: number;
  timestamp: string;
  timeElapsed: number;
}): Promise<void> {
  const matchRef = db.collection('duel_matches').doc(data.matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new Error('Match not found');
  }

  const match = matchDoc.data() as MatchDocument;

  // Verify user is participant
  if (data.userId !== match.players.A.userId && data.userId !== match.players.B.userId) {
    throw new Error('User not in this match');
  }

  // Get question to verify answer
  const questionDoc = await db.collection('duel_questions').doc(data.questionId).get();
  if (!questionDoc.exists) {
    throw new Error('Question not found');
  }

  const question = questionDoc.data() as { correctIndex: number };

  // Special case: answerIndex=-1 means user was too slow (lost chance to answer)
  const isTooSlowMarker = data.answerIndex === -1;
  const isCorrect = !isTooSlowMarker && (data.answerIndex === question.correctIndex);

  // Determine which player (A or B)
  const isPlayerA = data.userId === match.players.A.userId;

  // Calculate new scores with unified rule: +1 correct, -2 wrong, 0 for too slow
  const scoreChange = isTooSlowMarker ? 0 : (isCorrect ? 1 : -2);
  const currentScoreA = match.result.scoreA + (isPlayerA ? scoreChange : 0);
  const currentScoreB = match.result.scoreB + (!isPlayerA ? scoreChange : 0);

  // Create gameplay event
  const eventRef = matchRef.collection('gameplay_events').doc();
  const event: GameplayEvent = {
    eventId: eventRef.id,
    questionId: data.questionId,
    questionOrder: data.questionOrder,
    playerId: data.userId,
    answerIndex: data.answerIndex,
    isCorrect,
    timestamp: data.timestamp,
    timeElapsed: data.timeElapsed,
    currentScoreA,
    currentScoreB
  };

  // Prepare answer object for real-time sync
  const answerObj = {
    questionId: data.questionId,
    questionOrder: data.questionOrder,
    answerIndex: data.answerIndex,
    isCorrect,
    timestamp: data.timestamp,
    timeElapsed: data.timeElapsed
  };

  // CRITICAL: Use transaction to ensure answers are stored in correct order
  // arrayUnion does NOT guarantee order - we must use array index assignment!
  await db.runTransaction(async (transaction) => {
    const matchSnapshot = await transaction.get(matchRef);
    if (!matchSnapshot.exists) {
      throw new Error('Match not found during answer submission');
    }

    const matchData = matchSnapshot.data() as any;
    const playerKey = isPlayerA ? 'A' : 'B';
    const currentAnswers = matchData.answers?.[playerKey] || [];

    // Check if this is an AI match (either player is AI bot)
    const playerAIsAI = isAIBot(matchData.players.A.userId);
    const playerBIsAI = isAIBot(matchData.players.B.userId);
    const isAIMatch = playerAIsAI || playerBIsAI;

    // VERIFY: questionOrder validation for anti-cheat
    if (!isAIMatch) {
      // Reject skip-ahead (cheating)
      if (data.questionOrder > currentAnswers.length) {
        console.error(`🔴 SKIP AHEAD! Current ${currentAnswers.length} but got ${data.questionOrder}`);
        throw new Error(`Cannot skip to question ${data.questionOrder}`);
      }

      // Handle late submission (network race condition)
      if (data.questionOrder < currentAnswers.length) {
        console.warn(`⚠️ Late submission: Q${data.questionOrder} already in array (length: ${currentAnswers.length})`);
        console.warn(`⚠️ IMPORTANT: Creating event for scoring, but NOT modifying array (idempotent)`);

        // CRITICAL: Create gameplay_event even for late submissions
        // Backend's calculateScores() needs ALL events to compute correct final score
        transaction.set(eventRef, event);

        // Don't update answers array (already contains this question from faster player)
        // Don't update result.scoreA/B (will be recalculated in finalize from all events)
        console.log(`✅ Late submission: event created, array unchanged`);
        return;  // Exit transaction - event created but array not modified
      }

      // Normal case: questionOrder === currentAnswers.length
      console.log(`✅ PvP answer in-order: Q${data.questionOrder}`);
    } else {
      console.log(`✅ AI match: flexible validation`);
    }

    // Build new answers array with this answer appended
    const newAnswers = [...currentAnswers, answerObj];

    // Write event
    transaction.set(eventRef, event);

    // Update match with new scores AND new answers array
    transaction.update(matchRef, {
      'result.scoreA': currentScoreA,
      'result.scoreB': currentScoreB,
      [`answers.${playerKey}`]: newAnswers  // Replace entire array to guarantee order
    });

    console.log(`✅ Answer appended at index ${data.questionOrder} for player ${playerKey}`);
  });

  // CRITICAL: After transaction, check if BOTH players have answered this question
  // ONLY for human vs human matches (not AI matches)
  const updatedMatch = await matchRef.get();
  if (updatedMatch.exists) {
    const updatedData = updatedMatch.data() as any;

    // Check if this is an AI match
    const playerAIsAI = isAIBot(updatedData.players.A.userId);
    const playerBIsAI = isAIBot(updatedData.players.B.userId);
    const isAIMatch = playerAIsAI || playerBIsAI;

    if (!isAIMatch) {
      // Human vs Human match - sync via RTDB
      const answersA = updatedData.answers?.A || [];
      const answersB = updatedData.answers?.B || [];

      // Check if both players have answered up to and including this questionOrder
      const bothAnsweredThisQuestion =
        (answersA.length > data.questionOrder) &&
        (answersB.length > data.questionOrder);

      console.log(`📊 PvP match - answersA.length=${answersA.length}, answersB.length=${answersB.length}, questionOrder=${data.questionOrder}`);
      console.log(`📊 Both answered Q${data.questionOrder}? ${bothAnsweredThisQuestion}`);

      if (bothAnsweredThisQuestion) {
        console.log(`🔄 Both players answered Q${data.questionOrder}, syncing to Q${data.questionOrder + 1}...`);

        // Update RTDB to trigger both clients to move to next question
        const rtdb = admin.database();
        const rtdbMatchRef = rtdb.ref(`active_matches/${data.matchId}`);

        await rtdbMatchRef.update({
          currentQuestionIndex: data.questionOrder + 1,
          lastUpdated: admin.database.ServerValue.TIMESTAMP
        });

        console.log(`✅ RTDB updated: currentQuestionIndex → ${data.questionOrder + 1}`);
      } else {
        console.log(`⏳ Waiting for other player to answer Q${data.questionOrder}...`);
      }
    } else {
      console.log(`🤖 AI match detected, skipping RTDB sync`);
    }
  }

  console.log(`✅ Recorded answer for ${data.userId} in match ${data.matchId}: ${isCorrect ? 'CORRECT' : 'WRONG'}`);
}

/**
 * Finalize match when time expires
 * Called by client or scheduled cleanup
 */
export async function finalizeMatch(matchId: string): Promise<void> {
  console.log(`🏁 Finalizing match ${matchId}...`);

  const matchRef = db.collection('duel_matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new Error('Match not found');
  }

  const match = matchDoc.data() as MatchDocument;

  if (match.status === 'finished' || match.status === 'cancelled') {
    console.log(`  ℹ️  Match already finalized`);
    return;
  }

  // Update status to in_progress if still ready (gameplay started)
  if (match.status === 'ready') {
    await matchRef.update({ status: 'in_progress' });
  }

  // Settle the match
  await settleMatch(matchId);
}
