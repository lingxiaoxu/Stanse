
import React, { useState } from 'react';
import { Search, ShieldAlert, CheckCircle, FileText, ExternalLink, Users, Newspaper, Twitter, Activity } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { analyzeBrandAlignment } from '../../services/geminiService';
import { PoliticalCoordinates, BrandAlignment, ViewState } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface SenseViewProps {
  userProfile: PoliticalCoordinates;
  onNavigate: (view: ViewState) => void;
}

export const SenseView: React.FC<SenseViewProps> = ({ userProfile, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BrandAlignment | null>(null);
  const { t } = useLanguage();

  const handleScan = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await analyzeBrandAlignment(query, userProfile);
      setResult(data);
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
                
                {/* Intelligence Sources */}
                <div className="pt-4 border-t-2 border-gray-100">
                    <div className="flex items-center gap-2 mb-2 opacity-50">
                        <FileText size={12} />
                        <span className="font-mono text-[10px] uppercase font-bold">{t('sense', 'source')}</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {result.sources.map((source, idx) => (
                            <a key={idx} href={source} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-mono underline hover:text-gray-500">
                                {new URL(source).hostname} <ExternalLink size={8} />
                            </a>
                        ))}
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
                    onClick={() => onNavigate(ViewState.FINGERPRINT)}
                    className="col-span-2 flex flex-row items-center justify-center gap-2 p-2 border-2 border-transparent hover:border-black transition-all opacity-60 hover:opacity-100"
                >
                    <Activity size={14} />
                    <span className="font-bold font-mono text-[10px] uppercase">{t('sense', 'btn_recal')}</span>
                </button>
            </div>

          </div>

          {/* Alternatives Section (Only if score is low) */}
          {result.alternatives && result.alternatives.length > 0 && result.score < 50 && (
            <div className="mt-4 flex items-center justify-between bg-black text-white p-4 shadow-pixel">
                <span className="font-mono text-xs font-bold uppercase">{t('sense', 'alternatives')}</span>
                <div className="flex gap-2">
                    {result.alternatives.map((alt, i) => (
                        <span key={i} className="bg-white text-black px-2 py-1 text-xs font-bold font-pixel uppercase border-2 border-transparent hover:border-gray-500 cursor-pointer">
                            {alt}
                        </span>
                    ))}
                </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
