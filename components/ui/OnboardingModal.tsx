import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { PixelButton } from './PixelButton';
import { PixelCard } from './PixelCard';
import {
  OnboardingAnswers,
  UserDemographics,
  PoliticalPreferences,
  WarStance,
  ConflictStance,
  QuestionAnswer,
  CURRENT_WARS,
  CURRENT_CONFLICTS,
  POLITICAL_QUESTIONS
} from '../../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (answers: OnboardingAnswers) => void;
  onClose?: () => void;
}

const COUNTRIES = [
  'United States', 'China', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'South Korea', 'India', 'Brazil',
  'Mexico', 'Russia', 'Italy', 'Spain', 'Netherlands', 'Sweden',
  'Norway', 'Denmark', 'Finland', 'Switzerland', 'Austria', 'Belgium',
  'Poland', 'Ukraine', 'Turkey', 'Israel', 'Saudi Arabia', 'UAE',
  'Singapore', 'Taiwan', 'Hong Kong', 'Indonesia', 'Thailand',
  'Vietnam', 'Philippines', 'Malaysia', 'New Zealand', 'Ireland',
  'Portugal', 'Greece', 'Argentina', 'Chile', 'Colombia', 'South Africa',
  'Egypt', 'Nigeria', 'Kenya', 'Other'
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onComplete,
  onClose
}) => {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Demographics state
  const [birthCountry, setBirthCountry] = useState('');
  const [currentCountry, setCurrentCountry] = useState('');
  const [currentState, setCurrentState] = useState('');
  const [age, setAge] = useState<number | ''>('');

  // Political preferences state
  const [mostHatedInitiative, setMostHatedInitiative] = useState('');
  const [mostSupportedInitiative, setMostSupportedInitiative] = useState('');
  const [warStances, setWarStances] = useState<Record<string, 'SIDE_A' | 'SIDE_B' | 'NEUTRAL'>>({});
  const [conflictStances, setConflictStances] = useState<Record<string, 'SUPPORT' | 'OPPOSE' | 'NEUTRAL'>>({});
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, 'A' | 'B' | 'NEUTRAL'>>({});

  // 6 steps: Demographics, Questions, Initiatives, War stances, Conflict stances, Confirm
  const totalSteps = 6;

  const handleWarStanceChange = (warId: string, stance: 'SIDE_A' | 'SIDE_B' | 'NEUTRAL') => {
    setWarStances(prev => ({ ...prev, [warId]: stance }));
  };

  const handleConflictStanceChange = (conflictId: string, stance: 'SUPPORT' | 'OPPOSE' | 'NEUTRAL') => {
    setConflictStances(prev => ({ ...prev, [conflictId]: stance }));
  };

  const handleQuestionAnswer = (questionId: string, answer: 'A' | 'B' | 'NEUTRAL') => {
    setQuestionAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const canProceed = () => {
    switch (step) {
      case 0: // Demographics
        return birthCountry && currentCountry && currentState && age && Number(age) > 0;
      case 1: // Political Questions
        return POLITICAL_QUESTIONS.every(q => questionAnswers[q.id]);
      case 2: // Initiatives
        return mostHatedInitiative.trim() && mostSupportedInitiative.trim();
      case 3: // War stances
        return CURRENT_WARS.every(war => warStances[war.warId]);
      case 4: // Conflict stances (new step)
        return CURRENT_CONFLICTS.every(conflict => conflictStances[conflict.conflictId]);
      case 5: // Confirm
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const demographics: UserDemographics = {
      birthCountry,
      currentCountry,
      currentState,
      age: Number(age)
    };

    const warStancesList: WarStance[] = CURRENT_WARS.map(war => ({
      ...war,
      stance: warStances[war.warId]
    }));

    const conflictStancesList: ConflictStance[] = CURRENT_CONFLICTS.map(conflict => ({
      conflictId: conflict.conflictId,
      conflictName: conflict.conflictName,
      stance: conflictStances[conflict.conflictId]
    }));

    const questionAnswersList: QuestionAnswer[] = POLITICAL_QUESTIONS.map(q => ({
      questionId: q.id,
      answer: questionAnswers[q.id]
    }));

    const politicalPreferences: PoliticalPreferences = {
      mostHatedInitiative,
      mostSupportedInitiative,
      warStances: warStancesList,
      conflictStances: conflictStancesList,
      questionAnswers: questionAnswersList
    };

    const answers: OnboardingAnswers = {
      demographics,
      politicalPreferences,
      completedAt: new Date().toISOString()
    };

    onComplete(answers);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
      <PixelCard className="w-full max-w-md bg-pixel-white p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-4">
          <div>
            <h2 className="font-pixel text-2xl">CALIBRATION</h2>
            <p className="font-mono text-xs text-gray-500 uppercase">
              Step {step + 1} of {totalSteps}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 border-2 border-transparent hover:border-black"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 border border-black mb-6">
          <div
            className="h-full bg-black transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Step 0: Demographics */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase mb-4">Your Background</h3>

            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">Birth Country</label>
              <select
                value={birthCountry}
                onChange={(e) => setBirthCountry(e.target.value)}
                className="w-full border-2 border-black p-3 font-mono bg-white"
              >
                <option value="">Select country...</option>
                {COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">Current Country</label>
              <select
                value={currentCountry}
                onChange={(e) => {
                  setCurrentCountry(e.target.value);
                  setCurrentState('');
                }}
                className="w-full border-2 border-black p-3 font-mono bg-white"
              >
                <option value="">Select country...</option>
                {COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">
                {currentCountry === 'United States' ? 'State' : 'State / Province'}
              </label>
              {currentCountry === 'United States' ? (
                <select
                  value={currentState}
                  onChange={(e) => setCurrentState(e.target.value)}
                  className="w-full border-2 border-black p-3 font-mono bg-white"
                >
                  <option value="">Select state...</option>
                  {US_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={currentState}
                  onChange={(e) => setCurrentState(e.target.value)}
                  placeholder="Enter state/province..."
                  className="w-full border-2 border-black p-3 font-mono bg-white"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">Age</label>
              <input
                type="number"
                min="13"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : '')}
                placeholder="Enter your age..."
                className="w-full border-2 border-black p-3 font-mono bg-white"
              />
            </div>
          </div>
        )}

        {/* Step 1: Political Questions (5 questions) */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase mb-2">Political Compass</h3>
            <p className="font-mono text-xs text-gray-500 mb-4">
              Answer these questions to calibrate your political position
            </p>

            {POLITICAL_QUESTIONS.map((q, index) => (
              <div key={q.id} className="border-2 border-black p-4 bg-white">
                <p className="font-mono text-sm font-bold mb-3">
                  {index + 1}. {q.question}
                </p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleQuestionAnswer(q.id, 'A')}
                    className={`w-full px-3 py-2 font-mono text-xs border-2 border-black transition-all text-left ${
                      questionAnswers[q.id] === 'A'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {q.optionA}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuestionAnswer(q.id, 'NEUTRAL')}
                    className={`w-full px-3 py-2 font-mono text-xs border-2 border-black transition-all text-left ${
                      questionAnswers[q.id] === 'NEUTRAL'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    Neutral / It depends
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuestionAnswer(q.id, 'B')}
                    className={`w-full px-3 py-2 font-mono text-xs border-2 border-black transition-all text-left ${
                      questionAnswers[q.id] === 'B'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {q.optionB}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Political Initiatives */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase mb-4">Your Political Views</h3>

            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">
                Political Initiative You MOST OPPOSE
              </label>
              <p className="font-mono text-xs text-gray-500 mb-2">
                e.g., "Universal Basic Income", "Border Wall", "Carbon Tax"
              </p>
              <input
                type="text"
                value={mostHatedInitiative}
                onChange={(e) => setMostHatedInitiative(e.target.value)}
                placeholder="Enter initiative you oppose..."
                className="w-full border-2 border-black p-3 font-mono bg-white"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs font-bold block uppercase">
                Political Initiative You MOST SUPPORT
              </label>
              <p className="font-mono text-xs text-gray-500 mb-2">
                e.g., "Medicare for All", "School Choice", "Green New Deal"
              </p>
              <input
                type="text"
                value={mostSupportedInitiative}
                onChange={(e) => setMostSupportedInitiative(e.target.value)}
                placeholder="Enter initiative you support..."
                className="w-full border-2 border-black p-3 font-mono bg-white"
                maxLength={100}
              />
            </div>
          </div>
        )}

        {/* Step 3: War Stances */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase mb-2">Active War Positions</h3>
            <p className="font-mono text-xs text-gray-500 mb-4">
              Select your stance on current armed conflicts
            </p>

            {CURRENT_WARS.map((war) => (
              <div key={war.warId} className="border-2 border-black p-4 bg-white">
                <p className="font-mono text-sm font-bold mb-3">{war.warName}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleWarStanceChange(war.warId, 'SIDE_A')}
                    className={`flex-1 min-w-[80px] px-3 py-2 font-mono text-xs border-2 border-black transition-all ${
                      warStances[war.warId] === 'SIDE_A'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {war.sideAName}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWarStanceChange(war.warId, 'NEUTRAL')}
                    className={`flex-1 min-w-[80px] px-3 py-2 font-mono text-xs border-2 border-black transition-all ${
                      warStances[war.warId] === 'NEUTRAL'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    Neutral
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWarStanceChange(war.warId, 'SIDE_B')}
                    className={`flex-1 min-w-[80px] px-3 py-2 font-mono text-xs border-2 border-black transition-all ${
                      warStances[war.warId] === 'SIDE_B'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {war.sideBName}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 4: Non-War Conflict Stances (NEW) */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase mb-2">Geopolitical Disputes</h3>
            <p className="font-mono text-xs text-gray-500 mb-4">
              Select your stance on non-war geopolitical conflicts
            </p>

            {CURRENT_CONFLICTS.map((conflict) => (
              <div key={conflict.conflictId} className="border-2 border-black p-4 bg-white">
                <p className="font-mono text-sm font-bold mb-2">{conflict.conflictName}</p>
                {conflict.description && (
                  <p className="font-mono text-xs text-gray-500 mb-3">{conflict.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleConflictStanceChange(conflict.conflictId, 'SUPPORT')}
                    className={`flex-1 min-w-[100px] px-3 py-2 font-mono text-xs border-2 border-black transition-all ${
                      conflictStances[conflict.conflictId] === 'SUPPORT'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {conflict.supportLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConflictStanceChange(conflict.conflictId, 'NEUTRAL')}
                    className={`flex-1 min-w-[80px] px-3 py-2 font-mono text-xs border-2 border-black transition-all ${
                      conflictStances[conflict.conflictId] === 'NEUTRAL'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    Neutral
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConflictStanceChange(conflict.conflictId, 'OPPOSE')}
                    className={`flex-1 min-w-[100px] px-3 py-2 font-mono text-xs border-2 border-black transition-all ${
                      conflictStances[conflict.conflictId] === 'OPPOSE'
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {conflict.opposeLabel}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase mb-4">Confirm Your Profile</h3>

            <div className="space-y-3 font-mono text-sm">
              <div className="border-b border-gray-200 pb-2">
                <span className="text-gray-500">Birth:</span> {birthCountry}
              </div>
              <div className="border-b border-gray-200 pb-2">
                <span className="text-gray-500">Location:</span> {currentState}, {currentCountry}
              </div>
              <div className="border-b border-gray-200 pb-2">
                <span className="text-gray-500">Age:</span> {age}
              </div>
              <div className="border-b border-gray-200 pb-2">
                <span className="text-gray-500">Oppose:</span> {mostHatedInitiative}
              </div>
              <div className="border-b border-gray-200 pb-2">
                <span className="text-gray-500">Support:</span> {mostSupportedInitiative}
              </div>
            </div>

            <p className="font-mono text-xs text-gray-500 mt-4 p-3 bg-gray-100 border border-gray-300">
              Your responses will be analyzed by AI to calculate your political fingerprint.
              Data is stored securely and never shared.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t-2 border-black">
          {step > 0 ? (
            <PixelButton
              variant="secondary"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1"
            >
              <ChevronLeft size={16} />
              BACK
            </PixelButton>
          ) : (
            <div />
          )}

          {step < totalSteps - 1 ? (
            <PixelButton
              variant="primary"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-1"
            >
              NEXT
              <ChevronRight size={16} />
            </PixelButton>
          ) : (
            <PixelButton
              variant="primary"
              onClick={handleSubmit}
              disabled={!canProceed()}
              isLoading={isSubmitting}
              className="flex items-center gap-1"
            >
              CALIBRATE
            </PixelButton>
          )}
        </div>
      </PixelCard>
    </div>
  );
};
