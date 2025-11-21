import React, { useState } from 'react';
import { Search, AlertTriangle, CheckCircle, XCircle, Users } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { analyzeBrandAlignment } from '../../services/geminiService';
import { PoliticalCoordinates, BrandAlignment } from '../../types';

interface ScannerViewProps {
  userProfile: PoliticalCoordinates;
}

export const ScannerView: React.FC<ScannerViewProps> = ({ userProfile }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BrandAlignment | null>(null);

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
      <div className="text-center space-y-2 mb-4">
        <h2 className="font-pixel text-5xl promax:text-6xl tracking-widest">SCANNER</h2>
        <p className="text-xs promax:text-sm font-mono text-pixel-gray uppercase">
          Decode Values • Align Consumption
        </p>
      </div>

      <PixelCard className="p-6 promax:p-8">
        <div className="flex flex-col gap-4">
          <label className="font-mono text-sm font-bold uppercase tracking-wide">Search Entity / Brand</label>
          <div className="flex gap-2 h-12">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E.g. STARBUCKS, TESLA..."
              className="flex-1 border-2 border-pixel-black p-3 font-mono text-lg focus:outline-none focus:bg-gray-50 placeholder:text-gray-300"
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            />
            <PixelButton onClick={handleScan} disabled={loading} className="px-6">
              <Search size={24} />
            </PixelButton>
          </div>
        </div>
      </PixelCard>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4 opacity-50">
          <div className="animate-spin w-8 h-8 border-4 border-black border-t-transparent rounded-full"></div>
          <div className="font-pixel text-2xl animate-pulse">ACCESSING INTELLIGENCE...</div>
        </div>
      )}

      {result && (
        <div className="animate-fade-in">
          <PixelCard 
            variant={result.status === 'MATCH' ? 'default' : 'dark'}
            className={`border-4 ${
                result.status === 'MATCH' ? 'border-success-green' : 
                result.status === 'CONFLICT' ? 'border-alert-red' : 'border-pixel-gray'
            }`}
            actionElement={
                <div className="flex items-center gap-2 bg-white text-black px-2 py-1 text-xs font-bold border border-black">
                    <Users size={12} />
                    <span>UNION CONSENSUS</span>
                </div>
            }
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-3xl promax:text-4xl font-bold uppercase leading-none mb-2">{result.brandName}</h3>
                <div className="flex items-center gap-3">
                    <span className="font-pixel text-2xl">SCORE: {result.score}</span>
                    <div className={`h-3 w-24 border border-current p-0.5 ${result.status === 'MATCH' ? 'text-green-600' : 'text-red-500'}`}>
                        <div className="h-full bg-current" style={{width: `${result.score}%`}}></div>
                    </div>
                </div>
              </div>
              <div className="bg-white rounded-full p-1">
                {result.status === 'MATCH' && <CheckCircle className="text-success-green" size={48} />}
                {result.status === 'CONFLICT' && <XCircle className="text-alert-red" size={48} />}
                {result.status === 'NEUTRAL' && <AlertTriangle className="text-yellow-500" size={48} />}
              </div>
            </div>

            <div className="space-y-6 font-mono text-sm promax:text-base">
              <p className="border-l-4 pl-4 border-current opacity-90 leading-relaxed">
                {result.reasoning}
              </p>
              
              {/* Community Stat Injection */}
              <div className="flex items-center gap-3 py-3 px-4 border border-current border-dashed bg-opacity-10 bg-white">
                <Users size={18} />
                <span className="text-xs font-bold">
                    {result.status === 'CONFLICT' 
                        ? "82% of the Union is currently avoiding this brand." 
                        : "65% of the Union endorses this entity."}
                </span>
              </div>

              {result.sources.length > 0 && (
                <div className="text-xs opacity-60 pt-4 border-t border-current">
                  <strong className="block mb-2">INTELLIGENCE SOURCES:</strong>
                  <ul className="space-y-1">
                    {result.sources.map((source, idx) => (
                      <li key={idx} className="truncate max-w-xs hover:underline cursor-pointer">
                         • {new URL(source).hostname}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.alternatives && result.alternatives.length > 0 && (
                <div className="mt-6 bg-white text-black p-4 border-2 border-black shadow-[4px_4px_0_0_rgba(255,255,255,0.2)]">
                  <strong className="block mb-3 font-bold text-xs uppercase tracking-wider">Recommended Alternatives</strong>
                  <div className="flex flex-wrap gap-2">
                    {result.alternatives.map((alt, i) => (
                      <span key={i} className="bg-pixel-black text-white px-3 py-1.5 text-xs font-bold hover:bg-gray-800 cursor-pointer transition-colors">
                        {alt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PixelCard>
        </div>
      )}
    </div>
  );
};