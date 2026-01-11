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
  refundCredits
} from '../../services/duelFirebaseService';
import { translatePersonaLabel } from '../../services/geminiService';
import { Shield, X, AlertTriangle, Trophy, Skull, Sparkles, Zap, Scale } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

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
  const aiOpponentTimeoutRef = useRef<number | null>(null);
  const matchProcessingRef = useRef<boolean>(false);
  const gameEndingRef = useRef<boolean>(false);

  // Track pending match for refund purposes
  const pendingMatchRef = useRef<{ matchId: string; heldAmount: number } | null>(null);

  // Gameplay state
  const timerRef = useRef<number | null>(null);
  const opponentTimerRef = useRef<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundState, setRoundState] = useState<'ACTIVE' | 'OPPONENT_WON' | 'USER_ANSWERED'>('ACTIVE');
  const matchStartTimeRef = useRef<number>(0);

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

  // Reset on open - only runs when modal opens
  useEffect(() => {
    if (isOpen) {
      setGameState(DuelState.LOBBY);
      setMatch(null);
      matchRef.current = null;
      matchProcessingRef.current = false;
      gameEndingRef.current = false;
      pendingMatchRef.current = null;
      setError(null);
      // Measure user ping
      measurePing().then(ping => setUserPing(ping));
    }
  }, [isOpen]);

  // Cleanup on close - separate effect to avoid re-running on gameState change
  useEffect(() => {
    return () => {
      // Cleanup when modal closes
      if (matchListenerRef.current) {
        matchListenerRef.current();
        matchListenerRef.current = null;
      }
      if (aiOpponentTimeoutRef.current) {
        clearTimeout(aiOpponentTimeoutRef.current);
        aiOpponentTimeoutRef.current = null;
      }
      clearTimers();
    };
  }, []);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
    if (aiOpponentTimeoutRef.current) clearTimeout(aiOpponentTimeoutRef.current);
  };

  const handleStartMatchmaking = async () => {
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

    setGameState(DuelState.MATCHING);
    setError(null);

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

      // Set up AI opponent timeout - trigger matchmaking check after 32 seconds
      // (slightly longer than server's 30s to ensure server-side AI creation happens first)
      aiOpponentTimeoutRef.current = window.setTimeout(async () => {
        console.log('[DuelModal] Triggering AI opponent check after 32s...');
        try {
          await checkMatchmaking();
          console.log('[DuelModal] AI opponent check completed');
        } catch (e) {
          console.error('[DuelModal] AI opponent check failed:', e);
        }
      }, 32000);

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

            // Clear pending match ref since game is starting successfully
            pendingMatchRef.current = null;

            // Start gameplay after pre-match visualization
            setTimeout(() => {
              setGameState(DuelState.GAMEPLAY);
              matchStartTimeRef.current = Date.now();
              startGameLoop();
            }, 4000);
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
    startRound();

    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRound = () => {
    setRoundState('ACTIVE');

    // Simulate opponent answer (1-4 seconds)
    const reactionTime = Math.random() * 3000 + 1000;

    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);

    opponentTimerRef.current = window.setTimeout(() => {
      handleOpponentWin();
    }, reactionTime);
  };

  const handleOpponentWin = () => {
    if (roundState !== 'ACTIVE') return;
    setRoundState('OPPONENT_WON');

    // Opponent has 90% accuracy
    const isCorrect = Math.random() > 0.1;

    setMatch(prev => {
      if (!prev) return null;
      return {
        ...prev,
        playerB: { ...prev.playerB, score: prev.playerB.score + (isCorrect ? 1 : -1) }
      };
    });

    setTimeout(() => {
      nextQuestion();
    }, 1500);
  };

  const handleUserAnswer = async (index: number) => {
    if (!match || !user || gameState !== DuelState.GAMEPLAY || roundState !== 'ACTIVE') return;

    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);

    setRoundState('USER_ANSWERED');
    const currentQuestion = match.questions[match.currentQuestionIndex];
    const isCorrect = index === currentQuestion.correctIndex;

    // Update local score
    setMatch(prev => {
      if (!prev) return null;
      // Update correct player based on isPlayerA
      if (prev.isPlayerA) {
        return {
          ...prev,
          playerA: { ...prev.playerA, score: prev.playerA.score + (isCorrect ? 1 : -1) }
        };
      } else {
        return {
          ...prev,
          playerB: { ...prev.playerB, score: prev.playerB.score + (isCorrect ? 1 : -1) }
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
          timestamp: new Date().toISOString(),
          timeElapsed: Date.now() - matchStartTimeRef.current
        });
        console.log('[DuelModal] Answer submitted to Firestore');
      } catch (e) {
        console.error('[DuelModal] Failed to submit answer:', e);
      }
    }

    setTimeout(() => {
      nextQuestion();
    }, 500);
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

    const currentMatch = matchRef.current;
    if (!currentMatch) return;

    let winner: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (currentMatch.playerA.score > currentMatch.playerB.score) winner = 'A';
    if (currentMatch.playerB.score > currentMatch.playerA.score) winner = 'B';

    const finishedMatch = { ...currentMatch, winner, finishedAt: new Date().toISOString() };
    const { netChangeA } = calculateResults(finishedMatch);

    // Adjust earnings based on whether user is player A or B
    const userEarnings = currentMatch.isPlayerA ? netChangeA : -netChangeA;
    finishedMatch.earnings = userEarnings;

    setMatch(finishedMatch);
    setGameState(DuelState.CASH_ANIMATION);

    // Finalize match in Firestore via Cloud Function
    if (currentMatch.firestoreMatchId) {
      try {
        await finalizeMatchFirebase(currentMatch.firestoreMatchId);
        console.log('[DuelModal] Match finalized in Firestore');
      } catch (e) {
        console.error('[DuelModal] Failed to finalize match:', e);
      }
    }

    // Update credits and show results
    setTimeout(() => {
      onCreditsChange(userCredits + userEarnings);
      setGameState(DuelState.RESULTS);
    }, 3000);
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
                      <div className="font-pixel text-5xl">3</div>
                      <p className="text-[10px] font-mono text-gray-500 mt-2 animate-pulse">{t('duel', 'syncing')}</p>
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
                <PixelButton onClick={() => setGameState(DuelState.LOBBY)} variant="outline" className="w-full text-lg uppercase">
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
