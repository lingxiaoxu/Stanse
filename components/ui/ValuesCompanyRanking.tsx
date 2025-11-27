import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';
import { PixelCard } from './PixelCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { getCompanyRankingsForUser } from '../../services/companyRankingService';
import { RankedCompany, CompanyRanking } from '../../services/companyRankingCache';

interface ValuesCompanyRankingProps {
  className?: string;
  onRankingsChange?: (rankings: CompanyRanking) => void;
}

export const ValuesCompanyRanking: React.FC<ValuesCompanyRankingProps> = ({ className = '', onRankingsChange }) => {
  const { t } = useLanguage();
  const { userProfile, hasCompletedOnboarding } = useAuth();
  const [rankings, setRankings] = useState<CompanyRanking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRankings = async () => {
      if (!userProfile?.coordinates || !hasCompletedOnboarding) return;

      setLoading(true);
      setError(null);

      try {
        const { economic, social, diplomatic } = userProfile.coordinates;
        const result = await getCompanyRankingsForUser(economic, social, diplomatic);
        setRankings(result);
        // Notify parent component of rankings change
        onRankingsChange?.(result);
      } catch (err: any) {
        console.error('Error fetching company rankings:', err);
        setError(err.message || 'Failed to load rankings');
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, [userProfile, hasCompletedOnboarding, onRankingsChange]);

  const handleRefresh = async () => {
    if (!userProfile?.coordinates) return;

    setLoading(true);
    setError(null);

    try {
      const { economic, social, diplomatic } = userProfile.coordinates;
      // Force refresh by importing and calling with forceRefresh = true
      const { rankCompaniesForStance } = await import('../../services/companyRankingService');
      const { getStanceType } = await import('../../data/sp500Companies');
      const stanceType = getStanceType(economic, social, diplomatic);
      const result = await rankCompaniesForStance(stanceType, true);
      setRankings(result);
      // Notify parent component of rankings change
      onRankingsChange?.(result);
    } catch (err: any) {
      console.error('Error refreshing rankings:', err);
      setError(err.message || 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  if (!hasCompletedOnboarding) {
    return null;
  }

  const CompanyCard: React.FC<{ company: RankedCompany; type: 'support' | 'oppose' }> = ({ company, type }) => (
    <div className={`
      flex items-center justify-between p-2 border-b border-gray-200 last:border-b-0
      ${type === 'support' ? 'hover:bg-green-50' : 'hover:bg-red-50'}
      transition-colors
    `}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{company.symbol}</span>
          <span className="text-[10px] text-gray-400 truncate">{company.sector}</span>
        </div>
        <p className="text-[10px] text-gray-500 truncate">{company.name}</p>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <span className={`
          font-mono text-xs font-bold
          ${type === 'support' ? 'text-black' : 'text-gray-400'}
        `}>
          {company.score}
        </span>
        {type === 'support' ? (
          <TrendingUp size={12} className="text-black" />
        ) : (
          <TrendingDown size={12} className="text-gray-400" />
        )}
      </div>
    </div>
  );

  return (
    <div className={`mb-8 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-center mb-3 gap-2 text-gray-500">
        <ThumbsUp size={14} />
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase">
          {t('feed', 'company_ranking')}
        </span>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
          title="Refresh rankings"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Loading State */}
      {loading && !rankings && (
        <PixelCard className="p-4 text-center">
          <div className="font-pixel text-sm animate-pulse uppercase">
            {t('feed', 'loading_rankings')}
          </div>
        </PixelCard>
      )}

      {/* Error State */}
      {error && (
        <PixelCard className="p-4 text-center bg-red-50">
          <p className="font-mono text-xs text-red-600">{error}</p>
        </PixelCard>
      )}

      {/* Rankings Display */}
      {rankings && (
        <PixelCard className="p-0 bg-white/50 backdrop-blur-sm overflow-hidden">
          <div className="flex">
            {/* Support Column */}
            <div className="flex-1 border-r-2 border-black">
              <div className="bg-black text-white px-3 py-2 flex items-center gap-2">
                <ThumbsUp size={12} />
                <span className="font-mono text-[10px] tracking-wider uppercase">
                  {t('feed', 'support_companies')}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {rankings.supportCompanies.map((company, i) => (
                  <CompanyCard key={`support-${i}`} company={company} type="support" />
                ))}
              </div>
            </div>

            {/* Oppose Column */}
            <div className="flex-1">
              <div className="bg-gray-100 text-black px-3 py-2 flex items-center gap-2 border-b-2 border-black">
                <ThumbsDown size={12} />
                <span className="font-mono text-[10px] tracking-wider uppercase">
                  {t('feed', 'oppose_companies')}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {rankings.opposeCompanies.map((company, i) => (
                  <CompanyCard key={`oppose-${i}`} company={company} type="oppose" />
                ))}
              </div>
            </div>
          </div>

          {/* Footer with update time */}
          <div className="border-t-2 border-black px-3 py-1 bg-gray-50">
            <p className="font-mono text-[8px] text-gray-400 text-center">
              Updated: {rankings.updatedAt.toLocaleString()}
            </p>
          </div>
        </PixelCard>
      )}
    </div>
  );
};