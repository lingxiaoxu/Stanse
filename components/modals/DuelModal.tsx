import React, { useState, useEffect, useRef } from 'react';
import { DuelState, DuelConfig, DuelMatch } from '../../types';
import {
  validateEntry,
  calculateResults,
  formatCredits,
  measurePing,
  SAFETY_BELT_COST,
  SAFETY_BELT_THRESHOLD
} from '../../services/duelService';
import {
  joinMatchmaking,
  leaveMatchmaking,
  checkMatchmaking,
  listenForMatch,
  getQuestionSequence,
  submitAnswer,
  finalizeMatch as finalizeMatchFirebase,
  refundCredits,
  listenForOpponentAnswers
} from '../../services/duelFirebaseService';
import { translatePersonaLabel } from '../../services/geminiService';
import { Shield, X, AlertTriangle, Trophy, Skull, Sparkles, Zap, Scale } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { setInDuelQueue } from '../../services/presenceService';
import { addActiveMatch, removeActiveMatch, listenForQuestionIndexSync as listenForQuestionIndexSyncRTDB } from '../../services/matchStateService';

interface DuelModalProps {
  isOpen: boolean;
  onClose: () => void;
  userCredits: number;
  userPersonaLabel: string;
  userStanceType: string;
  userCoordinates?: { economic: number; social: number; diplomatic: number; label?: string; nationalityPrefix?: string };
  onCreditsChange: (newBalance: number) => void;
}

// ==================== Reusable UI Components ====================

const ModalHeader: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div className="flex items-center justify-between p-6 border-b-2 border-black bg-gray-50 shrink-0">
    <h2 className="text-3xl font-pixel uppercase tracking-wide leading-none">{title}</h2>
    <button
      onClick={onClose}
      className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors"
    >
      <X size={24} />
    </button>
  </div>
);

const PixelButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'alert' | 'success' }
> = ({ children, className = '', variant = 'primary', ...props }) => {
  const baseStyle = "font-mono font-bold border-2 border-black px-6 py-3 transition-all active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-black text-white shadow-pixel hover:-translate-y-0.5 hover:shadow-pixel-lg",
    outline: "bg-white text-black shadow-pixel hover:-translate-y-0.5 hover:shadow-pixel-lg",
    alert: "bg-red-600 text-white shadow-pixel hover:-translate-y-0.5 hover:shadow-pixel-lg",
    success: "bg-green-600 text-white shadow-pixel hover:-translate-y-0.5 hover:shadow-pixel-lg"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

// ==================== Main Component ====================

export const DuelModal: React.FC<DuelModalProps> = ({
  isOpen,
  onClose,
  userCredits,
  userPersonaLabel,
  userStanceType,
  userCoordinates,
  onCreditsChange
}) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  // Translated persona label state
  const [translatedPersona, setTranslatedPersona] = useState<string | null>(null);
  const [gameState, setGameState] = useState<DuelState>(DuelState.LOBBY);
  const [config, setConfig] = useState<DuelConfig>({
    entryFee: 10,
    duration: 30,
    safetyBelt: false,
    difficultyStrategy: 'ASCENDING'
  });
  const [match, setMatch] = useState<DuelMatch | null>(null);
  const matchRef = useRef<DuelMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userPing, setUserPing] = useState(30);
  const matchListenerRef = useRef<(() => void) | null>(null);
  const opponentAnswerListenerRef = useRef<(() => void) | null>(null);
  const questionIndexListenerRef = useRef<(() => void) | null>(null); // Sync currentQuestionIndex
  const aiOpponentTimeoutRef = useRef<number | null>(null);
  const matchProcessingRef = useRef<boolean>(false);
  const gameEndingRef = useRef<boolean>(false);
  const isAIOpponentRef = useRef<boolean>(false);

  // Track pending match for refund purposes
  const pendingMatchRef = useRef<{ matchId: string; heldAmount: number } | null>(null);

  // Gameplay state
  const timerRef = useRef<number | null>(null);
  const opponentTimerRef = useRef<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundState, setRoundState] = useState<'ACTIVE' | 'OPPONENT_WON' | 'USER_ANSWERED'>('ACTIVE');
  const matchStartTimeRef = useRef<number>(0);

  // Pre-match countdown state (3, 2, 1 before first question)
  const [preMatchCountdown, setPreMatchCountdown] = useState<number>(3);
  const preMatchCountdownRef = useRef<number | null>(null);

  // Cache for opponent answers - stores ALL answers regardless of current question
  // Key: questionOrder, Value: answer data
  const opponentAnswerCache = useRef<Map<number, { isCorrect: boolean; timestamp: string }>>(new Map());

  // Cache for user's own answers (for timestamp comparison)
  // Key: questionOrder, Value: { isCorrect, timestamp, scoreApplied }
  const userAnswerCache = useRef<Map<number, { isCorrect: boolean; timestamp: string; scoreApplied: number }>>(new Map());

  // Sync match ref
  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  // Debug: Log state changes
  useEffect(() => {
    console.log('[DuelModal] gameState changed to:', gameState);
  }, [gameState]);

  useEffect(() => {
    console.log('[DuelModal] match changed:', match ? match.id : null);
  }, [match]);

  // Translate persona label when language changes - with localStorage caching
  useEffect(() => {
    if (!userCoordinates) {
      setTranslatedPersona(null);
      return;
    }

    const label = userCoordinates.label || userPersonaLabel;
    const cacheKey = `stanse_persona_${label}_${language.toLowerCase()}`;

    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        console.log('[DuelModal] Persona cache hit:', cached);
        setTranslatedPersona(cached);
        return;
      }
    } catch (e) {
      console.warn('[DuelModal] Failed to read persona cache');
    }

    // Cache miss - need to translate
    console.log('[DuelModal] Translating persona to', language);
    translatePersonaLabel(userCoordinates as any, language)
      .then((translated) => {
        setTranslatedPersona(translated);
        // Save to localStorage
        try {
          localStorage.setItem(cacheKey, translated);
        } catch (e) {
          console.warn('[DuelModal] Failed to cache persona translation');
        }
      })
      .catch((err) => {
        console.error('[DuelModal] Persona translation error:', err);
        setTranslatedPersona(null);
      });
  }, [language, userCoordinates, userPersonaLabel]);

  // Reset on open/close - cleanup on close is critical
  useEffect(() => {
    if (isOpen) {
      setGameState(DuelState.LOBBY);
      setMatch(null);
      matchRef.current = null;
      matchProcessingRef.current = false;
      gameEndingRef.current = false;
      pendingMatchRef.current = null;
      setError(null);
      // Reset match state for fresh start
      resetMatchState();
      // Measure user ping
      measurePing().then(ping => setUserPing(ping));
    } else {
      // Modal closed - cleanup all state
      handleModalClose();
    }
  }, [isOpen]);

  const handleModalClose = async () => {
    console.log('[DuelModal] Modal closing, cleaning up state...');

    const currentMatch = matchRef.current;

    // If in queue, leave it IMMEDIATELY (don't wait for async completion)
    if (gameState === DuelState.MATCHING && user) {
      // Immediately clear presence flag (synchronous RTDB update)
      setInDuelQueue(user.uid, false).catch(e => {
        console.error('[DuelModal] Failed to clear queue presence:', e);
      });

      // Also call backend to leave queue
      leaveMatchmaking().catch(e => {
        console.warn('[DuelModal] Failed to leave queue:', e);
      });

      console.log('[DuelModal] Initiated queue cleanup (async)');
    }

    // If in active match, clean up match state
    if ((gameState === DuelState.GAMEPLAY || gameState === DuelState.PRE_MATCH_CHECK) && currentMatch) {
      try {
        const opponentId = currentMatch.isPlayerA ? currentMatch.playerB.id : currentMatch.playerA.id;
        // Only clean up if it's a real match (not AI)
        if (!opponentId.startsWith('ai_bot_') && currentMatch.firestoreMatchId) {
          await removeActiveMatch(currentMatch.firestoreMatchId);
          console.log('[DuelModal] Cleaned up abandoned match');
        }
      } catch (e) {
        console.log('[DuelModal] Failed to cleanup match (might be already removed):', e.message);
      }
    }

    // Clean up all listeners and timers
    if (matchListenerRef.current) {
      matchListenerRef.current();
      matchListenerRef.current = null;
    }
    if (opponentAnswerListenerRef.current) {
      opponentAnswerListenerRef.current();
      opponentAnswerListenerRef.current = null;
    }
    if (questionIndexListenerRef.current) {
      questionIndexListenerRef.current();
      questionIndexListenerRef.current = null;
    }
    // Clear answer caches
    opponentAnswerCache.current.clear();
    userAnswerCache.current.clear();
    clearTimers();

    // Reset match state
    resetMatchState();
  };

  // Cleanup on close - separate effect to avoid re-running on gameState change
  useEffect(() => {
    return () => {
      // Cleanup when modal closes
      if (matchListenerRef.current) {
        matchListenerRef.current();
        matchListenerRef.current = null;
      }
      if (opponentAnswerListenerRef.current) {
        opponentAnswerListenerRef.current();
        opponentAnswerListenerRef.current = null;
      }
      if (questionIndexListenerRef.current) {
        questionIndexListenerRef.current();
        questionIndexListenerRef.current = null;
      }
      if (aiOpponentTimeoutRef.current) {
        clearTimeout(aiOpponentTimeoutRef.current);
        aiOpponentTimeoutRef.current = null;
      }
      // Clear answer caches
      opponentAnswerCache.current.clear();
      userAnswerCache.current.clear();
      clearTimers();
    };
  }, []);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
    if (aiOpponentTimeoutRef.current) clearTimeout(aiOpponentTimeoutRef.current);
    if (preMatchCountdownRef.current) clearInterval(preMatchCountdownRef.current);
  };

  const resetMatchState = () => {
    // Reset all match-related state for fresh start
    setMatch(null);
    gameEndingRef.current = false;
    opponentAnswerCache.current.clear();
    userAnswerCache.current.clear();
    setRoundState('ACTIVE');
    console.log('[DuelModal] 🔄 Match state reset for new game');
  };

  const handleStartMatchmaking = async () => {
    // Reset match state before starting new matchmaking
    resetMatchState();

    // Check authentication first
    if (!user) {
      setError('Please log in to play DUEL Arena');
      return;
    }

    const validation = validateEntry(userCredits, config);
    if (!validation.valid) {
      setError(validation.error || "Error");
      return;
    }

    // Reset match processing state for new game (important for "Play Again")
    matchProcessingRef.current = false;
    gameEndingRef.current = false;
    setMatch(null);
    matchRef.current = null;

    setGameState(DuelState.MATCHING);
    setError(null);

    // Mark user as in queue in presence system
    if (user) {
      setInDuelQueue(user.uid, true).catch(e => console.error('[DuelModal] Failed to set queue status:', e));
    }

    try {
      // Join real matchmaking queue via Cloud Function
      console.log('[DuelModal] Joining matchmaking queue...');
      const joined = await joinMatchmaking({
        stanceType: userStanceType,
        personaLabel: userPersonaLabel,
        pingMs: userPing,
        entryFee: config.entryFee,
        safetyBelt: config.safetyBelt,
        duration: config.duration
      });

      if (!joined) {
        throw new Error('Failed to join matchmaking queue');
      }

      console.log('[DuelModal] Joined queue, listening for match...');

      // Trigger immediate matchmaking check (don't wait for 2s scheduler)
      setTimeout(async () => {
        console.log('[DuelModal] Triggering immediate matchmaking check...');
        try {
          await checkMatchmaking();
        } catch (e) {
          console.warn('[DuelModal] Immediate matchmaking check failed:', e);
        }
      }, 1000); // Check after 1 second

      // Set up AI opponent timeout - trigger matchmaking check after 13 seconds
      // (slightly longer than server's 11s to ensure server-side AI creation happens first)
      aiOpponentTimeoutRef.current = window.setTimeout(async () => {
        console.log('[DuelModal] Triggering AI opponent check after 13s...');
        try {
          await checkMatchmaking();
          console.log('[DuelModal] AI opponent check completed');
        } catch (e) {
          console.error('[DuelModal] AI opponent check failed:', e);
        }
      }, 13000);

      // Listen for match (server will create match when found or after 30s AI timeout)
      matchListenerRef.current = listenForMatch(
        user.uid,
        async (firestoreMatch) => {
          // Prevent duplicate processing
          if (matchProcessingRef.current) {
            console.log('[DuelModal] Match already being processed, skipping...');
            return;
          }
          matchProcessingRef.current = true;

          try {
            console.log('[DuelModal] Match found!', firestoreMatch);

            // Cleanup listener and AI opponent timeout
            if (matchListenerRef.current) {
              matchListenerRef.current();
              matchListenerRef.current = null;
            }
            if (aiOpponentTimeoutRef.current) {
              clearTimeout(aiOpponentTimeoutRef.current);
              aiOpponentTimeoutRef.current = null;
            }

            // Determine if user is player A or B
            const isPlayerA = firestoreMatch.players.A.userId === user.uid;
            const opponentData = isPlayerA ? firestoreMatch.players.B : firestoreMatch.players.A;

            // Check if opponent is AI (AI userId starts with "ai_bot_")
            const isAI = opponentData.userId.startsWith('ai_bot_');
            isAIOpponentRef.current = isAI;
            console.log(`[DuelModal] Opponent is ${isAI ? 'AI' : 'human'}:`, opponentData.userId);

            // Store pending match info for refund in case of error
            const userEntry = isPlayerA ? firestoreMatch.entry.A : firestoreMatch.entry.B;
            const heldAmount = userEntry.fee + (userEntry.safetyBelt ? SAFETY_BELT_COST : 0);
            pendingMatchRef.current = {
              matchId: firestoreMatch.matchId,
              heldAmount
            };
            console.log('[DuelModal] Stored pending match for potential refund:', pendingMatchRef.current);
            const playerAData = firestoreMatch.players.A;
            const playerBData = firestoreMatch.players.B;

            // Fetch questions from the sequence
            console.log('[DuelModal] Fetching questions from sequence:', firestoreMatch.questionSequenceRef);
            const questions = await getQuestionSequence(firestoreMatch.questionSequenceRef);
            console.log('[DuelModal] Questions fetched:', questions.length);

            if (questions.length === 0) {
              throw new Error('No questions found in sequence');
            }

            // Convert to local match format
            const localMatch: DuelMatch = {
              id: firestoreMatch.matchId,
              playerA: {
                id: playerAData.userId,
                personaLabel: playerAData.personaLabel,
                stanceType: playerAData.stanceType,
                ping: playerAData.pingMs,
                score: 0
              },
              playerB: {
                id: playerBData.userId,
                personaLabel: playerBData.personaLabel,
                stanceType: playerBData.stanceType,
                ping: playerBData.pingMs,
                score: 0
              },
              config: {
                entryFee: isPlayerA ? firestoreMatch.entry.A.fee : firestoreMatch.entry.B.fee,
                duration: firestoreMatch.durationSec as 30 | 45,
                safetyBelt: isPlayerA ? firestoreMatch.entry.A.safetyBelt : firestoreMatch.entry.B.safetyBelt,
                difficultyStrategy: 'ASCENDING'
              },
              questions,
              currentQuestionIndex: 0,
              winner: null,
              earnings: 0,
              createdAt: firestoreMatch.createdAt,
              firestoreMatchId: firestoreMatch.matchId,
              isPlayerA
            };

            console.log('[DuelModal] Setting match and transitioning to PRE_MATCH_CHECK');
            setMatch(localMatch);
            setGameState(DuelState.PRE_MATCH_CHECK);

            // Mark user as no longer in queue (match found)
            if (user) {
              setInDuelQueue(user.uid, false).catch(e => console.error('[DuelModal] Failed to clear queue status:', e));
            }

            // Clear pending match ref since game is starting successfully
            pendingMatchRef.current = null;

            // Set up synchronized question index listener IMMEDIATELY (RTDB for real-time sync)
            // This is the master synchronization mechanism - both players follow RTDB
            if (!isAI && firestoreMatch.matchId) {
              console.log('[DuelModal] 🎯 Setting up RTDB currentQuestionIndex sync listener');
              questionIndexListenerRef.current = listenForQuestionIndexSyncRTDB(
                firestoreMatch.matchId,
                (newIndex) => {
                  // Only process if game is still active
                  if (gameEndingRef.current) {
                    console.log(`[DuelModal] ⚠️ Ignoring RTDB sync - game has ended`);
                    return;
                  }

                  console.log(`[DuelModal] 🔄 RTDB sync: Moving to Q${newIndex}`);

                  // Update local match to new question index
                  setMatch((prev) => {
                    if (!prev) return null;
                    if (prev.currentQuestionIndex === newIndex) return prev; // Already there

                    console.log(`[DuelModal] 📍 Synchronized to Q${newIndex} via RTDB`);
                    return {
                      ...prev,
                      currentQuestionIndex: newIndex
                    };
                  });

                  // Start new round for the new question
                  startRound();
                }
              );
            }

            // Set up opponent answer listener IMMEDIATELY (before countdown)
            // This ensures we don't miss any answers submitted during pre-match visualization
            if (!isAI && firestoreMatch.matchId && user) {
              console.log('[DuelModal] Setting up real-time opponent answer listener EARLY (human opponent)');
              opponentAnswerListenerRef.current = listenForOpponentAnswers(
                firestoreMatch.matchId,
                user.uid,
                (answer) => {
                  const currentMatch = matchRef.current;
                  if (!currentMatch) return;

                  // Handle "too slow" markers (answerIndex=-1)
                  // These indicate opponent was slow and submitted completion marker
                  if (answer.answerIndex === -1) {
                    console.log(`[DuelModal] 📥 Received "too slow" marker from opponent for Q${answer.questionOrder}`);
                    console.log(`[DuelModal] ✅ Opponent completed Q${answer.questionOrder} (was slow), waiting for RTDB sync...`);
                    // Don't cache or update scores, but backend will update RTDB
                    // Just acknowledge that opponent finished
                    return;
                  }

                  console.log('[DuelModal] 📥 Opponent REAL answer received: Q' + answer.questionOrder + ':', answer.isCorrect ? 'CORRECT' : 'WRONG');

                  // ALWAYS cache the answer, regardless of current question
                  // This ensures we don't lose answers that arrive early
                  opponentAnswerCache.current.set(answer.questionOrder, {
                    isCorrect: answer.isCorrect,
                    timestamp: answer.timestamp
                  });
                  console.log(`[DuelModal] 💾 Cached opponent answer for Q${answer.questionOrder}. Cache size: ${opponentAnswerCache.current.size}`);

                  // Check if this answer is for the CURRENT question
                  if (answer.questionOrder !== currentMatch.currentQuestionIndex) {
                    console.log(`[DuelModal] ⏭️ Answer for Q${answer.questionOrder} cached (currently on Q${currentMatch.currentQuestionIndex})`);
                    // Don't process now, but it's safely cached for when we reach that question
                    return;
                  }

                  // This answer is for the current question - process it immediately
                  console.log(`[DuelModal] ⚡ Processing answer for current question Q${answer.questionOrder}`);

                  // Update opponent score (opponent was FAST)
                  // Fast player penalty: +1 if correct, -2 if wrong
                  setMatch((prev) => {
                    if (!prev) return null;
                    const isPlayerA = prev.isPlayerA;
                    const scoreChange = answer.isCorrect ? 1 : -2; // PENALTY: -2 for wrong answer when fast

                    if (isPlayerA) {
                      // User is A, opponent is B (opponent was fast)
                      return {
                        ...prev,
                        playerB: { ...prev.playerB, score: prev.playerB.score + scoreChange }
                      };
                    } else {
                      // User is B, opponent is A (opponent was fast)
                      return {
                        ...prev,
                        playerA: { ...prev.playerA, score: prev.playerA.score + scoreChange }
                      };
                    }
                  });

                  // If user is still on this question (ACTIVE = hasn't answered yet)
                  if (roundState === 'ACTIVE') {
                    console.log('[DuelModal] 🐌 User TOO SLOW! Opponent answered first');
                    console.log('[DuelModal] 💥 User loses chance to answer (0 points)');

                    // Cancel user's timer
                    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);

                    // Show TOO SLOW message (disables clicking)
                    setRoundState('OPPONENT_WON');

                    // Slow user gets 0 points (no score change)
                    // Submit a "slow" answer to backend so it knows both players finished
                    const currentMatch = matchRef.current;
                    if (currentMatch && currentMatch.firestoreMatchId && user) {
                      const currentQuestion = currentMatch.questions[currentMatch.currentQuestionIndex];
                      submitAnswer({
                        matchId: currentMatch.firestoreMatchId,
                        questionId: currentQuestion.id,
                        questionOrder: currentMatch.currentQuestionIndex,
                        answerIndex: -1, // Special value: no answer (too slow)
                        timestamp: new Date().toISOString(),
                        timeElapsed: Date.now() - matchStartTimeRef.current
                      }).then(() => {
                        console.log('[DuelModal] ✅ Submitted "too slow" marker to backend');
                      }).catch((err) => {
                        console.error('[DuelModal] Failed to submit slow marker:', err);
                      });
                    }

                    // DON'T call nextQuestion() - wait for RTDB sync from backend
                    console.log('[DuelModal] ⏳ Waiting for RTDB to sync next question...');
                  } else if (roundState === 'USER_ANSWERED') {
                    // User already answered - opponent just finished
                    // CRITICAL: Verify who was actually faster using timestamps!
                    console.log('[DuelModal] 🔍 Both answered, verifying timestamps...');

                    const userAnswer = userAnswerCache.current.get(answer.questionOrder);
                    if (userAnswer) {
                      const userTime = new Date(userAnswer.timestamp).getTime();
                      const opponentTime = new Date(answer.timestamp).getTime();

                      console.log(`[DuelModal] ⏱️ Final timestamp check: User ${userTime} vs Opponent ${opponentTime}`);

                      if (opponentTime < userTime) {
                        // OPPONENT WAS ACTUALLY FASTER! User needs score adjustment
                        console.log('[DuelModal] 🔄 CORRECTION: Opponent was faster, adjusting user score');
                        console.log(`[DuelModal] User score change: ${userAnswer.scoreApplied} → 0 (slow penalty)`);

                        // Revert user's score and apply 0 (slow = no points)
                        setMatch((prev) => {
                          if (!prev) return null;
                          const scoreCorrection = -userAnswer.scoreApplied; // Revert previous score

                          if (prev.isPlayerA) {
                            return {
                              ...prev,
                              playerA: { ...prev.playerA, score: prev.playerA.score + scoreCorrection }
                            };
                          } else {
                            return {
                              ...prev,
                              playerB: { ...prev.playerB, score: prev.playerB.score + scoreCorrection }
                            };
                          }
                        });

                        // Update cache with corrected score
                        userAnswerCache.current.set(answer.questionOrder, {
                          ...userAnswer,
                          scoreApplied: 0
                        });

                        // Show TOO SLOW message briefly
                        setRoundState('OPPONENT_WON');
                        console.log('[DuelModal] ⏳ Correction applied, waiting for RTDB sync...');
                      } else {
                        // User was indeed faster, proceed normally
                        console.log('[DuelModal] ✅ User was faster (confirmed), waiting for RTDB sync...');
                      }
                    } else {
                      // No user answer cached (shouldn't happen)
                      console.warn('[DuelModal] ⚠️ No user answer in cache, waiting for RTDB sync...');
                    }
                  }
                }
              );
            }

            // PRELOAD ALL QUESTIONS IN SEQUENTIAL ORDER
            // This ensures Q0 loads before Q1, Q1 before Q2, etc.
            // Critical for ensuring first questions are ready immediately
            console.log('[DuelModal] 🔄 Preloading question images in sequential order...');

            const totalImages = questions.length * 4;
            console.log(`[DuelModal] 🔄 Total images to preload: ${totalImages} (${questions.length} questions × 4 choices)`);

            // Preload questions sequentially: Q0, then Q1, then Q2, etc.
            (async () => {
              for (let qIndex = 0; qIndex < questions.length; qIndex++) {
                const question = questions[qIndex];
                if (!question) continue;

                // Preload all 4 choices for this question in parallel
                const choicePromises = question.choices.map((imageUrl, choiceIndex) => {
                  return new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                      console.log(`[DuelModal] ✅ Preloaded Q${qIndex} choice ${choiceIndex}`);
                      resolve();
                    };
                    img.onerror = () => {
                      console.warn(`[DuelModal] ⚠️ Failed Q${qIndex} choice ${choiceIndex}`);
                      resolve(); // Continue even if fails
                    };
                    img.src = imageUrl;
                  });
                });

                // Wait for all 4 choices of this question to load before moving to next question
                await Promise.all(choicePromises);
                console.log(`[DuelModal] ✅ Question ${qIndex} fully loaded (4/4 choices)`);
              }

              console.log(`[DuelModal] ✅ All ${totalImages} images preloaded successfully in order`);
            })().catch((err) => {
              console.error('[DuelModal] ⚠️ Error during sequential preloading:', err);
            });

            // Start 3-2-1 countdown before gameplay begins
            // This gives both players time to synchronize and reduces latency-induced desync
            console.log('[DuelModal] Starting 3-second countdown...');
            setPreMatchCountdown(3);

            // Countdown timer: 3 -> 2 -> 1 -> START
            let countdown = 3;
            preMatchCountdownRef.current = window.setInterval(() => {
              countdown--;
              console.log(`[DuelModal] Countdown: ${countdown}`);
              setPreMatchCountdown(countdown);

              if (countdown === 0) {
                // Clear countdown timer
                if (preMatchCountdownRef.current) {
                  clearInterval(preMatchCountdownRef.current);
                  preMatchCountdownRef.current = null;
                }

                // Start gameplay
                console.log('[DuelModal] Countdown complete, starting gameplay!');
                setGameState(DuelState.GAMEPLAY);
                matchStartTimeRef.current = Date.now();

                // Track match in RTDB for monitoring (only on first player to start)
                (async () => {
                  try {
                    await addActiveMatch(
                      firestoreMatch.matchId,
                      firestoreMatch.players.A.userId,
                      firestoreMatch.players.B.userId,
                      firestoreMatch.durationSec
                    );
                  } catch (err: any) {
                    // Might fail if other player already added it - that's ok
                    console.log('[DuelModal] Match already tracked or failed:', err.message);
                  }
                })();

                startGameLoop();
              }
            }, 1000); // Update every second
          } catch (error: any) {
            console.error('[DuelModal] Error processing match:', error);

            // Refund credits if match was created but failed to start
            if (pendingMatchRef.current) {
              console.log('[DuelModal] Attempting to refund credits for failed match...');
              try {
                const refundResult = await refundCredits(
                  pendingMatchRef.current.matchId,
                  pendingMatchRef.current.heldAmount
                );
                if (refundResult) {
                  console.log('[DuelModal] Refund successful, new balance:', refundResult.balance);
                  onCreditsChange(refundResult.balance);
                }
              } catch (refundError) {
                console.error('[DuelModal] Refund failed:', refundError);
              }
              pendingMatchRef.current = null;
            }

            setError(error?.message || 'Failed to start match');
            setGameState(DuelState.LOBBY);
            matchProcessingRef.current = false;
          }
        },
        async (error) => {
          console.error('[DuelModal] Match listener error:', error);

          // Refund credits if there was a pending match
          if (pendingMatchRef.current) {
            console.log('[DuelModal] Attempting to refund credits for listener error...');
            try {
              const refundResult = await refundCredits(
                pendingMatchRef.current.matchId,
                pendingMatchRef.current.heldAmount
              );
              if (refundResult) {
                console.log('[DuelModal] Refund successful, new balance:', refundResult.balance);
                onCreditsChange(refundResult.balance);
              }
            } catch (refundError) {
              console.error('[DuelModal] Refund failed:', refundError);
            }
            pendingMatchRef.current = null;
          }

          setError('Connection error. Please try again.');
          setGameState(DuelState.LOBBY);
          matchProcessingRef.current = false;
        }
      );
    } catch (e: any) {
      console.error('[DuelModal] Matchmaking error:', e);
      setError(e?.message || t('duel', 'matchmaking_failed'));
      setGameState(DuelState.LOBBY);

      // Cleanup listener and AI opponent timeout if exists
      if (matchListenerRef.current) {
        matchListenerRef.current();
        matchListenerRef.current = null;
      }
      if (aiOpponentTimeoutRef.current) {
        clearTimeout(aiOpponentTimeoutRef.current);
        aiOpponentTimeoutRef.current = null;
      }
    }
  };

  const startGameLoop = () => {
    setTimeLeft(config.duration);

    // Note: Real-time opponent answer listener is now set up EARLY in the match found callback
    // (before the 4-second pre-match delay) to avoid missing any answers
    console.log('[DuelModal] startGameLoop - listener already active:', !!opponentAnswerListenerRef.current);

    startRound();

    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Clear interval immediately to prevent multiple endGame calls
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRound = () => {
    // Don't start new rounds if game has ended
    if (gameEndingRef.current) {
      console.log(`[DuelModal] ⚠️ Ignoring startRound - game has ended`);
      return;
    }

    setRoundState('ACTIVE');

    const currentMatch = matchRef.current;
    if (!currentMatch) return;

    // IMPORTANT: Don't check cache when starting a new round
    // If RTDB triggered this startRound(), it means both players finished previous question
    // Cache is only relevant DURING a question, not when entering a new one
    console.log(`[DuelModal] 🆕 Starting fresh round for Q${currentMatch.currentQuestionIndex}`);

    // Only simulate opponent answer if playing against AI
    if (isAIOpponentRef.current) {
      // Simulate AI opponent answer (1-4 seconds)
      const reactionTime = Math.random() * 3000 + 1000;

      if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);

      opponentTimerRef.current = window.setTimeout(() => {
        handleOpponentWin();
      }, reactionTime);
    }
    // For human opponents, answers come from Firestore listener (no local simulation)
  };

  const handleOpponentWin = async () => {
    if (roundState !== 'ACTIVE') return;
    setRoundState('OPPONENT_WON');

    const currentMatch = matchRef.current;
    if (!currentMatch) return;

    // AI opponent has 90% accuracy
    const isCorrect = Math.random() > 0.1;
    const currentQuestion = currentMatch.questions[currentMatch.currentQuestionIndex];

    // Update local AI score (for UI display)
    // Unified scoring: +1 for correct, -2 for wrong
    setMatch(prev => {
      if (!prev) return null;
      return {
        ...prev,
        playerB: { ...prev.playerB, score: prev.playerB.score + (isCorrect ? 1 : -2) }
      };
    });

    // CRITICAL: Submit AI answer to backend for correct final scoring
    // This is ONLY for AI matches - handleOpponentWin is never called in PvP
    if (currentMatch.firestoreMatchId && user) {
      try {
        // Pick answer index: correct one, or random wrong one
        const aiAnswerIndex = isCorrect
          ? currentQuestion.correctIndex
          : (currentQuestion.correctIndex + Math.floor(Math.random() * 3) + 1) % 4;

        await submitAnswer({
          matchId: currentMatch.firestoreMatchId,
          questionId: currentQuestion.id,
          questionOrder: currentMatch.currentQuestionIndex,
          answerIndex: aiAnswerIndex,
          timestamp: new Date().toISOString(),
          timeElapsed: Date.now() - matchStartTimeRef.current,
          aiUserId: currentMatch.playerB.id  // Pass AI's userId for backend to record correctly
        });
        console.log(`[DuelModal] 🤖 AI answer submitted: Q${currentMatch.currentQuestionIndex}, ${isCorrect ? 'CORRECT' : 'WRONG'}`);
      } catch (e) {
        console.error('[DuelModal] Failed to submit AI answer:', e);
      }
    }

    setTimeout(() => {
      nextQuestion();
    }, 1500);
  };

  const handleUserAnswer = async (index: number) => {
    if (!match || !user || gameState !== DuelState.GAMEPLAY) return;

    // Allow answering even if roundState is 'OPPONENT_WON' (for timestamp comparison)
    if (roundState !== 'ACTIVE' && roundState !== 'OPPONENT_WON') return;

    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);

    const currentQuestion = match.questions[match.currentQuestionIndex];
    const isCorrect = index === currentQuestion.correctIndex;
    const userTimestamp = new Date().toISOString();

    // Check if opponent already answered (from cache)
    const opponentAnswer = opponentAnswerCache.current.get(match.currentQuestionIndex);

    let userWasFast = true;
    let userScoreChange = 0;

    if (opponentAnswer) {
      // Compare timestamps to determine who was faster
      const userTime = new Date(userTimestamp).getTime();
      const opponentTime = new Date(opponentAnswer.timestamp).getTime();
      userWasFast = userTime < opponentTime;

      console.log(`[DuelModal] ⏱️ Timestamp comparison: User ${userTime} vs Opponent ${opponentTime}`);
      console.log(`[DuelModal] Result: User was ${userWasFast ? 'FAST' : 'SLOW'}`);
    }

    if (userWasFast || !opponentAnswer) {
      // User answered FIRST (or opponent hasn't answered yet)
      // Fast player: +1 if correct, -2 if WRONG
      userScoreChange = isCorrect ? 1 : -2;
      console.log(`[DuelModal] ⚡ User was FAST: ${isCorrect ? 'CORRECT +1' : 'WRONG -2'}`);
      setRoundState('USER_ANSWERED');
    } else {
      // User answered SECOND (was slow)
      // Slow player: 0 points
      userScoreChange = 0;
      console.log(`[DuelModal] 🐌 User was SLOW: 0 points`);
      setRoundState('OPPONENT_WON'); // Show "TOO SLOW" if not already showing
    }

    // Cache user's answer with timestamp for later verification
    userAnswerCache.current.set(match.currentQuestionIndex, {
      isCorrect,
      timestamp: userTimestamp,
      scoreApplied: userScoreChange
    });

    // Update user score
    setMatch((prev) => {
      if (!prev) return null;

      if (prev.isPlayerA) {
        return {
          ...prev,
          playerA: { ...prev.playerA, score: prev.playerA.score + userScoreChange }
        };
      } else {
        return {
          ...prev,
          playerB: { ...prev.playerB, score: prev.playerB.score + userScoreChange }
        };
      }
    });

    // Submit answer to Firestore via Cloud Function (if real match)
    if (match.firestoreMatchId) {
      try {
        await submitAnswer({
          matchId: match.firestoreMatchId,
          questionId: currentQuestion.id,
          questionOrder: match.currentQuestionIndex,
          answerIndex: index,
          timestamp: userTimestamp,
          timeElapsed: Date.now() - matchStartTimeRef.current
        });
        console.log('[DuelModal] ✅ Answer submitted to Firestore');
      } catch (e) {
        console.error('[DuelModal] Failed to submit answer:', e);
      }
    }

    // Check if opponent has also answered
    const opponentAlsoAnswered = opponentAnswerCache.current.has(match.currentQuestionIndex);

    if (opponentAlsoAnswered || isAIOpponentRef.current) {
      // Both answered - backend will update RTDB currentQuestionIndex
      console.log(`[DuelModal] ✅ Both answered Q${match.currentQuestionIndex}, waiting for RTDB sync...`);
      // DON'T call nextQuestion() - RTDB listener will trigger it
    } else {
      // User answered FIRST - waiting for opponent
      console.log(`[DuelModal] ⏳ User answered first, waiting for opponent on Q${match.currentQuestionIndex}...`);
      // DON'T call nextQuestion() - RTDB listener will trigger it when opponent answers
    }

    // For AI opponent, manually trigger next question (no RTDB sync)
    if (isAIOpponentRef.current) {
      setTimeout(() => {
        nextQuestion();
      }, 500);
    }
  };

  const nextQuestion = () => {
    setMatch(prev => {
      if (!prev) return null;
      const nextIdx = prev.currentQuestionIndex + 1;
      if (nextIdx >= prev.questions.length) {
        return prev; // Stay at last question
      }
      return {
        ...prev,
        currentQuestionIndex: nextIdx
      };
    });
    startRound();
  };

  const endGame = async () => {
    // Prevent duplicate calls
    if (gameEndingRef.current) {
      console.log('[DuelModal] endGame already in progress, skipping...');
      return;
    }
    gameEndingRef.current = true;

    clearTimers();

    // Cleanup all listeners immediately when game ends
    if (opponentAnswerListenerRef.current) {
      opponentAnswerListenerRef.current();
      opponentAnswerListenerRef.current = null;
    }
    if (questionIndexListenerRef.current) {
      questionIndexListenerRef.current();
      questionIndexListenerRef.current = null;
      console.log('[DuelModal] 🔇 Cleaned up RTDB question index listener');
    }

    const currentMatch = matchRef.current;
    if (!currentMatch) return;

    // Show "FINALIZING" state - waiting for backend result
    setGameState(DuelState.FINALIZING);

    // Finalize match in Firestore - backend will calculate authoritative result
    if (currentMatch.firestoreMatchId) {
      try {
        await finalizeMatchFirebase(currentMatch.firestoreMatchId);
        console.log('[DuelModal] Match finalized, waiting for backend result...');

        // Real-time listener for backend result (no polling delay)
        const { doc, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('../../services/firebase');
        const matchDocRef = doc(db, 'duel_matches', currentMatch.firestoreMatchId);

        // Listen for result with 10s timeout (防止内存泄漏)
        const result = await new Promise<any>((resolve, reject) => {
          let resolved = false;

          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              unsubscribe();
              reject(new Error('Backend result timeout after 10s'));
            }
          }, 10000);

          const unsubscribe = onSnapshot(matchDocRef, (snapshot) => {
            if (snapshot.exists() && !resolved) {
              const data = snapshot.data();
              if (data.status === 'finished' && data.result.winner !== null) {
                resolved = true;
                clearTimeout(timeout);
                unsubscribe();
                resolve(data.result);
              }
            }
          }, (error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(error);
            }
          });
        });

        console.log('[DuelModal] Backend result - Winner:', result.winner, 'ScoreA:', result.scoreA, 'ScoreB:', result.scoreB);

        // Determine winner from user's perspective
        // Always show from "User vs Opponent" view
        let winner: 'A' | 'B' | 'DRAW';
        if (result.winner === 'draw') {
          winner = 'DRAW';
        } else if (currentMatch.isPlayerA) {
          // User is A, keep A/B as-is
          winner = result.winner;
        } else {
          // User is B, flip for display (A=user won, B=user lost)
          winner = result.winner === 'B' ? 'A' : 'B';
        }

        // Calculate earnings from backend result
        const { netChangeA } = calculateResults({
          ...currentMatch,
          winner: result.winner, // Use backend winner for calculation
          playerA: { ...currentMatch.playerA, score: result.scoreA },
          playerB: { ...currentMatch.playerB, score: result.scoreB }
        });

        const userEarnings = currentMatch.isPlayerA ? netChangeA : -netChangeA;

        // Update match with backend result
        const finishedMatch = {
          ...currentMatch,
          winner, // Display winner (flipped for player B)
          playerA: { ...currentMatch.playerA, score: result.scoreA },
          playerB: { ...currentMatch.playerB, score: result.scoreB },
          earnings: userEarnings,
          finishedAt: new Date().toISOString()
        };

        setMatch(finishedMatch);

        // Remove from active matches
        try {
          await removeActiveMatch(currentMatch.firestoreMatchId);
        } catch (e) {
          console.log('[DuelModal] Match cleanup:', e.message);
        }

        // Show cash animation then results
        setGameState(DuelState.CASH_ANIMATION);
        setTimeout(() => {
          onCreditsChange(userCredits + userEarnings);
          setGameState(DuelState.RESULTS);
        }, 3000);

      } catch (e) {
        console.error('[DuelModal] Failed to get backend result, using Firestore fallback:', e);

        // FALLBACK: Read Firestore directly (one-time fetch)
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../../services/firebase');
          const matchDoc = await getDoc(doc(db, 'duel_matches', currentMatch.firestoreMatchId));

          if (matchDoc.exists()) {
            const data = matchDoc.data();
            const result = data.result;

            console.log('[DuelModal] Fallback read - ScoreA:', result.scoreA, 'ScoreB:', result.scoreB, 'Winner:', result.winner);

            // Use backend scores even if winner is not set
            let winner: 'A' | 'B' | 'DRAW' = result.winner || 'DRAW';
            if (!result.winner) {
              // Calculate from scores if backend didn't set winner
              if (result.scoreA > result.scoreB) winner = 'A';
              else if (result.scoreB > result.scoreA) winner = 'B';
              else winner = 'DRAW';
            }

            const { netChangeA } = calculateResults({
              ...currentMatch,
              winner,
              playerA: { ...currentMatch.playerA, score: result.scoreA },
              playerB: { ...currentMatch.playerB, score: result.scoreB }
            });

            const userEarnings = currentMatch.isPlayerA ? netChangeA : -netChangeA;

            setMatch({
              ...currentMatch,
              winner: currentMatch.isPlayerA ? winner : (winner === 'A' ? 'B' : winner === 'B' ? 'A' : 'DRAW'),
              playerA: { ...currentMatch.playerA, score: result.scoreA },
              playerB: { ...currentMatch.playerB, score: result.scoreB },
              earnings: userEarnings,
              finishedAt: new Date().toISOString()
            });

            setGameState(DuelState.RESULTS);
            onCreditsChange(userCredits + userEarnings);
          } else {
            throw new Error('Match not found in Firestore');
          }
        } catch (fallbackError) {
          console.error('[DuelModal] Firestore fallback failed, using local scores:', fallbackError);

          // LAST RESORT: Use local synced scores
          const winner = currentMatch.playerA.score > currentMatch.playerB.score ? 'A' :
                        currentMatch.playerB.score > currentMatch.playerA.score ? 'B' : 'DRAW';

          setMatch({ ...currentMatch, winner, finishedAt: new Date().toISOString() });
          setGameState(DuelState.RESULTS);
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-white border-4 border-black w-full max-w-lg shadow-pixel-modal relative flex flex-col max-h-[90vh] overflow-hidden">

        <ModalHeader
          title={gameState === DuelState.LOBBY ? t('duel', 'lobby_title') : t('duel', 'arena_title')}
          onClose={onClose}
        />

        <div className="flex-1 overflow-y-auto bg-gray-100 relative">

          {/* LOBBY */}
          {gameState === DuelState.LOBBY && (
            <div className="p-6 space-y-5">
              {/* Compliance Notice - Unified style */}
              <div className="relative bg-white border-2 border-black p-4 shadow-pixel hover:shadow-pixel-lg transition-all duration-300">
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-full">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                  <span className="font-mono text-[10px] font-bold text-yellow-600 tracking-wider">{t('duel', 'notice')}</span>
                </div>
                <div className="flex gap-3 items-start pr-20">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-600" />
                  <div className="text-xs font-mono leading-tight">
                    <p className="font-bold uppercase mb-1">{t('duel', 'compliance_title')}</p>
                    <p className="text-gray-600">{t('duel', 'compliance_desc')}</p>
                  </div>
                </div>
              </div>

              {/* Stats - Unified PixelCard style */}
              <div className="relative bg-white border-2 border-black shadow-pixel hover:shadow-pixel-lg transition-all duration-300">
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                <div className="flex">
                  <div className="flex-1 p-4 flex flex-col items-center justify-center border-r-2 border-black">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">{t('duel', 'persona')}</span>
                    <span className="font-pixel text-xl leading-none uppercase">{translatedPersona || userPersonaLabel}</span>
                  </div>
                  <div className="flex-1 p-4 flex flex-col items-center justify-center bg-black text-white">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">{t('duel', 'balance')}</span>
                    <span className="font-pixel text-4xl leading-none">{formatCredits(userCredits)}</span>
                  </div>
                </div>
              </div>

              {/* Controls - Unified PixelCard style */}
              <div className="relative bg-white border-2 border-black p-5 shadow-pixel hover:shadow-pixel-lg transition-all duration-300">
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase">{t('duel', 'entry_fee')}</span>
                    <span className="font-pixel text-3xl leading-none">{formatCredits(config.entryFee)}</span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={config.entryFee}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setConfig(prev => ({ ...prev, entryFee: val, safetyBelt: val < SAFETY_BELT_THRESHOLD ? false : prev.safetyBelt }));
                    }}
                    className="w-full"
                  />

                  <div className="flex justify-between text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest">
                    <span>{t('duel', 'low')} ($1)</span>
                    <span>{t('duel', 'high')} ($20)</span>
                  </div>

                  {/* Safety Belt */}
                  {config.entryFee >= SAFETY_BELT_THRESHOLD && (
                    <div
                      onClick={() => setConfig(prev => ({ ...prev, safetyBelt: !prev.safetyBelt }))}
                      className={`cursor-pointer border-2 border-black p-3 flex items-center justify-between transition-all ${
                        config.safetyBelt ? 'bg-yellow-400 text-black' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="w-6 h-6" fill={config.safetyBelt ? "currentColor" : "none"} strokeWidth={2} />
                        <div className="flex flex-col">
                          <span className="font-pixel text-lg uppercase">{t('duel', 'safety_belt')}</span>
                          <span className="text-[10px] font-mono font-bold uppercase">+${SAFETY_BELT_COST} {t('duel', 'fee')}</span>
                        </div>
                      </div>
                      <div className={`w-6 h-6 border-2 border-black ${config.safetyBelt ? 'bg-green-500' : 'bg-transparent'}`}></div>
                    </div>
                  )}

                  {/* Duration */}
                  <div>
                    <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase block mb-2">{t('duel', 'duration')}</span>
                    <div className="grid grid-cols-2 gap-3">
                      {[30, 45].map((sec) => (
                        <button
                          key={sec}
                          onClick={() => setConfig(prev => ({ ...prev, duration: sec as 30 | 45 }))}
                          className={`border-2 border-black py-2 font-pixel text-xl transition-all ${
                            config.duration === sec ? 'bg-black text-white shadow-pixel' : 'bg-white hover:bg-gray-100'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="relative bg-red-600 border-2 border-black text-white p-3 text-center text-sm font-mono font-bold uppercase shadow-pixel">
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-white" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-white" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white" />
                  {error}
                </div>
              )}

              <div className="flex justify-center pt-2">
                <PixelButton
                  onClick={handleStartMatchmaking}
                  className="w-full text-lg font-pixel uppercase tracking-widest"
                  variant="success"
                >
                  {t('duel', 'find_opponent')}
                </PixelButton>
              </div>
            </div>
          )}

          {/* MATCHING */}
          {gameState === DuelState.MATCHING && (
            <div className="p-6 h-full flex items-center justify-center">
              <div className="relative bg-white border-2 border-black p-8 shadow-pixel hover:shadow-pixel-lg transition-all duration-300 w-full">
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-full">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="font-mono text-[10px] font-bold text-green-600 tracking-wider">{t('duel', 'searching')}</span>
                </div>

                <div className="flex flex-col items-center justify-center space-y-8 py-6">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-black bg-black animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center font-pixel text-3xl text-white tracking-widest">
                      VS
                    </div>
                  </div>
                  <div className="text-center space-y-3">
                    <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase">{t('duel', 'scanning')}</span>
                    <div className="font-pixel text-4xl uppercase">{t('duel', 'persona_mismatch')}</div>
                    <div className="text-[10px] font-mono text-center text-gray-500 max-w-xs">
                      {t('duel', 'finding_opponent')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRE_MATCH_CHECK - Enhanced with opponent details */}
          {gameState === DuelState.PRE_MATCH_CHECK && match && (() => {
            // Determine which player is the current user
            const userPlayer = match.isPlayerA ? match.playerA : match.playerB;
            const opponentPlayer = match.isPlayerA ? match.playerB : match.playerA;

            return (
              <div className="p-6 h-full flex items-center justify-center">
                <div className="relative bg-white border-2 border-black p-6 shadow-pixel hover:shadow-pixel-lg transition-all duration-300 w-full">
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                  <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-full">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="font-mono text-[10px] font-bold text-green-600 tracking-wider">{t('duel', 'match_found')}</span>
                  </div>

                  <div className="space-y-5 pt-4">
                    {/* YOU */}
                    <div>
                      <span className="font-mono text-[10px] font-bold tracking-widest text-gray-400 uppercase block text-center mb-2">{t('duel', 'you')}</span>
                      <div className="border-2 border-black p-4 bg-gray-50 shadow-pixel">
                        <div className="font-pixel text-2xl text-center uppercase leading-none">{userPlayer.personaLabel}</div>
                        <div className="text-[10px] font-mono text-center mt-2 uppercase text-gray-500">
                          {userPlayer.stanceType} • {userPlayer.ping}ms
                        </div>
                      </div>
                    </div>

                    {/* VS */}
                    <div className="flex justify-center">
                      <div className="bg-black text-white px-4 py-2">
                        <span className="font-pixel text-3xl">VS</span>
                      </div>
                    </div>

                    {/* OPPONENT */}
                    <div>
                      <span className="font-mono text-[10px] font-bold tracking-widest text-gray-400 uppercase block text-center mb-2">{t('duel', 'opponent')}</span>
                      <div className="border-2 border-black p-4 bg-black text-white shadow-pixel">
                        <div className="font-pixel text-2xl text-center uppercase leading-none">{opponentPlayer.personaLabel}</div>
                        <div className="text-[10px] font-mono text-center mt-2 uppercase text-gray-400">
                          {opponentPlayer.stanceType} • {opponentPlayer.ping}ms
                        </div>
                      </div>
                    </div>

                    {/* Countdown and sync message */}
                    <div className="text-center pt-2">
                      {preMatchCountdown > 0 ? (
                        <>
                          <div className="font-pixel text-7xl animate-pulse">{preMatchCountdown}</div>
                          <p className="text-[10px] font-mono text-gray-500 mt-2 uppercase tracking-wider">{t('duel', 'get_ready')}</p>
                        </>
                      ) : (
                        <>
                          <div className="font-pixel text-5xl text-green-600 animate-bounce">GO!</div>
                          <p className="text-[10px] font-mono text-gray-500 mt-2">{t('duel', 'starting')}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* GAMEPLAY */}
          {gameState === DuelState.GAMEPLAY && match && (() => {
            // Determine which player is the current user
            const userScore = match.isPlayerA ? match.playerA.score : match.playerB.score;
            const opponentScore = match.isPlayerA ? match.playerB.score : match.playerA.score;

            return (
            <div className="flex flex-col h-full relative">
              {/* Too Slow Overlay */}
              {roundState === 'OPPONENT_WON' && (
                <div className="absolute inset-0 z-20 bg-black/80 flex items-center justify-center backdrop-blur-sm">
                  <div className="relative bg-white border-2 border-black p-6 text-center shadow-pixel">
                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                    <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                    <div className="font-pixel text-4xl text-red-600 uppercase leading-none mb-2">{t('duel', 'too_slow')}</div>
                    <p className="font-mono text-xs font-bold text-gray-600">
                      {t('duel', 'opponent_first')}
                    </p>
                    <p className="font-mono text-[10px] text-gray-400 mt-2">
                      {t('duel', 'no_points')}
                    </p>
                  </div>
                </div>
              )}

              {/* Waiting for Opponent Overlay (when user answered first) */}
              {roundState === 'USER_ANSWERED' && (
                <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                  <div className="relative bg-white border-2 border-black p-6 text-center shadow-pixel">
                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                    <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                    <div className="font-pixel text-3xl text-blue-600 uppercase leading-none mb-2">{t('duel', 'waiting')}</div>
                    <p className="font-mono text-xs font-bold text-gray-600">
                      {t('duel', 'waiting_opponent')}
                    </p>
                    <div className="mt-3 flex justify-center">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse mx-1"></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse mx-1" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse mx-1" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* HUD - Unified PixelCard style */}
              <div className="relative bg-white border-b-2 border-black flex justify-between items-stretch h-20 shrink-0">
                <div className="flex-1 flex flex-col justify-center items-center border-r-2 border-black">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">{t('duel', 'you')}</span>
                  <span className="font-pixel text-4xl text-green-600 leading-none">{userScore}</span>
                </div>
                <div className="w-24 bg-black text-white flex flex-col justify-center items-center">
                  <span className="font-mono text-[10px] font-bold uppercase mb-1 text-gray-400">{t('duel', 'sec')}</span>
                  <span className={`font-pixel text-4xl leading-none ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : ''}`}>
                    {timeLeft}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center items-center border-l-2 border-black">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">{t('duel', 'them')}</span>
                  <span className="font-pixel text-4xl text-red-600 leading-none">{opponentScore}</span>
                </div>
              </div>

              {/* Entry Fee Info Bar */}
              <div className="bg-gray-100 border-b-2 border-black px-3 py-1 flex justify-center items-center gap-4">
                <span className="font-mono text-[10px] text-gray-600">
                  {t('duel', 'entry_fee')}: <span className="font-bold text-black">${config.entryFee}</span>
                </span>
                {config.safetyBelt && (
                  <span className="font-mono text-[10px] text-yellow-600 flex items-center gap-1">
                    🛡️ {t('duel', 'safety_belt_active')}
                  </span>
                )}
              </div>

              {/* Question and Choices */}
              <div className="p-4 flex-1 flex flex-col pt-4 overflow-y-auto">
                <div className="relative bg-white border-2 border-black p-4 mb-4 shadow-pixel hover:shadow-pixel-lg transition-all duration-300 min-h-[4rem] flex items-center justify-center text-center">
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                  <p className="font-mono text-base leading-snug uppercase">
                    {match.questions[match.currentQuestionIndex].stem}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 aspect-square max-h-80 mx-auto w-full">
                  {match.questions[match.currentQuestionIndex].choices.map((choice, idx) => (
                    <button
                      key={idx}
                      disabled={roundState !== 'ACTIVE'}
                      onClick={() => handleUserAnswer(idx)}
                      className={`border-2 border-black transition-all relative overflow-hidden ${
                        roundState === 'ACTIVE' ? 'bg-white hover:border-4 hover:border-black active:bg-gray-100' : 'opacity-50 cursor-not-allowed grayscale'
                      }`}
                    >
                      <img src={choice} alt="Option" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            );
          })()}

          {/* FINALIZING - Waiting for backend result */}
          {gameState === DuelState.FINALIZING && (
            <div className="p-6 h-full flex items-center justify-center">
              <div className="relative bg-white border-2 border-black p-8 shadow-pixel w-full text-center">
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />

                <div className="font-pixel text-5xl mb-4 uppercase animate-pulse">{t('duel', 'time_up') || 'TIME UP!'}</div>
                <div className="font-mono text-lg text-gray-600 mb-6">{t('duel', 'calculating') || 'Calculating results...'}</div>

                <div className="flex justify-center gap-4 mt-6">
                  <div className="w-16 h-16 border-4 border-black bg-black animate-spin"></div>
                </div>
              </div>
            </div>
          )}

          {/* RESULTS */}
          {gameState === DuelState.RESULTS && match && (
            <div className="p-6 h-full flex flex-col justify-center items-center space-y-5">
              {/* Main Result Card - Unified PixelCard style */}
              <div className="relative bg-white border-2 border-black p-6 shadow-pixel hover:shadow-pixel-lg transition-all duration-300 w-full">
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-full">
                  <span className={`w-2 h-2 rounded-full ${match.winner === 'A' ? 'bg-green-500' : match.winner === 'B' ? 'bg-red-500' : 'bg-gray-400'}`}></span>
                  <span className="font-mono text-[10px] font-bold tracking-wider">{t('duel', 'result')}</span>
                </div>

                <div className="flex flex-col items-center pt-4">
                  {match.winner === 'A' ? (
                    <>
                      <Trophy size={48} className="text-yellow-500 mb-3" strokeWidth={2} />
                      <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">{t('duel', 'match_result')}</span>
                      <div className="font-pixel text-6xl text-green-600 leading-none uppercase">{t('duel', 'victory')}</div>
                    </>
                  ) : match.winner === 'B' ? (
                    <>
                      <Skull size={48} className="text-gray-700 mb-3" strokeWidth={2} />
                      <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">{t('duel', 'match_result')}</span>
                      <div className="font-pixel text-6xl text-red-600 leading-none uppercase">{t('duel', 'defeat')}</div>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">{t('duel', 'match_result')}</span>
                      <div className="font-pixel text-6xl text-gray-500 leading-none uppercase">{t('duel', 'draw')}</div>
                    </>
                  )}

                  {/* Net Result */}
                  <div className="w-full mt-6 pt-4 border-t-2 border-black">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase">{t('duel', 'net_result')}</span>
                      <span className={`font-pixel text-4xl ${match.earnings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {match.earnings >= 0 ? '+' : ''}{formatCredits(match.earnings)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Safety Belt Notice */}
              {match.winner === 'B' && config.safetyBelt && (
                <div className="relative bg-yellow-400 border-2 border-black p-3 shadow-pixel hover:shadow-pixel-lg transition-all duration-300 w-full">
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-black" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-black" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black" />
                  <div className="flex items-center justify-center gap-2">
                    <Shield size={16} fill="currentColor" />
                    <span className="font-mono text-xs font-bold uppercase">
                      {t('duel', 'safety_saved')}: {formatCredits(Math.floor(config.entryFee / 2))}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 w-full pt-2">
                <PixelButton onClick={handleStartMatchmaking} className="w-full text-lg uppercase">
                  {t('duel', 'rematch')}
                </PixelButton>
                <PixelButton onClick={() => {
                  resetMatchState();
                  setGameState(DuelState.LOBBY);
                }} variant="outline" className="w-full text-lg uppercase">
                  {t('duel', 'back_to_lobby')}
                </PixelButton>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* CASH ANIMATION - FULL SCREEN OVERLAY (outside modal) */}
      {gameState === DuelState.CASH_ANIMATION && match && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden">
          {/* Scanline effect */}
          <div className="duel-scanline" />

          {match.winner === 'A' ? (
            /* ========== VICTORY ANIMATION ========== */
            <div className="relative w-full h-full bg-gradient-to-b from-black via-green-950 to-black flex flex-col items-center justify-center">
              {/* Decorative corner sparkles */}
              <Sparkles className="absolute top-8 left-8 text-yellow-400 duel-spark" size={32} style={{ animationDelay: '0.2s' }} />
              <Sparkles className="absolute top-8 right-8 text-yellow-400 duel-spark" size={32} style={{ animationDelay: '0.4s' }} />
              <Sparkles className="absolute bottom-8 left-8 text-yellow-400 duel-spark" size={32} style={{ animationDelay: '0.6s' }} />
              <Sparkles className="absolute bottom-8 right-8 text-yellow-400 duel-spark" size={32} style={{ animationDelay: '0.8s' }} />

              {/* Trophy icon */}
              <Trophy className="text-yellow-500 mb-4 drop-shadow-[0_0_30px_rgba(255,215,0,0.5)] duel-victory-text" size={80} strokeWidth={1.5} />

              {/* VICTORY text with glitch effect */}
              <div className="font-pixel text-8xl md:text-[10rem] text-yellow-400 uppercase tracking-wider duel-victory-text">
                {t('duel', 'victory')}
              </div>

              {/* Money amount with counter animation */}
              <div className="mt-8 flex flex-col items-center duel-victory-amount">
                <div className="font-pixel text-7xl md:text-[8rem] text-green-400 leading-none drop-shadow-[4px_4px_0_rgba(0,0,0,0.8)]">
                  +${Math.abs(match.earnings)}
                </div>
                <div className="text-green-300 font-mono uppercase tracking-[0.3em] text-lg mt-4 border-t border-green-500/30 pt-4">
                  {t('duel', 'victory_reward')}
                </div>
              </div>

              {/* Decorative lines */}
              <div className="absolute left-0 right-0 top-1/4 h-px bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
              <div className="absolute left-0 right-0 bottom-1/4 h-px bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
            </div>
          ) : match.winner === 'B' ? (
            /* ========== DEFEAT ANIMATION ========== */
            <div className="relative w-full h-full bg-gradient-to-b from-black via-red-950 to-black flex flex-col items-center justify-center">
              {/* Crack overlay effect */}
              <div className="absolute inset-0 duel-crack-overlay">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M50,0 L48,20 L52,25 L47,40 L55,50 L45,60 L53,75 L48,85 L50,100"
                        stroke="rgba(255,0,0,0.3)" strokeWidth="0.5" fill="none" />
                  <path d="M50,50 L30,45 L20,50 L10,48 L0,50"
                        stroke="rgba(255,0,0,0.3)" strokeWidth="0.5" fill="none" />
                  <path d="M50,50 L70,55 L80,50 L90,52 L100,50"
                        stroke="rgba(255,0,0,0.3)" strokeWidth="0.5" fill="none" />
                </svg>
              </div>

              {/* Zap icons for impact */}
              <Zap className="absolute top-1/4 left-1/4 text-red-500/50 rotate-12" size={48} />
              <Zap className="absolute bottom-1/4 right-1/4 text-red-500/50 -rotate-12" size={48} />

              {/* Skull icon */}
              <Skull className="text-red-500 mb-4 drop-shadow-[0_0_20px_rgba(255,0,0,0.5)] duel-defeat-text" size={80} strokeWidth={1.5} />

              {/* DEFEAT text with shake effect */}
              <div className="font-pixel text-8xl md:text-[10rem] text-red-600 uppercase tracking-wider duel-defeat-text">
                {t('duel', 'defeat')}
              </div>

              {/* Money amount with drain animation */}
              <div className="mt-8 flex flex-col items-center duel-defeat-amount">
                <div className="font-pixel text-7xl md:text-[8rem] text-red-500 leading-none drop-shadow-[4px_4px_0_rgba(0,0,0,0.8)]">
                  -${Math.abs(match.earnings)}
                </div>
                <div className="text-red-400 font-mono uppercase tracking-[0.3em] text-lg mt-4 border-t border-red-500/30 pt-4">
                  {t('duel', 'funds_deducted')}
                </div>
              </div>

              {/* Decorative danger stripes */}
              <div className="absolute left-0 right-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,#000,#000_20px,#dc2626_20px,#dc2626_40px)]" />
              <div className="absolute left-0 right-0 bottom-0 h-2 bg-[repeating-linear-gradient(90deg,#000,#000_20px,#dc2626_20px,#dc2626_40px)]" />
            </div>
          ) : (
            /* ========== DRAW ANIMATION ========== */
            <div className="relative w-full h-full bg-gradient-to-b from-black via-gray-900 to-black flex flex-col items-center justify-center">
              {/* Scale icon for balance */}
              <Scale className="text-gray-400 mb-4 duel-draw-text" size={80} strokeWidth={1.5} />

              {/* DRAW text */}
              <div className="font-pixel text-8xl md:text-[10rem] text-gray-400 uppercase tracking-wider duel-draw-text">
                {t('duel', 'draw')}
              </div>

              {/* Refund amount */}
              <div className="mt-8 flex flex-col items-center duel-draw-text" style={{ animationDelay: '0.3s' }}>
                <div className="font-pixel text-6xl md:text-[6rem] text-gray-500 leading-none">
                  $0
                </div>
                <div className="text-gray-500 font-mono uppercase tracking-[0.3em] text-lg mt-4 border-t border-gray-600/30 pt-4">
                  {t('duel', 'draw_refunded')}
                </div>
              </div>

              {/* Decorative balanced lines */}
              <div className="absolute left-1/4 right-1/4 top-1/3 h-px bg-gray-700" />
              <div className="absolute left-1/4 right-1/4 bottom-1/3 h-px bg-gray-700" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
