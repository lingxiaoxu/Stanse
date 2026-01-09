
import React, { useState, useEffect } from 'react';
import { Zap, ArrowUpRight, ShieldCheck, Target, Copy, Activity, Swords } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { Campaign } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import * as PolisAPI from '../../services/polisApi';
import { LogActionModal } from '../modals/LogActionModal';
import { DuelModal } from '../modals/DuelModal';
import { recordUserAction } from '../../services/userActionService';

// Helper function to get the API base URL
const getApiBaseUrl = () => {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8080/api/v1'
    : 'https://polis-protocol-yfcontxnkq-uc.a.run.app/api/v1';
};

// Mock Campaigns (fallback if backend unavailable)
const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'c1',
    title: 'Fair Wages Initiative',
    target: 'MEGA CORP',
    type: 'BOYCOTT',
    participants: 12405,
    goal: 15000,
    description: 'Demanding transparency in overseas supply chains.',
    daysActive: 14
  },
  {
    id: 'c2',
    title: 'Green Energy Support',
    target: 'SUNRISE POWER',
    type: 'BUYCOTT',
    participants: 8320,
    goal: 10000,
    description: 'Shifting collective purchasing power to renewable providers.',
    daysActive: 30
  }
];

export const UnionView: React.FC = () => {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>(MOCK_CAMPAIGNS);
  const [userStats, setUserStats] = useState({ campaigns: 3, streak: 12, redirected: 420 });
  const [collectiveStats, setCollectiveStats] = useState({ strength: 45201, divested: 1240000 });
  const [useBackend, setUseBackend] = useState(false);
  const [blockHeight, setBlockHeight] = useState(0);
  const [tps, setTps] = useState(0);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showDuelModal, setShowDuelModal] = useState(false);
  const [userCredits, setUserCredits] = useState(100); // Default initial credits
  const { t } = useLanguage();
  const { user, demoMode } = useAuth();

  // Generate user DID
  const userDID = user?.email ? PolisAPI.generateUserDID(user.email) : '';

  // Fetch data from Polis Protocol backend
  useEffect(() => {
    const fetchBackendData = async () => {
      try {
        // Check backend health
        const isHealthy = await PolisAPI.checkBackendHealth();
        if (!isHealthy) {
          if (demoMode) {
            console.log('Backend unavailable, using mock data (demo mode ON)');
          } else {
            console.log('Backend unavailable, showing empty data (demo mode OFF)');
            // In strict mode (demo OFF), clear data to show only real backend data
            setCampaigns([]);
            setLiveCount(0);
            setUserStats({ campaigns: 0, streak: 0, redirected: 0 });
            setCollectiveStats({ strength: 0, divested: 0 });
          }
          return;
        }

        setUseBackend(true);

        // Fetch campaigns
        const backendCampaigns = await PolisAPI.fetchCampaigns();
        if (backendCampaigns && backendCampaigns.length > 0) {
          let filteredCampaigns = backendCampaigns;

          // If demo mode is OFF, filter out campaigns with only demo participants
          if (!demoMode) {
            // In strict mode, we only show campaigns with real user participation
            // For now, we'll show all campaigns but adjust participant counts
            filteredCampaigns = backendCampaigns.map(c => ({
              ...c,
              // In strict mode, reduce participants by estimated demo user count
              // Demo data adds ~5-10 users per campaign
              participants: Math.max(0, c.participants - 10)
            }));
          }

          setCampaigns(filteredCampaigns.map(c => ({
            id: c.id,
            title: c.title,
            target: c.target,
            type: c.type || 'PETITION',
            participants: c.participants,
            goal: c.goal,
            description: c.description,
            daysActive: c.days_active
          })));
        }

        // Fetch global stats
        const globalStats = await PolisAPI.fetchGlobalStats();
        if (globalStats) {
          // Display actual backend values directly
          setLiveCount(globalStats.active_allies_online);
          setCollectiveStats({
            strength: globalStats.total_union_strength,
            divested: Math.round(globalStats.capital_diverted_usd * 100) // Convert to cents
          });
        }

        // Fetch user impact if logged in
        if (user?.email) {
          const userDID = PolisAPI.generateUserDID(user.email);
          const userImpact = await PolisAPI.fetchUserImpact(userDID);
          if (userImpact) {
            setUserStats({
              campaigns: userImpact.campaigns,
              streak: userImpact.streak,
              redirected: Math.round(userImpact.redirected_usd)
            });
          }
        }
      } catch (error) {
        console.error('Error fetching backend data:', error);
        if (demoMode) {
          console.log('Error occurred, falling back to mock data (demo mode ON)');
        } else {
          console.log('Error occurred, showing empty data (demo mode OFF)');
          // In strict mode (demo OFF), clear data to show only real backend data
          setCampaigns([]);
          setLiveCount(0);
          setUserStats({ campaigns: 0, streak: 0, redirected: 0 });
          setCollectiveStats({ strength: 0, divested: 0 });
        }
      }
    };

    fetchBackendData();

    // Refresh data every 30 seconds
    const interval = setInterval(fetchBackendData, 30000);
    return () => clearInterval(interval);
  }, [user, demoMode]);

  // Fetch blockchain metrics from Polis Protocol backend
  useEffect(() => {
    const fetchBlockchainStats = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/blockchain/stats`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setBlockHeight(data.data.total_blocks);
            setTps(data.data.transactions_per_second);
          }
        }
      } catch (error) {
        console.error('Error fetching blockchain stats:', error);
        // If backend unavailable, keep previous values or fallback to 0
      }
    };

    // Fetch immediately
    fetchBlockchainStats();

    // Refresh blockchain stats every 5 seconds
    const interval = setInterval(fetchBlockchainStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Live count animation (only for mock mode with demo ON)
  useEffect(() => {
    if (useBackend || !demoMode) return; // Don't animate if using real backend data or demo mode is OFF

    const interval = setInterval(() => {
      setLiveCount((prev: number) => prev + Math.floor(Math.random() * 3));
    }, 2000);
    return () => clearInterval(interval);
  }, [useBackend, demoMode]);

  // Copy DID to clipboard
  const copyDID = () => {
    if (userDID) {
      navigator.clipboard.writeText(userDID);
      alert('DID copied to clipboard!');
    }
  };

  // Handle campaign amplify - now opens LOG ACTION modal
  const handleAmplify = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      setSelectedCampaign(campaign);
    }
  };

  // Handle action submission
  const handleActionSubmit = async (actionType: 'BOYCOTT' | 'BUYCOTT', amountCents: number) => {
    if (!user?.uid) {
      throw new Error('Please sign in to submit actions');
    }

    // Use the campaign's target as the target entity
    const target = selectedCampaign?.target || 'Unknown';

    // Convert action type to backend format (capitalize first letter only)
    const backendActionType = actionType === 'BOYCOTT' ? 'Boycott' : 'Buycott';

    // Record action to backend
    await recordUserAction(user.uid, backendActionType as 'Boycott' | 'Buycott' | 'Vote', target, amountCents);

    // Refresh campaign data after submission
    setTimeout(async () => {
      try {
        const backendCampaigns = await PolisAPI.fetchCampaigns();
        if (backendCampaigns && backendCampaigns.length > 0) {
          setCampaigns(backendCampaigns.map((c: any) => ({
            id: c.id,
            title: c.title,
            target: c.target,
            type: c.type || 'PETITION',
            participants: c.participants,
            goal: c.goal,
            description: c.description,
            daysActive: c.days_active || c.daysActive || 0
          })));
        }

        // Refresh global stats
        const globalStats = await PolisAPI.fetchGlobalStats();
        if (globalStats) {
          setLiveCount(globalStats.active_allies_online);
          setCollectiveStats({
            strength: globalStats.total_union_strength,
            divested: globalStats.capital_diverted_usd * 100
          });
        }
      } catch (error) {
        console.error('Error refreshing data after action submission:', error);
      }
    }, 2000);
  };

  // Debug: log demoMode changes
  useEffect(() => {
    console.log('🔍 ImpactView - demoMode:', demoMode);
  }, [demoMode]);

  return (
    <div className="max-w-lg promax:max-w-xl mx-auto w-full space-y-6 pb-20">
      {/* Blockchain Status Bar */}
      <div className="bg-black text-white border-2 border-black p-3 relative">
        {/* Data Mode Indicator */}
        <div className={`absolute -top-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 text-[8px] font-mono font-bold border border-black ${
          demoMode
            ? 'bg-yellow-400 text-black'
            : 'bg-green-500 text-white'
        }`}>
          {demoMode ? 'DEMO DATA' : 'REAL TIME DATA'}
        </div>

        <div className="grid grid-cols-2 gap-4 font-mono text-xs">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-green-400" />
            <div>
              <div className="text-gray-400 text-[9px] uppercase">{t('union', 'network')}</div>
              <div className="font-bold">{tps} TPS • #{blockHeight}</div>
            </div>
          </div>
          {userDID && (
            <div className="flex items-center gap-2 justify-end">
              <div className="text-right">
                <div className="text-gray-400 text-[9px] uppercase">{t('union', 'your_did')}</div>
                <div className="font-bold">{userDID.slice(0, 12)}...</div>
              </div>
              <button
                onClick={copyDID}
                className="p-1 hover:bg-gray-800 rounded transition-colors"
              >
                <Copy size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="text-center mb-6" data-tour-id="union-header">
        <h2 className="font-pixel text-5xl">{t('union', 'title')}</h2>
        <p className="font-mono text-xs text-gray-400 uppercase">
          {t('union', 'subtitle')}
        </p>
      </div>

      {/* Active Pulse Map - Clean White Version */}
      <PixelCard className="relative bg-white" data-tour-id="active-allies">
        <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-full">
             <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
             <span className="font-mono text-[10px] font-bold text-red-500 tracking-wider">{t('union', 'live')}</span>
        </div>

        <div className="flex flex-col items-center justify-center py-6 space-y-2">
           <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase">{t('union', 'active_allies')}</span>
           <div className="font-pixel text-7xl">
             {liveCount !== null ? liveCount.toLocaleString() : '...'}
           </div>
           
           <div className="text-[10px] font-mono text-center text-gray-500 mt-4 max-w-xs">
              {t('union', 'active_desc')}
           </div>
        </div>
      </PixelCard>

      {/* DUEL ARENA Entry Card - Matching THE MARKET style */}
      <PixelCard className="p-0 bg-white/50 backdrop-blur-sm">
        {/* Section Header with Icon */}
        <div className="px-3 py-2 border-b-2 border-black bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords size={14} strokeWidth={2.5} />
            <span className="font-mono text-xs font-bold tracking-wider">- {t('duel', 'entry_card_title')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            <span className="font-mono text-[9px] font-bold text-green-600 tracking-wider">{t('duel', 'entry_card_live')}</span>
          </div>
        </div>

        {/* Subtitle Bar */}
        <div className="bg-black text-white px-3 py-2 flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-wider uppercase flex-1">
            {t('duel', 'entry_card_subtitle')}
          </span>
        </div>

        {/* Balance Bar */}
        <div className="bg-black text-white px-3 py-2 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider">{t('duel', 'balance')}</span>
            <span className="font-pixel text-2xl">${userCredits}</span>
          </div>
        </div>

        {/* Tags Bar */}
        <div className="px-3 py-2 bg-white border-t-2 border-black flex gap-3">
          <div className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase text-gray-600">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            {t('duel', 'entry_card_matched')}
          </div>
          <div className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase text-gray-600">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
            {t('duel', 'entry_card_credits')}
          </div>
        </div>

        {/* Enter Button - Full Width */}
        <div className="border-t-2 border-black">
          <button
            onClick={() => setShowDuelModal(true)}
            className="w-full bg-gray-50 hover:bg-black hover:text-white transition-colors px-4 py-3 flex items-center justify-center gap-2 font-mono text-sm font-bold uppercase group"
          >
            <span>{t('duel', 'enter_duel')}</span>
            <ArrowUpRight size={16} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>
      </PixelCard>

      {/* Active Campaigns Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-end px-1">
            <h3 className="font-pixel text-2xl">{t('union', 'active_fronts')}</h3>
            <button
              onClick={() => setShowAllCampaigns(!showAllCampaigns)}
              className="font-mono text-xs underline cursor-pointer hover:text-gray-600 transition-colors"
            >
              {showAllCampaigns ? 'SHOW LESS' : t('union', 'view_all')}
            </button>
        </div>

        {(showAllCampaigns ? campaigns : campaigns.slice(0, 2)).map((campaign: Campaign) => (
          <PixelCard key={campaign.id} className="group cursor-pointer hover:-translate-y-1 transition-transform">
            <div className="flex justify-between items-start">
                <div className="flex gap-3">
                    <div className={`
                        p-3 border-2 border-black h-12 w-12 flex items-center justify-center
                        ${campaign.type === 'BOYCOTT' ? 'bg-black text-white' : 'bg-white text-black'}
                    `}>
                        {campaign.type === 'BOYCOTT' ? <ShieldCheck size={20} /> : <Zap size={20} />}
                    </div>
                    <div>
                        <h4 className="font-bold font-mono text-lg promax:text-xl leading-none">{campaign.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-xs font-mono text-gray-500">
                            <Target size={12} />
                            <span>{t('union', 'target')}: {campaign.target}</span>
                        </div>
                    </div>
                </div>
                <div className="font-pixel text-xl text-gray-400">
                    {campaign.daysActive}d
                </div>
            </div>

            <p className="mt-4 font-mono text-sm leading-relaxed">
                {campaign.description}
            </p>

            {/* Clean Progress Bar */}
            <div className="mt-6 space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                    <span>{campaign.participants.toLocaleString()} {t('union', 'joined')}</span>
                    <span>{t('union', 'goal')}: {campaign.goal.toLocaleString()}</span>
                </div>
                <div className="w-full h-4 border-2 border-black p-0.5 bg-white">
                    <div 
                        className="h-full bg-black pattern-diagonal-lines"
                        style={{ width: `${(campaign.participants / campaign.goal) * 100}%` }}
                    ></div>
                </div>
            </div>
            
            <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAmplify(campaign.id);
                  }}
                  className="px-4 py-2 border-2 border-black bg-white hover:bg-black hover:text-white transition-colors font-mono text-xs font-bold uppercase"
                >
                    AMPLIFY IMPACT <ArrowUpRight size={14} className="ml-2 inline"/>
                </button>
            </div>
          </PixelCard>
        ))}
      </div>

      {/* REDESIGNED Impact Stats Dashboard - Black & White Theme */}
      <PixelCard className="p-0 border-4 border-black bg-white">
        {/* Header */}
        <div className="p-6 border-b-2 border-black bg-gray-50">
            <div className="flex justify-between items-end">
                <h3 className="font-pixel text-3xl tracking-wide">{t('union', 'your_impact')}</h3>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {t('union', 'ledger')}
                </div>
            </div>
        </div>
            
        {/* Personal Stats Row */}
        <div className="grid grid-cols-3 divide-x-2 divide-black text-center py-6">
            <div>
                <div className="font-pixel text-4xl">{userStats.campaigns}</div>
                <div className="text-[10px] font-mono font-bold text-gray-500 mt-1 uppercase">{t('union', 'camp_stat')}</div>
            </div>
            <div>
                <div className="font-pixel text-4xl">{userStats.streak}<span className="text-xl text-gray-400">d</span></div>
                <div className="text-[10px] font-mono font-bold text-gray-500 mt-1 uppercase">{t('union', 'streak_stat')}</div>
            </div>
            <div>
                <div className="font-pixel text-4xl">${userStats.redirected}</div>
                <div className="text-[10px] font-mono font-bold text-gray-500 mt-1 uppercase">{t('union', 'redirect_stat')}</div>
            </div>
        </div>

        {/* Connector */}
        <div className="bg-black text-white py-2 text-center border-y-2 border-black">
             <div className="text-[10px] font-mono tracking-[0.3em] flex items-center justify-center gap-4">
                <span>▼</span> {t('union', 'amplified')} <span>▼</span>
             </div>
        </div>

        {/* Collective Stats - Typography Focused */}
        <div className="p-6 space-y-8">
            {/* Stat 1 */}
            <div className="flex flex-col items-center">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{t('union', 'union_strength')}</span>
                <div className="font-pixel text-6xl promax:text-7xl leading-none">
                    {collectiveStats.strength.toLocaleString()}
                </div>
                <div className="h-1 w-16 bg-black mt-4 mb-1"></div>
            </div>

            {/* Stat 2 */}
            <div className="flex flex-col items-center">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{t('union', 'capital_divested')}</span>
                <div className="font-pixel text-6xl promax:text-7xl leading-none">
                    ${(collectiveStats.divested / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] font-mono text-gray-500 mt-2 max-w-xs text-center">
                    {t('union', 'divested_desc')}
                </p>
            </div>
        </div>
      </PixelCard>

      {/* LOG ACTION Modal */}
      {selectedCampaign && (
        <LogActionModal
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onSubmit={handleActionSubmit}
        />
      )}

      {/* DUEL Modal */}
      {showDuelModal && user && (
        <DuelModal
          isOpen={showDuelModal}
          onClose={() => setShowDuelModal(false)}
          userCredits={userCredits}
          userPersonaLabel={user.displayName || 'Unknown'}
          userStanceType={'moderate-centrist'} // TODO: Get from user profile
          onCreditsChange={(newBalance: number) => setUserCredits(newBalance)}
        />
      )}
    </div>
  );
};
