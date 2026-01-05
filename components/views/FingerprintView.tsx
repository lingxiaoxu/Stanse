
import React, { useEffect, useState, useRef } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { X } from 'lucide-react';
import { PoliticalCoordinates, OnboardingAnswers } from '../../types';
import { PixelCard } from '../ui/PixelCard';
import { OnboardingModal } from '../ui/OnboardingModal';
import { calculatePersona, translatePersonaLabel } from '../../services/geminiService';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAppState } from '../../contexts/AppStateContext';

interface FingerprintViewProps {
  coords: PoliticalCoordinates;
  isTourActive?: boolean;
}

export const FingerprintView: React.FC<FingerprintViewProps> = ({ coords, isTourActive = false }) => {
  const { hasCompletedOnboarding, completeOnboarding } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [localCoords, setLocalCoords] = useState(coords);
  const [persona, setPersona] = useState<string>(coords.label);
  const [displayCoords, setDisplayCoords] = useState({
    economic: 50,
    social: 50,
    diplomatic: 50
  });
  // Ghost coords for the "echo" effect during calibration
  const [ghostCoords, setGhostCoords] = useState({
    economic: -30,
    social: -30,
    diplomatic: -30
  });

  const { t, language } = useLanguage();
  const startTimeRef = useRef<number>(Date.now());
  const [isAnimating, setIsAnimating] = useState(false);

  // Use global state for persona loading (persists across tab switches)
  const {
    personaLoading,
    personaProgress,
    setPersonaLoading,
    setPersonaProgress,
    personaLoadingAbortController
  } = useAppState();

  // Determine if we're in calibrating state (use isAnimating for better control)
  const isCalibrating = isAnimating;

  // State for coordinate explanation popup
  const [showExplanation, setShowExplanation] = useState<'economic' | 'social' | 'diplomatic' | null>(null);

  // Show onboarding modal if user hasn't completed it
  useEffect(() => {
    if (!hasCompletedOnboarding) {
      setShowOnboarding(true);
    }
  }, [hasCompletedOnboarding]);

  // Handle onboarding completion
  const handleOnboardingComplete = async (answers: OnboardingAnswers) => {
    setShowOnboarding(false);
    setPersona("CALIBRATING...");
    setIsAnimating(true);
    setPersonaLoading(true);
    setPersonaProgress(0);
    startTimeRef.current = Date.now();

    // Create new AbortController for this operation
    const abortController = new AbortController();
    personaLoadingAbortController.current = abortController;

    try {
      // Simulate progress updates during calibration
      const progressInterval = setInterval(() => {
        setPersonaProgress(prev => Math.min(prev + 5, 90));
      }, 500);

      // Start calibration (let it run to completion)
      const calibrationPromise = completeOnboarding(answers, language);

      // Add timeout for user feedback (60 seconds - Gemini can be slow)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Calibration timeout')), 60000)
      );

      let newCoords: PoliticalCoordinates;
      try {
        // Try to get result within timeout
        newCoords = await Promise.race([
          calibrationPromise,
          timeoutPromise
        ]);
      } catch (timeoutError) {
        // Timeout occurred, but let calibration continue in background
        console.log('⏱️ Calibration timeout, continuing in background...');
        clearInterval(progressInterval);
        setPersonaProgress(95);

        // Show timeout message but keep trying
        alert('Calibration is taking longer than expected. Please wait, we are still processing...');

        // Wait for actual calibration to complete (no timeout this time)
        newCoords = await calibrationPromise;
        console.log('✅ Background calibration completed successfully!');
      }

      clearInterval(progressInterval);

      // Check if aborted
      if (abortController.signal.aborted) {
        console.log('Persona calculation was aborted');
        return;
      }

      setPersonaProgress(100);

      // Update all frontend state
      setLocalCoords(newCoords);
      setPersona(newCoords.label);
      setIsAnimating(false);
      setPersonaLoading(false);
      setDisplayCoords({
        economic: newCoords.economic,
        social: newCoords.social,
        diplomatic: newCoords.diplomatic
      });

      console.log('✅ Frontend state updated with calibration results');
    } catch (error: any) {
      if (abortController.signal.aborted) {
        console.log('Persona calculation was aborted during error');
        return;
      }
      console.error('Onboarding error:', error);
      setIsAnimating(false);
      setPersonaLoading(false);
      setPersonaProgress(0);
      // Set default coordinates on error
      const fallbackCoords = {
        economic: 0,
        social: 0,
        diplomatic: 0,
        label: "Error"
      };
      setLocalCoords(fallbackCoords);
      setPersona(fallbackCoords.label);
      setDisplayCoords(fallbackCoords);
      alert(`Calibration failed: ${error.message || 'Please check your internet connection and try again.'}`);
    }
  };

  // Track if persona has been translated for current language
  const [lastTranslatedLang, setLastTranslatedLang] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Mock loading sequence & Persona calculation
  useEffect(() => {
    if (coords.label === "Loading...") {
      setIsAnimating(true);
      startTimeRef.current = Date.now();
      // Ensure animation runs for at least a few seconds for effect
      const minTime = new Promise(resolve => setTimeout(resolve, 3500));
      const fetchPersona = calculatePersona(coords);

      Promise.all([minTime, fetchPersona]).then(([_, result]) => {
        setPersona(result);
        setIsAnimating(false);
      });
    } else {
      setPersona(coords.label);
    }
  }, [coords]);

  // Translate persona label when language changes or on initial load (for existing users)
  // Uses localStorage caching to avoid repeated API calls
  useEffect(() => {
    // Use coords prop (from userProfile) for translation
    const coordsToTranslate = hasCompletedOnboarding ? coords : localCoords;

    // Only translate if:
    // 1. User has completed onboarding
    // 2. Not currently calibrating or translating
    // 3. Language is different from last translated language
    // 4. We have valid coordinates with a label
    if (
      hasCompletedOnboarding &&
      !isAnimating &&
      !isTranslating &&
      language !== lastTranslatedLang &&
      coordsToTranslate.label &&
      coordsToTranslate.label !== "Loading..." &&
      coordsToTranslate.label !== "CALIBRATING..." &&
      coordsToTranslate.label !== "Error" &&
      coordsToTranslate.label !== "Uncalibrated"
    ) {
      const label = coordsToTranslate.label;
      const cacheKey = `stanse_persona_${label}_${language.toLowerCase()}`;

      // Check localStorage cache first
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          console.log(`[FingerprintCache] Cache hit for ${language}:`, cached);
          setPersona(cached);
          setLastTranslatedLang(language);
          return;
        }
      } catch (e) {
        console.warn('[FingerprintCache] Failed to read cache');
      }

      // Cache miss - need to translate
      setIsTranslating(true);
      console.log(`[FingerprintCache] Cache miss, translating to ${language}:`, coordsToTranslate);
      translatePersonaLabel(coordsToTranslate, language)
        .then((translatedLabel) => {
          console.log(`[FingerprintCache] Translation result:`, translatedLabel);
          setPersona(translatedLabel);
          setLastTranslatedLang(language);
          // Save to localStorage
          try {
            localStorage.setItem(cacheKey, translatedLabel);
            console.log(`[FingerprintCache] Translation cached for ${language}`);
          } catch (e) {
            console.warn('[FingerprintCache] Failed to cache translation');
          }
        })
        .catch((error) => {
          console.error('Translation error:', error);
          // Keep original label on error
        })
        .finally(() => {
          setIsTranslating(false);
        });
    }
  }, [language, hasCompletedOnboarding, isAnimating, isTranslating, lastTranslatedLang, coords, localCoords]);

  // Animation Loop - runs when isAnimating is true
  useEffect(() => {
    let animationId: number;

    const animate = () => {
      const time = (Date.now() - startTimeRef.current) / 1000;

      // Each axis has different phase offsets (0, 2π/3, 4π/3) to ensure triangle shape
      // Base value of 30 ensures minimum size, amplitude of 50 for dynamic movement
      // This creates a morphing triangle that never collapses to a line
      const phase1 = 0;
      const phase2 = (Math.PI * 2) / 3;  // 120 degrees offset
      const phase3 = (Math.PI * 4) / 3;  // 240 degrees offset

      setDisplayCoords({
        economic: 30 + Math.sin(time * 1.5 + phase1) * 50 + Math.cos(time * 0.7) * 20,
        social: 30 + Math.sin(time * 1.5 + phase2) * 50 + Math.cos(time * 0.9) * 20,
        diplomatic: 30 + Math.sin(time * 1.5 + phase3) * 50 + Math.cos(time * 1.1) * 20,
      });

      // Ghost layer: Different frequency and phase for "scanning" effect
      setGhostCoords({
        economic: 20 + Math.sin(time * 2.5 + phase1 + 1) * 40,
        social: 20 + Math.sin(time * 2.5 + phase2 + 1) * 40,
        diplomatic: 20 + Math.sin(time * 2.5 + phase3 + 1) * 40,
      });

      animationId = requestAnimationFrame(animate);
    };

    if (isAnimating) {
      animationId = requestAnimationFrame(animate);
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isAnimating]);

  // Update display coords when not animating
  useEffect(() => {
    if (!isAnimating && !isCalibrating) {
      setDisplayCoords({
        economic: localCoords.economic,
        social: localCoords.social,
        diplomatic: localCoords.diplomatic
      });
    }
  }, [isAnimating, isCalibrating, localCoords]);

  // Transform data for Recharts
  // Use unique invisible characters during calibration to keep 3 distinct data points
  // (Empty strings would cause Recharts to merge points with same key)
  const data = [
    {
        subject: isCalibrating ? ' ' : t('fingerprint', 'econ'),  // Single space
        A: displayCoords.economic + 100,
        B: isCalibrating ? ghostCoords.economic + 100 : 0, // Ghost data
        fullMark: 200
    },
    {
        subject: isCalibrating ? '  ' : t('fingerprint', 'soc'),  // Two spaces
        A: displayCoords.social + 100,
        B: isCalibrating ? ghostCoords.social + 100 : 0,
        fullMark: 200
    },
    {
        subject: isCalibrating ? '   ' : t('fingerprint', 'diplo'),  // Three spaces
        A: displayCoords.diplomatic + 100,
        B: isCalibrating ? ghostCoords.diplomatic + 100 : 0,
        fullMark: 200
    },
  ];

  // Use localCoords (from onboarding) or props coords
  const activeCoords = hasCompletedOnboarding ? localCoords : coords;

  // Coordinate explanations - now using i18n
  const getExplanation = (axis: 'economic' | 'social' | 'diplomatic', value: number) => {
    if (axis === 'economic') {
      return value > 0
        ? t('fingerprint', 'explain_econ_right')
        : t('fingerprint', 'explain_econ_left');
    }
    if (axis === 'social') {
      return value > 0
        ? t('fingerprint', 'explain_soc_lib')
        : t('fingerprint', 'explain_soc_auth');
    }
    // diplomatic
    return value > 0
      ? t('fingerprint', 'explain_diplo_global')
      : t('fingerprint', 'explain_diplo_nat');
  };

  return (
    <>
      {/* Coordinate Explanation Popup */}
      {showExplanation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowExplanation(null)}>
          <div className="bg-white border-4 border-black shadow-pixel max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-mono font-bold uppercase text-sm">
                {showExplanation === 'economic' && t('fingerprint', 'axis_econ')}
                {showExplanation === 'social' && t('fingerprint', 'axis_soc')}
                {showExplanation === 'diplomatic' && t('fingerprint', 'axis_diplo')}
              </h3>
              <button onClick={() => setShowExplanation(null)} className="hover:bg-gray-100 p-1 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="bg-gray-50 p-2.5 border-2 border-black">
                <div className="font-bold text-green-600 mb-1">
                  {showExplanation === 'economic' && (activeCoords.economic > 0 ? `→ ${t('fingerprint', 'label_right')}` : `← ${t('fingerprint', 'label_left')}`)}
                  {showExplanation === 'social' && (activeCoords.social > 0 ? `← ${t('fingerprint', 'label_liberal')}` : `→ ${t('fingerprint', 'label_conservative')}`)}
                  {showExplanation === 'diplomatic' && (activeCoords.diplomatic > 0 ? `← ${t('fingerprint', 'label_globalist')}` : `→ ${t('fingerprint', 'label_nationalist')}`)}
                </div>
                <p className="text-gray-700 leading-tight">
                  {getExplanation(showExplanation, activeCoords[showExplanation])}
                </p>
              </div>
              <div className="text-[10px] text-gray-500 text-center pt-1">
                {t('fingerprint', 'explain_close')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onClose={() => setShowOnboarding(false)}
        isTourActive={isTourActive}
      />

      <div className="space-y-6 w-full max-w-md mx-auto pb-20">
        <div className="text-center mb-10">
          <h2 className="font-pixel text-5xl">{t('fingerprint', 'title')}</h2>
          <p className="font-mono text-xs text-gray-400 uppercase">
              {isCalibrating ? t('fingerprint', 'loading') : t('fingerprint', 'subtitle')}
          </p>
        </div>

        <PixelCard className="flex flex-col items-center p-4 bg-white relative overflow-hidden">
          {/* Background Grid Effect for "Tech" feel */}
          <div className="absolute inset-0 opacity-5 pointer-events-none"
               style={{backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '10px 10px'}}>
          </div>

          <div className="w-full h-[350px] font-mono text-xs relative z-10">
            <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
              {/* Dynamic outerRadius: smaller when labels shown to prevent clipping */}
              <RadarChart cx="50%" cy="50%" outerRadius={isCalibrating ? "75%" : "55%"} data={data}>
                <PolarGrid stroke="#e5e5e5" strokeDasharray="4 4" />
                <PolarAngleAxis dataKey="subject" tick={{fill: '#111', fontSize: 10, fontFamily: '"Space Mono", "DotGothic16", monospace', fontWeight: 'bold'}} />
                <PolarRadiusAxis angle={30} domain={[0, 200]} tick={false} axisLine={false} />

                {/* Ghost Radar - The "Glitch" / Scan effect */}
                {isCalibrating && (
                  <Radar
                      name="Ghost"
                      dataKey="B"
                      stroke="#888"
                      strokeWidth={1}
                      fill="transparent"
                      strokeDasharray="4 4"
                      isAnimationActive={false}
                  />
                )}

                {/* Main Radar */}
                <Radar
                  name="User"
                  dataKey="A"
                  stroke={isCalibrating ? "#111" : "#000"}
                  strokeWidth={isCalibrating ? 2 : 3}
                  fill={isCalibrating ? "#111" : "#000"}
                  fillOpacity={isCalibrating ? 0.1 : 0.25}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="w-full text-center border-t-2 border-black pt-6 mt-2 relative">
            <span className="block text-[10px] font-mono tracking-widest text-gray-400 mb-2 uppercase">
              {isCalibrating ? t('fingerprint', 'analyzing') : t('fingerprint', 'identified')}
            </span>

            {/* Typography unified: Clean, professional, no extra symbols */}
            <h3 className={`font-pixel text-3xl promax:text-4xl uppercase tracking-wide leading-none transition-all duration-500 ${isCalibrating || isTranslating ? 'opacity-50 animate-pulse' : 'opacity-100'}`}>
              {isCalibrating ? (
                  t('fingerprint', 'computing')
              ) : persona}
            </h3>

            {/* Progress percentage */}
            {personaLoading && personaProgress > 0 && personaProgress < 100 && (
              <p className="font-mono text-xs text-gray-500 mt-2">
                {personaProgress}%
              </p>
            )}
          </div>
        </PixelCard>

        <div className="grid grid-cols-3 gap-3 text-center font-mono text-xs" data-tour-id="coordinates-chart">
          <div
            className="border-2 border-black p-3 bg-white shadow-pixel hover:-translate-y-1 transition-transform cursor-pointer"
            onClick={() => setShowExplanation('economic')}
          >
            <div className="font-bold mb-1 text-gray-400">{t('fingerprint', 'econ')}</div>
            <div className="text-base font-bold uppercase">
               {isCalibrating ? <span className="animate-pulse">--</span> : (activeCoords.economic > 0 ? t('fingerprint', 'right') : t('fingerprint', 'left'))}
            </div>
          </div>
          <div
            className="border-2 border-black p-3 bg-white shadow-pixel hover:-translate-y-1 transition-transform cursor-pointer"
            onClick={() => setShowExplanation('social')}
          >
            <div className="font-bold mb-1 text-gray-400">{t('fingerprint', 'soc')}</div>
            <div className="text-base font-bold uppercase">
              {isCalibrating ? <span className="animate-pulse">--</span> : (activeCoords.social > 0 ? t('fingerprint', 'lib') : t('fingerprint', 'auth'))}
            </div>
          </div>
          <div
            className="border-2 border-black p-3 bg-white shadow-pixel hover:-translate-y-1 transition-transform cursor-pointer"
            onClick={() => setShowExplanation('diplomatic')}
          >
            <div className="font-bold mb-1 text-gray-400">{t('fingerprint', 'diplo')}</div>
            <div className="text-base font-bold uppercase">
              {isCalibrating ? <span className="animate-pulse">--</span> : (activeCoords.diplomatic > 0 ? t('fingerprint', 'global') : t('fingerprint', 'nat'))}
            </div>
          </div>
        </div>

        {/* RESET STANCE Button */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setShowOnboarding(true)}
            className="border-2 border-black px-6 py-3 bg-white hover:bg-black hover:text-white transition-all shadow-pixel hover:shadow-none active:translate-y-1 flex items-center gap-3 max-w-[60%]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <div className="text-left">
              <div className="font-mono font-bold text-sm">{t('fingerprint', 'reset_stance')}</div>
              <div className="font-mono text-[10px] opacity-60">{t('fingerprint', 'reset_desc')}</div>
            </div>
          </button>
        </div>

        <div className="text-center py-6 opacity-60">
          <p className="font-pixel text-xl">"{t('slogan')}"</p>
        </div>
      </div>
    </>
  );
};
