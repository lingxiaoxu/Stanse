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
  listenForMatch,
  getQuestionSequence,
  submitAnswer,
  finalizeMatch as finalizeMatchFirebase
} from '../../services/duelFirebaseService';
import { Shield, X, AlertTriangle, Trophy, Skull, Sparkles, Zap, Scale } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

interface DuelModalProps {
  isOpen: boolean;
  onClose: () => void;
  userCredits: number;
  userPersonaLabel: string;
  userStanceType: string;
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
  onCreditsChange
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
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

  // Reset on open and cleanup on close
  useEffect(() => {
    if (isOpen) {
      setGameState(DuelState.LOBBY);
      setMatch(null);
      matchRef.current = null;
      setError(null);
      // Measure user ping
      measurePing().then(ping => setUserPing(ping));
    } else {
      // Cleanup when modal closes
      if (matchListenerRef.current) {
        matchListenerRef.current();
        matchListenerRef.current = null;
      }
      // Leave matchmaking queue if still in matching state
      if (user && gameState === DuelState.MATCHING) {
        leaveMatchmaking().catch(console.error);
      }
    }
    return () => clearTimers();
  }, [isOpen, user, gameState]);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
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

      // Listen for match (server will create match when found or after 30s AI timeout)
      matchListenerRef.current = listenForMatch(
        user.uid,
        async (firestoreMatch) => {
          console.log('[DuelModal] Match found!', firestoreMatch);

          // Cleanup listener
          if (matchListenerRef.current) {
            matchListenerRef.current();
            matchListenerRef.current = null;
          }

          // Determine if user is player A or B
          const isPlayerA = firestoreMatch.players.A.userId === user.uid;
          const playerAData = firestoreMatch.players.A;
          const playerBData = firestoreMatch.players.B;

          // Fetch questions from the sequence
          const questions = await getQuestionSequence(firestoreMatch.questionSequenceRef);

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

          setMatch(localMatch);
          setGameState(DuelState.PRE_MATCH_CHECK);

          // Start gameplay after pre-match visualization
          setTimeout(() => {
            setGameState(DuelState.GAMEPLAY);
            matchStartTimeRef.current = Date.now();
            startGameLoop();
          }, 4000);
        },
        (error) => {
          console.error('[DuelModal] Match listener error:', error);
          setError('Connection error. Please try again.');
          setGameState(DuelState.LOBBY);
        }
      );
    } catch (e: any) {
      console.error('[DuelModal] Matchmaking error:', e);
      setError(e?.message || t('duel', 'matchmaking_failed'));
      setGameState(DuelState.LOBBY);

      // Cleanup listener if exists
      if (matchListenerRef.current) {
        matchListenerRef.current();
        matchListenerRef.current = null;
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
            <div className="p-6 space-y-6">
              {/* Compliance Notice */}
              <div className="bg-yellow-50 border-2 border-yellow-400 p-4 flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-600" />
                <div className="text-xs font-mono font-bold leading-tight">
                  <p className="uppercase mb-1">{t('duel', 'compliance_title')}</p>
                  <p className="opacity-80">{t('duel', 'compliance_desc')}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex border-2 border-black bg-white shadow-pixel">
                <div className="flex-1 p-3 border-r-2 border-black">
                  <span className="block text-gray-500 text-[10px] uppercase font-bold tracking-widest">{t('duel', 'persona')}</span>
                  <span className="font-bold text-sm leading-tight block mt-1 uppercase">{userPersonaLabel}</span>
                </div>
                <div className="w-1/3 p-3 text-right bg-black text-white">
                  <span className="block text-gray-400 text-[10px] uppercase font-bold tracking-widest">{t('duel', 'balance')}</span>
                  <span className="font-pixel text-3xl leading-none block mt-1">{formatCredits(userCredits)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="bg-white border-2 border-black p-5 shadow-pixel space-y-4">
                <div className="flex justify-between items-end">
                  <label className="font-bold text-lg uppercase font-pixel">{t('duel', 'entry_fee')}</label>
                  <span className="font-pixel text-3xl bg-black text-white px-2 leading-none">{formatCredits(config.entryFee)}</span>
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

                <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>Low ($1)</span>
                  <span>High ($20)</span>
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
                        <span className="font-pixel text-xl uppercase">{t('duel', 'safety_belt')}</span>
                        <span className="text-[10px] font-bold uppercase">+${SAFETY_BELT_COST} {t('duel', 'fee')}</span>
                      </div>
                    </div>
                    <div className={`w-6 h-6 border-2 border-black ${config.safetyBelt ? 'bg-green-500' : 'bg-transparent'}`}></div>
                  </div>
                )}

                {/* Duration */}
                <div className="grid grid-cols-2 gap-3 pt-2">
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

              {error && (
                <div className="bg-red-600 border-2 border-black text-white p-3 text-center text-sm font-bold uppercase shadow-pixel">
                  {error}
                </div>
              )}

              <div className="flex justify-center mt-4">
                <PixelButton
                  onClick={handleStartMatchmaking}
                  className="w-2/3 text-xl font-pixel uppercase tracking-widest"
                  variant="success"
                >
                  {t('duel', 'find_opponent')}
                </PixelButton>
              </div>
            </div>
          )}

          {/* MATCHING */}
          {gameState === DuelState.MATCHING && (
            <div className="p-10 flex flex-col items-center justify-center space-y-12 h-96">
              <div className="relative">
                <div className="w-24 h-24 bg-black animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center font-pixel text-4xl text-white tracking-widest animate-pulse">
                  VS
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="font-pixel text-2xl uppercase">{t('duel', 'scanning')}</p>
                <div className="inline-block border-2 border-black px-2 py-1 bg-white text-[10px] font-bold uppercase">
                  {t('duel', 'persona_mismatch')}
                </div>
              </div>
            </div>
          )}

          {/* PRE_MATCH_CHECK - Enhanced with opponent details */}
          {gameState === DuelState.PRE_MATCH_CHECK && match && (
            <div className="flex flex-col h-full bg-black text-white">
              <div className="bg-green-500 text-black border-b-2 border-white text-center py-2 font-pixel text-xl uppercase tracking-widest animate-pulse">
                {t('duel', 'match_found')}
              </div>
              <div className="flex-1 p-6 space-y-6 flex flex-col justify-center items-center">
                {/* YOU */}
                <div className="w-full">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 text-center">
                    {t('duel', 'you')}
                  </div>
                  <div className="bg-white text-black border-4 border-white p-4">
                    <div className="font-bold text-xl text-center uppercase">{match.playerA.personaLabel}</div>
                    <div className="text-[10px] text-center mt-1 uppercase text-gray-500">
                      {match.playerA.stanceType} • {match.playerA.ping}ms
                    </div>
                  </div>
                </div>

                <div className="font-pixel text-6xl text-red-600">VS</div>

                {/* OPPONENT - Enhanced details */}
                <div className="w-full">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 text-center">
                    {t('duel', 'opponent')}
                  </div>
                  <div className="bg-gray-800 text-white border-4 border-gray-600 p-4 space-y-2">
                    <div className="font-bold text-xl text-center uppercase">{match.playerB.personaLabel}</div>
                    <div className="text-[10px] text-center uppercase text-gray-400">
                      {match.playerB.stanceType}
                    </div>
                    <div className="text-[10px] text-center uppercase text-green-400">
                      Ping: {match.playerB.ping}ms
                    </div>
                  </div>
                </div>

                {/* Countdown and sync message */}
                <div className="text-center space-y-2">
                  <div className="font-pixel text-4xl text-yellow-400">3</div>
                  <p className="text-xs font-mono text-gray-500 animate-pulse">{t('duel', 'syncing')}</p>
                </div>
              </div>
            </div>
          )}

          {/* GAMEPLAY */}
          {gameState === DuelState.GAMEPLAY && match && (
            <div className="flex flex-col h-full relative">
              {/* Too Slow Overlay */}
              {roundState === 'OPPONENT_WON' && (
                <div className="absolute inset-0 z-20 bg-black/80 flex items-center justify-center backdrop-blur-sm">
                  <div className="bg-red-600 border-4 border-white p-6 text-center transform -rotate-3">
                    <div className="font-pixel text-4xl text-white uppercase leading-none mb-2">{t('duel', 'too_slow')}</div>
                    <p className="font-mono text-xs font-bold text-white bg-black inline-block px-2">
                      {t('duel', 'opponent_first')}
                    </p>
                  </div>
                </div>
              )}

              {/* HUD */}
              <div className="bg-black text-white p-0 border-b-4 border-black flex justify-between items-stretch h-20 shadow-sm shrink-0">
                <div className="flex-1 flex flex-col justify-center items-center border-r-2 border-gray-700">
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{t('duel', 'you')}</span>
                  <span className="font-pixel text-4xl text-green-500 leading-none">{match.playerA.score}</span>
                </div>
                <div className="w-24 bg-white text-black flex flex-col justify-center items-center border-x-4 border-black relative z-10">
                  <span className="text-[10px] font-bold uppercase mb-1">{t('duel', 'sec')}</span>
                  <span className={`font-pixel text-4xl leading-none ${timeLeft <= 5 ? 'text-red-600 animate-pulse' : ''}`}>
                    {timeLeft}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center items-center border-l-2 border-gray-700">
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{t('duel', 'them')}</span>
                  <span className="font-pixel text-4xl text-red-600 leading-none">{match.playerB.score}</span>
                </div>
              </div>

              {/* Question and Choices */}
              <div className="p-4 flex-1 flex flex-col pt-6 overflow-y-auto">
                <div className="bg-white border-2 border-black p-4 mb-6 shadow-pixel min-h-[5rem] flex items-center justify-center text-center">
                  <p className="font-bold text-lg leading-snug font-mono uppercase">
                    {match.questions[match.currentQuestionIndex].stem}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 aspect-square max-h-96 mx-auto w-full">
                  {match.questions[match.currentQuestionIndex].choices.map((choice, idx) => (
                    <button
                      key={idx}
                      disabled={roundState !== 'ACTIVE'}
                      onClick={() => handleUserAnswer(idx)}
                      className={`border-2 border-black transition-all relative overflow-hidden shadow-sm ${
                        roundState === 'ACTIVE' ? 'bg-gray-200 hover:bg-blue-500 active:shadow-none' : 'opacity-50 cursor-not-allowed grayscale'
                      }`}
                    >
                      <img src={choice} alt="Option" className="w-full h-full object-cover mix-blend-multiply" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* RESULTS */}
          {gameState === DuelState.RESULTS && match && (
            <div className="p-6 h-full flex flex-col justify-center items-center space-y-6">
              <div className="text-center bg-white p-8 border-4 border-black shadow-pixel-modal w-full">
                {match.winner === 'A' ? (
                  <>
                    <Trophy size={64} className="mx-auto text-yellow-500 mb-4 drop-shadow-md" strokeWidth={2} />
                    <div className="font-pixel text-7xl text-green-500 leading-none uppercase">{t('duel', 'victory')}</div>
                  </>
                ) : match.winner === 'B' ? (
                  <>
                    <Skull size={64} className="mx-auto text-black mb-4" strokeWidth={2} />
                    <div className="font-pixel text-7xl text-red-600 leading-none uppercase">{t('duel', 'defeat')}</div>
                  </>
                ) : (
                  <div className="font-pixel text-7xl text-gray-500">{t('duel', 'draw')}</div>
                )}

                <div className="mt-6 pt-6 border-t-2 border-black flex justify-between items-center">
                  <span className="text-sm font-bold uppercase tracking-widest">{t('duel', 'net_result')}</span>
                  <span className={`font-pixel text-4xl ${match.earnings >= 0 ? 'text-green-500' : 'text-red-600'}`}>
                    {match.earnings >= 0 ? '+' : ''}{formatCredits(match.earnings)}
                  </span>
                </div>
              </div>

              {match.winner === 'B' && config.safetyBelt && (
                <div className="bg-yellow-400 border-2 border-black p-3 text-xs font-bold uppercase shadow-pixel w-full text-center">
                  {t('duel', 'safety_saved')}: {formatCredits(Math.floor(config.entryFee / 2))}
                </div>
              )}

              <div className="flex flex-col gap-3 w-full pt-4">
                <PixelButton onClick={handleStartMatchmaking} className="w-full text-xl uppercase">
                  {t('duel', 'rematch')}
                </PixelButton>
                <PixelButton onClick={() => setGameState(DuelState.LOBBY)} variant="outline" className="w-full text-xl uppercase">
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
