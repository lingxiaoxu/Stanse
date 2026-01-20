import React, { useState, useEffect } from 'react';
import { ArrowLeft, Target, ShieldCheck, Zap, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Campaign } from '../../types';
import { PixelCard } from '../ui/PixelCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { getCampaignsByPage } from '../../services/campaignPersonalizationService';
import { CampaignDetailModal } from '../modals/CampaignDetailModal';
import { LogActionModal } from '../modals/LogActionModal';

interface AllCampaignsViewProps {
  onBack: () => void;
}

export const AllCampaignsView: React.FC<AllCampaignsViewProps> = ({ onBack }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedCampaignForDetail, setSelectedCampaignForDetail] = useState<Campaign | null>(null);
  const [selectedCampaignForAction, setSelectedCampaignForAction] = useState<Campaign | null>(null);
  const { t, language } = useLanguage();
  const { userProfile } = useAuth();

  const pageSize = 8;

  // Load campaigns for current page
  useEffect(() => {
    const loadCampaigns = async () => {
      setLoading(true);
      try {
        const result = await getCampaignsByPage(
          currentPage,
          pageSize,
          userProfile?.coordinates,
          language
        );
        setCampaigns(result.campaigns);
        setTotalPages(result.totalPages);
        setTotalCount(result.totalCount);
      } catch (error) {
        console.error('[All Campaigns] Error loading campaigns:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCampaigns();
  }, [currentPage, userProfile, language]); // Re-load when language changes

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCampaignClick = (campaign: Campaign) => {
    setSelectedCampaignForDetail(campaign);
  };

  const handleAmplify = (campaign: Campaign) => {
    setSelectedCampaignForAction(campaign);
  };

  const handleActionSubmit = async (actionType: 'BOYCOTT' | 'BUYCOTT', amountCents: number) => {
    // TODO: Implement action submission
    console.log('[All Campaigns] Action submitted:', actionType, amountCents);
    // Refresh campaigns after action
    const result = await getCampaignsByPage(currentPage, pageSize, userProfile?.coordinates);
    setCampaigns(result.campaigns);
  };

  return (
    <div className="max-w-lg promax:max-w-xl mx-auto w-full space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 border-2 border-black hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="font-pixel text-3xl">{t('union', 'active_fronts')}</h2>
          <p className="font-mono text-xs text-gray-500">
            {totalCount} total campaigns • Page {currentPage} of {totalPages}
          </p>
        </div>
      </div>

      {/* Info Banner - First 4 are personalized */}
      {currentPage === 1 && campaigns.length > 0 && (
        <div className="bg-blue-50 border-2 border-black p-4">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p className="font-mono text-xs leading-relaxed">
              The first 4 campaigns are personalized for you based on your political coordinates and company rankings.
              The rest are sorted alphabetically.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="font-mono text-sm text-gray-500">Loading campaigns...</div>
        </div>
      )}

      {/* Campaign Cards */}
      {!loading && campaigns.length > 0 && (
        <div className="space-y-4">
          {campaigns.map((campaign: Campaign, index: number) => (
            <PixelCard
              key={campaign.id}
              className="group cursor-pointer hover:-translate-y-1 transition-transform relative"
            >
              {/* Personalized Badge */}
              {currentPage === 1 && index < 4 && (
                <div className="absolute top-2 right-2 bg-yellow-400 text-black px-2 py-1 text-[9px] font-mono font-bold border border-black z-10">
                  PERSONALIZED
                </div>
              )}

              <div className="flex justify-between items-start pt-8">
                <div className="flex gap-3">
                  <div
                    className={`
                      p-3 border-2 border-black h-12 w-12 flex items-center justify-center shrink-0
                      ${campaign.type === 'BOYCOTT' ? 'bg-black text-white' : 'bg-white text-black'}
                    `}
                  >
                    {campaign.type === 'BOYCOTT' ? <ShieldCheck size={20} /> : <Zap size={20} />}
                  </div>
                  <div>
                    <h4 className="font-bold font-mono text-lg promax:text-xl leading-none">
                      {campaign.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs font-mono text-gray-500">
                      <Target size={12} />
                      <span>
                        {campaign.target}
                        {campaign.targetType === 'SECTOR' && (
                          <span className="ml-2 px-1 py-0.5 bg-gray-200 text-[10px]">
                            SECTOR
                          </span>
                        )}
                        {campaign.ticker && (
                          <span className="ml-2 px-1 py-0.5 bg-gray-200 text-[10px]">
                            {campaign.ticker}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="font-pixel text-xl text-gray-400">{campaign.daysActive}d</div>
              </div>

              <p className="mt-4 font-mono text-[10px] text-gray-500 leading-relaxed">{campaign.description}</p>

              {/* Progress Bar */}
              <div className="mt-6 space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>
                    {campaign.participants.toLocaleString()} {t('union', 'joined')}
                  </span>
                  <span>
                    {t('union', 'goal')}: {campaign.goal.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-4 border-2 border-black p-0.5 bg-white">
                  <div
                    className="h-full bg-black pattern-diagonal-lines"
                    style={{
                      width: `${Math.min((campaign.participants / campaign.goal) * 100, 100)}%`,
                    }}
                  ></div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCampaignClick(campaign);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-black bg-white hover:bg-gray-100 transition-colors font-mono text-xs font-bold uppercase"
                >
                  <Info size={14} className="inline mr-2" />
                  Details
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAmplify(campaign);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-black bg-black text-white hover:bg-gray-800 transition-colors font-mono text-xs font-bold uppercase"
                >
                  Amplify Impact
                </button>
              </div>
            </PixelCard>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && campaigns.length === 0 && (
        <div className="text-center py-12">
          <div className="font-mono text-sm text-gray-500">No campaigns found</div>
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-6">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className={`flex items-center gap-2 px-4 py-2 border-2 border-black font-mono text-sm font-bold transition-colors ${
              currentPage === 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <div className="font-mono text-sm">
            Page <span className="font-bold">{currentPage}</span> of{' '}
            <span className="font-bold">{totalPages}</span>
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className={`flex items-center gap-2 px-4 py-2 border-2 border-black font-mono text-sm font-bold transition-colors ${
              currentPage === totalPages
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Campaign Detail Modal */}
      {selectedCampaignForDetail && (
        <CampaignDetailModal
          campaign={selectedCampaignForDetail}
          onClose={() => setSelectedCampaignForDetail(null)}
          onAmplify={() => {
            setSelectedCampaignForAction(selectedCampaignForDetail);
            setSelectedCampaignForDetail(null);
          }}
        />
      )}

      {/* Log Action Modal */}
      {selectedCampaignForAction && (
        <LogActionModal
          campaign={selectedCampaignForAction}
          onClose={() => setSelectedCampaignForAction(null)}
          onSubmit={handleActionSubmit}
        />
      )}
    </div>
  );
};
