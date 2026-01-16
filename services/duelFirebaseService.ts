/**
 * DUEL Arena Firebase Service
 *
 * Client-side service to interact with Firestore and Cloud Functions
 * - Fetch questions and sequences
 * - Call matchmaking functions
 * - Submit gameplay events
 * - Track credit balance
 */

import { db, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { Question, UserCredits, FirestoreDuelMatch } from '../types';

// ==================== Credits Management ====================

/**
 * Get user's current credit balance
 * Calls Cloud Function to ensure server-side accuracy
 */
export async function getUserCreditsBalance(userId: string): Promise<UserCredits | null> {
  try {
    const getDuelCredits = httpsCallable(functions, 'getDuelCredits');
    const result = await getDuelCredits();
    const data = result.data as { success: boolean; credits: UserCredits };

    if (data.success) {
      return data.credits;
    }

    return null;
  } catch (error) {
    console.error('Error fetching credits:', error);
    return null;
  }
}

/**
 * Add credits to user's balance (deposit simulation)
 */
export async function addCredits(amount: number): Promise<UserCredits | null> {
  try {
    const addDuelCredits = httpsCallable(functions, 'addDuelCredits');
    const result = await addDuelCredits({ amount });
    const data = result.data as { success: boolean; credits: UserCredits };

    if (data.success) {
      return data.credits;
    }

    return null;
  } catch (error) {
    console.error('Error adding credits:', error);
    throw error;
  }
}

/**
 * Refund credits when match fails/errors
 * Returns updated balance after refund
 */
export async function refundCredits(matchId: string, amount: number): Promise<UserCredits | null> {
  try {
    const refundDuelCredits = httpsCallable(functions, 'refundDuelCredits');
    const result = await refundDuelCredits({ matchId, amount });
    const data = result.data as { success: boolean; credits: UserCredits };

    if (data.success) {
      console.log(`[refundCredits] Refunded ${amount} credits for match ${matchId}`);
      return data.credits;
    }

    return null;
  } catch (error) {
    console.error('Error refunding credits:', error);
    return null;
  }
}

/**
 * Withdraw credits from user's balance
 */
export async function withdrawCredits(amount: number): Promise<UserCredits | null> {
  try {
    const withdrawDuelCredits = httpsCallable(functions, 'withdrawDuelCredits');
    const result = await withdrawDuelCredits({ amount });
    const data = result.data as { success: boolean; credits: UserCredits };

    if (data.success) {
      console.log(`[withdrawCredits] Withdrew ${amount} credits`);
      return data.credits;
    }

    return null;
  } catch (error) {
    console.error('Error withdrawing credits:', error);
    throw error;
  }
}

/**
 * Get user's credit transaction history
 */
export async function getCreditHistory(limit: number = 50) {
  try {
    const getDuelCreditHistory = httpsCallable(functions, 'getDuelCreditHistory');
    const result = await getDuelCreditHistory({ limit });
    const data = result.data as { success: boolean; history: any[] };

    if (data.success) {
      return data.history;
    }

    return [];
  } catch (error) {
    console.error('Error fetching credit history:', error);
    return [];
  }
}

// ==================== Questions and Sequences ====================

/**
 * Fetch a question by ID from Firestore
 */
export async function getQuestion(questionId: string): Promise<Question | null> {
  try {
    const docRef = doc(db, 'duel_questions', questionId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: data.questionId,
        stem: data.stem,
        choices: data.images.map((img: any) => img.url),
        correctIndex: data.correctIndex,
        difficulty: data.difficulty
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching question ${questionId}:`, error);
    return null;
  }
}

/**
 * Fetch a pre-assembled question sequence
 */
export async function getQuestionSequence(sequenceId: string): Promise<Question[]> {
  try {
    const docRef = doc(db, 'duel_sequences', sequenceId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error(`Sequence ${sequenceId} not found`);
    }

    const sequenceData = docSnap.data();
    const questionRefs = sequenceData.questions || [];

    // Fetch all questions in sequence
    const questions = await Promise.all(
      questionRefs.map((ref: { questionId: string }) => getQuestion(ref.questionId))
    );

    return questions.filter((q): q is Question => q !== null);
  } catch (error) {
    console.error(`Error fetching sequence ${sequenceId}:`, error);
    return [];
  }
}

// ==================== Matchmaking ====================

/**
 * Join matchmaking queue
 */
export async function joinMatchmaking(params: {
  stanceType: string;
  personaLabel: string;
  pingMs: number;
  entryFee: number;
  safetyBelt: boolean;
  duration: 30 | 45;
}): Promise<boolean> {
  try {
    const joinDuelQueue = httpsCallable(functions, 'joinDuelQueue');
    const result = await joinDuelQueue(params);
    const data = result.data as { success: boolean };

    return data.success;
  } catch (error) {
    console.error('Error joining matchmaking:', error);
    throw error;
  }
}

/**
 * Leave matchmaking queue
 */
export async function leaveMatchmaking(): Promise<boolean> {
  try {
    const leaveDuelQueue = httpsCallable(functions, 'leaveDuelQueue');
    const result = await leaveDuelQueue({});
    const data = result.data as { success: boolean };

    return data.success;
  } catch (error) {
    console.error('Error leaving matchmaking:', error);
    return false;
  }
}

/**
 * Force matchmaking check - triggers AI opponent creation if waiting > 30s
 */
export async function checkMatchmaking(): Promise<boolean> {
  try {
    const checkDuelMatchmaking = httpsCallable(functions, 'checkDuelMatchmaking');
    const result = await checkDuelMatchmaking({});
    const data = result.data as { success: boolean };

    return data.success;
  } catch (error) {
    console.error('Error checking matchmaking:', error);
    return false;
  }
}

/**
 * Listen for match updates
 * Returns unsubscribe function
 */
export function listenForMatch(
  userId: string,
  onMatch: (match: FirestoreDuelMatch) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  // Listen to duel_matches where user is participant
  // Using only array-contains to simplify query and avoid compound index issues
  // Filter by status client-side to avoid permission issues
  const matchesQuery = query(
    collection(db, 'duel_matches'),
    where('participantIds', 'array-contains', userId)
  );

  // Track the timestamp when listener was created to only process new matches
  const listenerCreatedAt = new Date().toISOString();

  return onSnapshot(
    matchesQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const matchData = change.doc.data() as FirestoreDuelMatch;
          // Filter by status client-side AND only process matches created after listener started
          if ((matchData.status === 'ready' || matchData.status === 'in_progress')
              && matchData.createdAt >= listenerCreatedAt) {
            console.log('[listenForMatch] New match detected:', matchData.matchId);
            onMatch(matchData);
          }
        }
      });
    },
    (error) => {
      console.error('Error listening for matches:', error);
      if (onError) onError(error);
    }
  );
}

// ==================== Gameplay ====================

/**
 * Submit an answer during gameplay
 */
export async function submitAnswer(params: {
  matchId: string;
  questionId: string;
  questionOrder: number;
  answerIndex: number;
  timestamp: string;
  timeElapsed: number;
}): Promise<boolean> {
  try {
    const submitDuelAnswer = httpsCallable(functions, 'submitDuelAnswer');
    const result = await submitDuelAnswer(params);
    const data = result.data as { success: boolean };

    return data.success;
  } catch (error) {
    console.error('Error submitting answer:', error);
    return false;
  }
}

/**
 * Finalize match when time expires
 */
export async function finalizeMatch(matchId: string): Promise<boolean> {
  try {
    const finalizeDuelMatch = httpsCallable(functions, 'finalizeDuelMatch');
    const result = await finalizeDuelMatch({ matchId });
    const data = result.data as { success: boolean };

    return data.success;
  } catch (error) {
    console.error('Error finalizing match:', error);
    return false;
  }
}

/**
 * Listen for match result updates
 */
export function listenForMatchResult(
  matchId: string,
  onResult: (result: FirestoreDuelMatch['result']) => void
): Unsubscribe {
  const matchRef = doc(db, 'duel_matches', matchId);

  return onSnapshot(matchRef, (snapshot) => {
    if (snapshot.exists()) {
      const matchData = snapshot.data() as FirestoreDuelMatch;
      if (matchData.status === 'finished' && matchData.result.winner !== null) {
        onResult(matchData.result);
      }
    }
  });
}

/**
 * Listen for opponent's answers in real-time during match
 * Callback fires whenever opponent submits a new answer
 * Returns unsubscribe function
 *
 * ROBUST IMPLEMENTATION:
 * - Tracks both answer IDs (for deduplication) AND array index (for order verification)
 * - Verifies answer count matches expected progression
 * - Detects and recovers from missed updates
 */
export function listenForOpponentAnswers(
  matchId: string,
  userId: string,
  onOpponentAnswer: (answer: {
    questionId: string;
    questionOrder: number;
    answerIndex: number;
    isCorrect: boolean;
    timestamp: string;
  }) => void
): Unsubscribe {
  const matchRef = doc(db, 'duel_matches', matchId);
  const processedAnswerIds = new Set<string>();
  let lastProcessedIndex = -1; // Track the last array index we processed
  let expectedAnswerCount = 0; // Track expected number of answers

  return onSnapshot(matchRef, (snapshot) => {
    if (snapshot.exists()) {
      const matchData = snapshot.data() as FirestoreDuelMatch;

      // Determine if user is player A or B
      const isPlayerA = matchData.players.A.userId === userId;
      const opponentPlayer = isPlayerA ? 'B' : 'A';

      // Get opponent's answers
      const opponentAnswers = matchData.answers?.[opponentPlayer] || [];

      // OPTIMIZATION: Skip processing if no new answers
      // This avoids redundant processing when user submits their own answer
      if (opponentAnswers.length === lastProcessedIndex + 1) {
        // No new opponent answers, snapshot triggered by our own answer or score update
        return;
      }

      console.log(`[listenForOpponentAnswers] 📊 Snapshot: ${opponentAnswers.length} total, lastIndex=${lastProcessedIndex}, expected=${expectedAnswerCount}, processed=${processedAnswerIds.size}`);

      // VERIFICATION: Check if opponent has answered (any answers exist)
      const opponentHasAnswered = opponentAnswers.length > 0;

      // VERIFICATION: Detect if we missed updates (array grew by more than 1)
      const missedUpdates = opponentAnswers.length > (lastProcessedIndex + 2);
      if (missedUpdates) {
        console.warn(`[listenForOpponentAnswers] ⚠️ MISSED UPDATES DETECTED! Array jumped from ${lastProcessedIndex + 1} to ${opponentAnswers.length}`);
      }

      // VERIFICATION: Check for count mismatch (ID set size vs array index)
      if (processedAnswerIds.size !== lastProcessedIndex + 1 && lastProcessedIndex >= 0) {
        console.warn(`[listenForOpponentAnswers] ⚠️ COUNT MISMATCH! Processed IDs: ${processedAnswerIds.size}, Index: ${lastProcessedIndex + 1}`);
      }

      // Process answers in order from lastProcessedIndex + 1 onwards
      // We trust the array index as source of truth - each position represents one answer
      for (let i = lastProcessedIndex + 1; i < opponentAnswers.length; i++) {
        const answer = opponentAnswers[i];

        // Create unique ID for logging and duplicate detection (but don't skip based on it!)
        const answerId = `${answer.questionId}_${answer.timestamp}`;

        // DIAGNOSTIC: Check if we've seen this exact answer before
        // This helps detect bugs but we DON'T skip - we process based on index
        const isDuplicate = processedAnswerIds.has(answerId);
        if (isDuplicate) {
          console.warn(`[listenForOpponentAnswers] ⚠️ DUPLICATE ID detected at index ${i}: ${answerId}`);
          console.warn(`[listenForOpponentAnswers] ⚠️ This might indicate a bug, but we'll process it anyway based on array position`);
        }

        // VERIFICATION: Check if questionOrder matches array index
        // Firestore writes are sequential: answers.A[0] = Q0, answers.A[1] = Q1, etc.
        if (answer.questionOrder !== i) {
          console.error(`[listenForOpponentAnswers] 🔴 CRITICAL ORDER MISMATCH! Array index ${i} but questionOrder is ${answer.questionOrder}`);
          console.error(`[listenForOpponentAnswers] 🔴 This indicates backend data corruption!`);
        }

        console.log(`[listenForOpponentAnswers] ✅ NEW answer [${i}] Q${answer.questionOrder}:`, answer.isCorrect ? 'CORRECT' : 'WRONG', `(ID: ${answerId}${isDuplicate ? ' - DUPLICATE ID' : ''})`);

        // Mark as processed (for duplicate detection only)
        processedAnswerIds.add(answerId);
        lastProcessedIndex = i;
        expectedAnswerCount++;

        // ALWAYS deliver to callback - we trust the array index
        onOpponentAnswer({
          questionId: answer.questionId,
          questionOrder: answer.questionOrder,
          answerIndex: answer.answerIndex,
          isCorrect: answer.isCorrect,
          timestamp: answer.timestamp
        });
      }

      // VERIFICATION: Final consistency check
      if (processedAnswerIds.size !== opponentAnswers.length && opponentAnswers.length > 0) {
        console.warn(`[listenForOpponentAnswers] 🔴 SYNC WARNING: Processed ${processedAnswerIds.size} IDs but array has ${opponentAnswers.length} items`);
      }

      // Log status
      if (opponentHasAnswered) {
        console.log(`[listenForOpponentAnswers] ✓ Opponent progress: ${processedAnswerIds.size}/${opponentAnswers.length} answers synced`);
      }
    }
  });
}
