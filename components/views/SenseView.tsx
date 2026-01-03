
import React, { useState } from 'react';
import { Search, ShieldAlert, CheckCircle, FileText, ExternalLink, Users, Newspaper, Twitter, Activity, X, ThumbsUp, ThumbsDown, AlertTriangle, DollarSign } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { analyzeBrandAlignment, UserDemographicsForAnalysis } from '../../services/geminiService';
import { queryCompanyFECData, FECCompanyData, FECPartyData, formatPartyName, getPartyColor } from '../../services/fecService';
import { PoliticalCoordinates, BrandAlignment, ViewState } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface SenseViewProps {
  userProfile: PoliticalCoordinates;
  userDemographics?: UserDemographicsForAnalysis;
  onNavigate: (view: ViewState) => void;
  onRecalibrate?: (entityName: string, stance: 'SUPPORT' | 'OPPOSE', reason?: string) => Promise<void>;
  // Lifted state for persistence across tab switches
  persistedResult?: BrandAlignment | null;
  onResultChange?: (result: BrandAlignment | null) => void;
  persistedQuery?: string;
  onQueryChange?: (query: string) => void;
  persistedFecData?: FECCompanyData | null;
  onFecDataChange?: (data: FECCompanyData | null) => void;
}

// Helper function to format FEC election cycles (e.g., 2024 → 2023-2024)
const formatElectionCycle = (year: number): string => {
  return `${year - 1}-${year}`;
};

