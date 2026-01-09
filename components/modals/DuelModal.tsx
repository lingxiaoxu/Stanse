import React, { useState, useEffect, useRef } from 'react';
import { DuelState, DuelConfig, DuelPlayer, DuelMatch, Question } from '../../types';
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
import { Shield, X, AlertTriangle, Trophy, Skull } from 'lucide-react';
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

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setGameState(DuelState.LOBBY);
      setMatch(null);
      matchRef.current = null;
      setError(null);
      // Measure user ping
      measurePing().then(ping => setUserPing(ping));
    }
    return () => clearTimers();
  }, [isOpen]);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
  };

  const handleStartMatchmaking = async () => {
    const validation = validateEntry(userCredits, config);
    if (!validation.valid) {
      setError(validation.error || "Error");
      return;
    }

    setGameState(DuelState.MATCHING);
    setError(null);

    try {
      const opponent = await findOpponent(userStanceType, userPing);

      const selfPlayer: DuelPlayer = {
        id: 'user_self',
        personaLabel: userPersonaLabel,
        stanceType: userStanceType,
        ping: userPing,
        score: 0
      };

      // Pre-match check
      setGameState(DuelState.PRE_MATCH_CHECK);

      const newMatch = await initMatch(selfPlayer, opponent, config);
      setMatch(newMatch);

      // Wait for pre-match visualization
      setTimeout(() => {
        // Validate ping difference
        if (!validatePingDifference(selfPlayer.ping, opponent.ping)) {
          setError(t('duel', 'ping_mismatch'));
          setGameState(DuelState.MATCHING);
          return;
        }

        // Start gameplay
        setGameState(DuelState.GAMEPLAY);
        startGameLoop();
      }, 4000);
    } catch (e) {
      setError(t('duel', 'matchmaking_failed'));
      setGameState(DuelState.LOBBY);
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

  const handleUserAnswer = (index: number) => {
    if (!match || gameState !== DuelState.GAMEPLAY || roundState !== 'ACTIVE') return;

    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);

    setRoundState('USER_ANSWERED');
    const isCorrect = index === match.questions[match.currentQuestionIndex].correctIndex;

    setMatch(prev => {
      if (!prev) return null;
      return {
        ...prev,
        playerA: { ...prev.playerA, score: prev.playerA.score + (isCorrect ? 1 : -1) }
      };
    });

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

  const endGame = () => {
    clearTimers();

    const currentMatch = matchRef.current;
    if (!currentMatch) return;

    let winner: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (currentMatch.playerA.score > currentMatch.playerB.score) winner = 'A';
    if (currentMatch.playerB.score > currentMatch.playerA.score) winner = 'B';

    const finishedMatch = { ...currentMatch, winner, finishedAt: new Date().toISOString() };
    const { netChangeA } = calculateResults(finishedMatch);
    finishedMatch.earnings = netChangeA;

    setMatch(finishedMatch);
    setGameState(DuelState.CASH_ANIMATION);

    // Update credits and show results
    setTimeout(() => {
      onCreditsChange(userCredits + netChangeA);
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
        <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center">
          {match.winner === 'A' ? (
            <div className="text-center w-full px-4 animate-bounce">
              <div className="font-pixel text-[12rem] leading-none text-green-500 drop-shadow-[8px_8px_0_rgba(0,0,0,0.5)]">
                +${Math.abs(match.earnings)}
              </div>
              <div className="text-white font-mono uppercase tracking-[0.5em] text-2xl mt-12">{t('duel', 'victory_reward')}</div>
            </div>
          ) : match.winner === 'B' ? (
            <div className="text-center w-full px-4">
              <div className="font-pixel text-[12rem] leading-none text-red-600 drop-shadow-[8px_8px_0_rgba(0,0,0,0.5)] animate-[ping_1s_ease-in-out_infinite]">
                -${Math.abs(match.earnings)}
              </div>
              <div className="text-white font-mono uppercase tracking-[0.5em] text-2xl mt-16">{t('duel', 'funds_deducted')}</div>
            </div>
          ) : (
            <div className="text-center w-full px-4">
              <div className="font-pixel text-[12rem] leading-none text-gray-500 drop-shadow-[8px_8px_0_rgba(0,0,0,0.5)]">
                $0
              </div>
              <div className="text-white font-mono uppercase tracking-[0.5em] text-2xl mt-12">{t('duel', 'draw_refunded')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