export const SenseView: React.FC<SenseViewProps> = ({
  userProfile,
  userDemographics,
  onNavigate,
  onRecalibrate,
  persistedResult,
  onResultChange,
  persistedQuery,
  onQueryChange,
  persistedFecData,
  onFecDataChange
}) => {
  // Use persisted state if available, otherwise fall back to local state
  const [localQuery, setLocalQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [localResult, setLocalResult] = useState<BrandAlignment | null>(null);
  const [localFecData, setLocalFecData] = useState<FECCompanyData | null>(null);
  const { t } = useLanguage();

  // Use persisted values if provided
  const query = persistedQuery !== undefined ? persistedQuery : localQuery;
  const setQuery = onQueryChange || setLocalQuery;
  const result = persistedResult !== undefined ? persistedResult : localResult;
  const setResult = onResultChange || setLocalResult;
  const fecData = persistedFecData !== undefined ? persistedFecData : localFecData;
  const setFecData = onFecDataChange || setLocalFecData;

  // Recalibrate modal state
  const [showRecalModal, setShowRecalModal] = useState(false);
  const [recalStance, setRecalStance] = useState<'SUPPORT' | 'OPPOSE' | null>(null);
  const [recalReason, setRecalReason] = useState('');
  const [recalSubmitting, setRecalSubmitting] = useState(false);

  const handleScan = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setFecData(null);
    try {
      // Query both Gemini and FEC data in parallel
      const [brandData, fecResult] = await Promise.all([
        analyzeBrandAlignment(query, userProfile, userDemographics),
        queryCompanyFECData(query)
      ]);
      setResult(brandData);
      setFecData(fecResult);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col space-y-8 max-w-lg promax:max-w-xl mx-auto w-full">
      <div className="text-center mb-10">
        <h2 className="font-pixel text-5xl">{t('sense', 'title')}</h2>
        <p className="font-mono text-xs text-gray-400">
          {t('sense', 'subtitle')}
        </p>
      </div>

      {/* Search Input */}
      <PixelCard className="p-6">
        <div className="flex flex-col gap-4">
          <label className="font-mono text-xs font-bold uppercase tracking-wide flex items-center gap-2">
             <Search size={14} />
             {t('sense', 'searchLabel')}
          </label>
          <div className="flex gap-2 h-12">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('sense', 'placeholder')}
              className="flex-1 border-2 border-pixel-black p-3 font-mono text-lg focus:outline-none focus:bg-gray-50 placeholder:text-gray-300 uppercase"
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            />
            <PixelButton onClick={handleScan} disabled={loading} className="px-6 bg-black text-white">
              {t('sense', 'run')}
            </PixelButton>
          </div>
        </div>
      </PixelCard>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4 opacity-50">
          <div className="animate-spin w-8 h-8 border-4 border-black border-t-transparent rounded-full"></div>
          <div className="font-pixel text-2xl animate-pulse">{t('sense', 'loading')}</div>
        </div>
      )}

      {result && (
        <div className="animate-fade-in">
          {/* INTELLIGENCE REPORT CARD */}
          <div className="relative border-4 border-black bg-white p-0 shadow-pixel-lg">
            
            {/* Header / File Tab */}
            <div className="bg-black text-white p-4 flex justify-between items-start">
                <div>
                    <div className="font-mono text-[10px] opacity-60 tracking-widest mb-1">{t('sense', 'report')}</div>
                    <h3 className="font-pixel text-3xl uppercase leading-none">{result.brandName}</h3>
                </div>
                <div className="text-right">
                     <div className="font-pixel text-4xl leading-none">{result.score}/100</div>
                     <div className="font-mono text-[10px] uppercase">{result.status}</div>
                </div>
            </div>

            <div className="p-6 space-y-6">
                
                {/* Executive Summary */}
                <div className="font-mono text-sm leading-relaxed border-l-4 border-black pl-4 py-1">
                    <strong className="block text-xs uppercase mb-1 opacity-50">{t('sense', 'summary')}</strong>
                    {result.reportSummary}
                </div>

                {/* Social Signal / Twitter Analysis */}
                <div className="bg-gray-50 p-4 border border-black border-dashed relative">
                    <div className="absolute -top-3 left-3 bg-white px-2 font-mono text-[10px] font-bold flex items-center gap-1 border border-black">
                        <Twitter size={10} />
                        {t('sense', 'socialWire')}
                    </div>
                    <p className="font-mono text-xs italic">
                        "{result.socialSignal}"
                    </p>
                </div>

                {/* Alignment Grid */}
                <div className="grid grid-cols-1 gap-6 pt-2">
                    
                    {/* Conflicts */}
                    <div>
                        <div className="flex items-center gap-2 mb-2 text-red-600">
                            <ShieldAlert size={14} />
                            <span className="font-bold font-mono text-xs uppercase tracking-wider">{t('sense', 'friction')}</span>
                        </div>
                        <ul className="list-none space-y-2">
                            {result.keyConflicts.length > 0 ? result.keyConflicts.map((point, i) => (
                                <li key={i} className="text-xs font-mono flex gap-2 items-start">
                                    <span className="mt-1.5 w-1 h-1 bg-red-500 shrink-0"></span>
                                    {point}
                                </li>
                            )) : <li className="text-xs font-mono opacity-50">No major conflicts detected.</li>}
                        </ul>
                    </div>

                    {/* Alignments */}
                    <div>
                        <div className="flex items-center gap-2 mb-2 text-green-600">
                            <CheckCircle size={14} />
                            <span className="font-bold font-mono text-xs uppercase tracking-wider">{t('sense', 'resonance')}</span>
                        </div>
                        <ul className="list-none space-y-2">
                             {result.keyAlignments.length > 0 ? result.keyAlignments.map((point, i) => (
                                <li key={i} className="text-xs font-mono flex gap-2 items-start">
                                    <span className="mt-1.5 w-1 h-1 bg-green-500 shrink-0"></span>
                                    {point}
                                </li>
                            )) : <li className="text-xs font-mono opacity-50">No specific alignments found.</li>}
                        </ul>
                    </div>
                </div>
                
                {/* Source Material - Political Context */}
                {result.sourceMaterial && (
                  <div className="bg-yellow-50 p-4 border border-yellow-300 relative">
                    <div className="absolute -top-3 left-3 bg-white px-2 font-mono text-[10px] font-bold flex items-center gap-1 border border-yellow-400 text-yellow-700">
                      <AlertTriangle size={10} />
                      Source Material
                    </div>
                    <p className="font-mono text-xs leading-relaxed text-gray-700">
                      {result.sourceMaterial}
                    </p>
                  </div>
                )}

                {/* FEC Political Donations */}
                {fecData && (
                  <div className="bg-blue-50 p-4 border border-blue-300 relative">
                    <div className="absolute -top-3 left-3 bg-white px-2 font-mono text-[10px] font-bold flex items-center gap-1 border border-blue-400 text-blue-700">
                      <DollarSign size={10} />
                      Political Donations
                    </div>
                    <div className="space-y-3">
                      <p className="font-mono text-xs text-gray-700">
                        <strong className="uppercase">{fecData.display_name}</strong> contributed{' '}
                        <strong>${fecData.total_usd.toLocaleString()}</strong> to federal candidates{' '}
                        ({fecData.years.length === 1
                          ? formatElectionCycle(fecData.years[0])
                          : `${formatElectionCycle(fecData.years[fecData.years.length - 1])} to ${formatElectionCycle(fecData.years[0])}`
                        })
                      </p>

                      {/* Party Breakdown Bars */}
                      <div className="space-y-2">
                        {Object.entries(fecData.party_totals)
                          .sort(([, a], [, b]) => (b as any).percentage - (a as any).percentage)
                          .map(([party, partyData]) => {
                            const data = partyData as FECPartyData;
                            const colors = getPartyColor(party);
                            const maxPercentage = Math.max(
                              ...Object.values(fecData.party_totals).map((p: any) => p.percentage)
                            );
                            const isLargest = data.percentage === maxPercentage;

                            return (
                              <div key={party} className="space-y-1">
                                <div className="flex justify-between font-mono text-[10px] text-gray-600">
                                  <span className="font-bold uppercase">{formatPartyName(party)}</span>
                                  <span>{data.percentage.toFixed(1)}%</span>
                                </div>
                                <div className="h-6 border-2 border-black flex items-center overflow-hidden">
                                  <div
                                    className="h-full flex items-center justify-end pr-2 transition-all"
                                    style={{
                                      width: `${data.percentage}%`,
                                      backgroundColor: isLargest ? colors.dark : colors.light
                                    }}
                                  >
                                    <span className="font-mono text-[10px] font-bold" style={{ color: isLargest ? 'white' : colors.dark }}>
                                      ${data.total_amount_usd.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      <p className="font-mono text-[9px] text-gray-500 italic pt-1">
                        Source: FEC data via PAC contributions to federal candidates
                      </p>
                    </div>
                  </div>
                )}

                {/* Intelligence Sources */}
                <div className="pt-4 border-t-2 border-gray-100">
                    <div className="flex items-center gap-2 mb-2 opacity-50">
                        <FileText size={12} />
                        <span className="font-mono text-[10px] uppercase font-bold">{t('sense', 'source')}</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {result.sources.map((source: any, idx: number) => {
                          // Handle both old format (string) and new format (GroundingSource object)
                          const url = typeof source === 'string' ? source : source.url;
                          const domain = typeof source === 'string' ? new URL(source).hostname : source.domain;

                          return (
                            <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-mono underline hover:text-gray-500">
                                {domain} <ExternalLink size={8} />
                            </a>
                          );
                        })}
                    </div>
                </div>
            </div>

            {/* Action Footer (Connecting to other tabs) */}
            <div className="bg-gray-100 border-t-4 border-black p-4 grid grid-cols-2 gap-4">
                <button 
                    onClick={() => onNavigate(ViewState.UNION)}
                    className="flex flex-col items-center justify-center gap-1 p-3 bg-white border-2 border-black hover:bg-black hover:text-white transition-all shadow-pixel active:translate-y-0.5 active:shadow-none group"
                >
                    <Users size={16} />
                    <span className="font-bold font-mono text-[10px] uppercase">{t('sense', 'btn_union')}</span>
                </button>
                <button 
                    onClick={() => onNavigate(ViewState.FEED)}
                    className="flex flex-col items-center justify-center gap-1 p-3 bg-white border-2 border-black hover:bg-black hover:text-white transition-all shadow-pixel active:translate-y-0.5 active:shadow-none group"
                >
                    <Newspaper size={16} />
                    <span className="font-bold font-mono text-[10px] uppercase">{t('sense', 'btn_context')}</span>
                </button>
                <button
                    onClick={() => setShowRecalModal(true)}
                    className="col-span-2 flex flex-row items-center justify-center gap-2 p-2 border-2 border-transparent hover:border-black transition-all opacity-60 hover:opacity-100"
                >
                    <Activity size={14} />
                    <span className="font-bold font-mono text-[10px] uppercase">{t('sense', 'btn_recal')}</span>
                </button>
            </div>

          </div>

          {/* Alternatives Section (Only if score is low) */}
          {result.alternatives && result.alternatives.length > 0 && result.score < 50 && (
            <div className="mt-4 bg-black text-white p-4 shadow-pixel">
                <span className="font-mono text-xs font-bold uppercase block mb-3">{t('sense', 'alternatives')}</span>
                <div className="flex flex-col gap-2">
                    {result.alternatives.map((alt: string, i: number) => {
                        // Extract entity name before parentheses for search
                        const entityName = alt.split('(')[0].trim();
                        return (
                            <button
                                key={i}
                                onClick={() => {
                                    setQuery(entityName);
                                    // Trigger search after setting query
                                    setTimeout(async () => {
                                        setLoading(true);
                                        setResult(null);
                                        setFecData(null);
                                        try {
                                            const [brandData, fecResult] = await Promise.all([
                                                analyzeBrandAlignment(entityName, userProfile, userDemographics),
                                                queryCompanyFECData(entityName)
                                            ]);
                                            setResult(brandData);
                                            setFecData(fecResult);
                                        } catch (e) {
                                            console.error(e);
                                        } finally {
                                            setLoading(false);
                                        }
                                    }, 0);
                                }}
                                className="bg-white text-black px-3 py-2 text-xs font-mono border-2 border-transparent hover:border-gray-500 hover:bg-gray-100 cursor-pointer text-left transition-all active:translate-y-0.5"
                            >
                                {alt}
                            </button>
                        );
                    })}
                </div>
            </div>
          )}
        </div>
      )}

      {/* Recalibrate My Stance Modal */}
      {showRecalModal && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setShowRecalModal(false);
              setRecalStance(null);
              setRecalReason('');
            }}
          />

          {/* Modal */}
          <div className="relative bg-white border-4 border-black shadow-pixel-lg w-full max-w-sm animate-fade-in">
            {/* Header */}
            <div className="bg-black text-white p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Activity size={16} />
                <span className="font-pixel text-sm uppercase">Recalibrate</span>
              </div>
              <button
                onClick={() => {
                  setShowRecalModal(false);
                  setRecalStance(null);
                  setRecalReason('');
                }}
                className="hover:opacity-70"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <p className="font-mono text-xs text-gray-600 text-center">
                How do you feel about <strong className="text-black uppercase">{result.brandName}</strong>?
              </p>

              {/* Stance Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRecalStance('SUPPORT')}
                  className={`flex flex-col items-center gap-2 p-4 border-2 transition-all ${
                    recalStance === 'SUPPORT'
                      ? 'border-green-500 bg-green-50'
                      : 'border-black hover:bg-gray-50'
                  }`}
                >
                  <ThumbsUp size={24} className={recalStance === 'SUPPORT' ? 'text-green-600' : ''} />
                  <span className="font-mono text-xs font-bold uppercase">Support</span>
                </button>
                <button
                  onClick={() => setRecalStance('OPPOSE')}
                  className={`flex flex-col items-center gap-2 p-4 border-2 transition-all ${
                    recalStance === 'OPPOSE'
                      ? 'border-red-500 bg-red-50'
                      : 'border-black hover:bg-gray-50'
                  }`}
                >
                  <ThumbsDown size={24} className={recalStance === 'OPPOSE' ? 'text-red-600' : ''} />
                  <span className="font-mono text-xs font-bold uppercase">Oppose</span>
                </button>
              </div>

              {/* Reason Input (Optional) */}
              <div>
                <label className="font-mono text-[10px] uppercase text-gray-500 block mb-1">
                  Reason (Optional, 50 chars max)
                </label>
                <textarea
                  value={recalReason}
                  onChange={(e) => setRecalReason(e.target.value.slice(0, 50))}
                  placeholder="Why do you feel this way?"
                  className="w-full border-2 border-black p-2 font-mono text-xs resize-none h-16 focus:outline-none focus:bg-gray-50"
                  maxLength={50}
                />
                <div className="text-right font-mono text-[10px] text-gray-400">
                  {recalReason.length}/50
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={async () => {
                  if (!recalStance) return;
                  setRecalSubmitting(true);
                  try {
                    if (onRecalibrate) {
                      await onRecalibrate(result.brandName, recalStance, recalReason || undefined);
                    }
                    setShowRecalModal(false);
                    setRecalStance(null);
                    setRecalReason('');
                    // Just close modal - report stays visible
                    // User can manually navigate to FINGERPRINT to see updated stance
                  } catch (e) {
                    console.error('Recalibration failed:', e);
                  } finally {
                    setRecalSubmitting(false);
                  }
                }}
                disabled={!recalStance || recalSubmitting}
                className={`w-full p-3 font-pixel text-sm uppercase transition-all ${
                  recalStance
                    ? 'bg-black text-white hover:bg-gray-800 shadow-pixel active:translate-y-0.5 active:shadow-none'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {recalSubmitting ? 'Calibrating...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
