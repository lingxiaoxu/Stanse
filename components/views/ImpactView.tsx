
import React, { useState, useEffect } from 'react';
import { Zap, ArrowUpRight, ShieldCheck, Target, Copy, Activity, Swords, Shield, Info } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { Campaign } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import * as PolisAPI from '../../services/polisApi';
import { LogActionModal } from '../modals/LogActionModal';
import { DuelModal } from '../modals/DuelModal';
import { WalletModal } from '../modals/WalletModal';
import { CampaignDetailModal } from '../modals/CampaignDetailModal';
import { ProposeOfflineActivityModal } from '../modals/ProposeOfflineActivityModal';
import { AllCampaignsView } from './AllCampaignsView';
import { recordUserAction as recordPolisAction } from '../../services/userActionService';
import { getUserCreditsBalance, addCredits, withdrawCredits } from '../../services/duelFirebaseService';
import { getPersonalizedCampaigns } from '../../services/campaignPersonalizationService';
import { getCampaignsByLanguage, recordUserAction as recordCampaignAction } from '../../services/activeFrontsService';
import { submitOfflineActivityProposal } from '../../services/offlineActivityProposalService';

// Helper function to get the API base URL
const getApiBaseUrl = () => {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8080/api/v1'
    : 'https://polis-protocol-yfcontxnkq-uc.a.run.app/api/v1';
};

// No mock campaigns - all campaigns loaded from Firebase
// Use window.populateActiveFronts('example') or window.populateActiveFronts() to populate
const MOCK_CAMPAIGNS: Campaign[] = [];

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
  const [selectedCampaignForDetail, setSelectedCampaignForDetail] = useState<Campaign | null>(null);
  const [selectedCampaignForProposal, setSelectedCampaignForProposal] = useState<Campaign | null>(null);
  const [showDuelModal, setShowDuelModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletInitialTab, setWalletInitialTab] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [userCredits, setUserCredits] = useState<number | null>(null); // null = loading
  const [isCollectiveStatsExpanded, setIsCollectiveStatsExpanded] = useState(true); // Default expanded
  const [loadingPersonalizedCampaigns, setLoadingPersonalizedCampaigns] = useState(false);
  const { t, language } = useLanguage();
  const { user, demoMode, userProfile } = useAuth();

  // Fetch user credits from server
  useEffect(() => {
    const fetchCredits = async () => {
      if (!user) {
        setUserCredits(100); // Default for non-logged in users
        return;
      }
      try {
        const credits = await getUserCreditsBalance(user.uid);
        if (credits) {
          setUserCredits(credits.balance);
        } else {
          setUserCredits(100); // Fallback to default
        }
      } catch (error) {
        console.error('Failed to fetch credits:', error);
        setUserCredits(100); // Fallback on error
      }
    };
    fetchCredits();
  }, [user]);

  // Generate user DID
  const userDID = user?.email ? PolisAPI.generateUserDID(user.email) : '';

  // Fetch data from Polis Protocol backend
  // Demo mode mock data constants
  const DEMO_MOCK_STATS = {
    liveCount: 1247,
    userStats: { campaigns: 3, streak: 12, redirected: 420 },
    collectiveStats: { strength: 45201, divested: 1240000 } // divested in cents
  };

  useEffect(() => {
    const fetchBackendData = async () => {
      try {
        // Check backend health
        const isHealthy = await PolisAPI.checkBackendHealth();
        if (!isHealthy) {
          if (demoMode) {
            console.log('Backend unavailable, using mock data (demo mode ON)');
            // Set mock data for demo mode when backend is unavailable
            setCampaigns(MOCK_CAMPAIGNS);
            setLiveCount(DEMO_MOCK_STATS.liveCount);
            setUserStats(DEMO_MOCK_STATS.userStats);
            setCollectiveStats(DEMO_MOCK_STATS.collectiveStats);
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
          if (demoMode) {
            // Demo mode ON + backend available: combine mock data with real data
            setLiveCount(globalStats.active_allies_online + DEMO_MOCK_STATS.liveCount);
            setCollectiveStats({
              strength: globalStats.total_union_strength + DEMO_MOCK_STATS.collectiveStats.strength,
              divested: Math.round(globalStats.capital_diverted_usd * 100) + DEMO_MOCK_STATS.collectiveStats.divested
            });
          } else {
            // Demo mode OFF: display actual backend values only
            setLiveCount(globalStats.active_allies_online);
            setCollectiveStats({
              strength: globalStats.total_union_strength,
              divested: Math.round(globalStats.capital_diverted_usd * 100)
            });
          }
        }

        // Fetch user impact if logged in
        if (user?.email) {
          const userDID = PolisAPI.generateUserDID(user.email);
          const userImpact = await PolisAPI.fetchUserImpact(userDID);
          if (userImpact) {
            if (demoMode) {
              // Demo mode ON: combine mock data with real user data
              setUserStats({
                campaigns: userImpact.campaigns + DEMO_MOCK_STATS.userStats.campaigns,
                streak: userImpact.streak + DEMO_MOCK_STATS.userStats.streak,
                redirected: Math.round(userImpact.redirected_usd) + DEMO_MOCK_STATS.userStats.redirected
              });
            } else {
              // Demo mode OFF: display actual user data only
              setUserStats({
                campaigns: userImpact.campaigns,
                streak: userImpact.streak,
                redirected: Math.round(userImpact.redirected_usd)
              });
            }
          } else if (demoMode) {
            // No user impact data but demo mode is ON: show mock data
            setUserStats(DEMO_MOCK_STATS.userStats);
          }
        } else if (demoMode) {
          // Not logged in but demo mode is ON: show mock data
          setUserStats(DEMO_MOCK_STATS.userStats);
        }
      } catch (error) {
        console.error('Error fetching backend data:', error);
        if (demoMode) {
          console.log('Error occurred, falling back to mock data (demo mode ON)');
          // Set mock data for demo mode when error occurs
          setCampaigns(MOCK_CAMPAIGNS);
          setLiveCount(DEMO_MOCK_STATS.liveCount);
          setUserStats(DEMO_MOCK_STATS.userStats);
          setCollectiveStats(DEMO_MOCK_STATS.collectiveStats);
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

  // Fetch campaigns from Firebase (personalized if user has coordinates, otherwise all campaigns)
  useEffect(() => {
    const fetchCampaigns = async () => {
      setLoadingPersonalizedCampaigns(true);
      try {
        // Always load campaigns for current language
        console.log(`[Union View] 🔄 Loading campaigns for language: ${language}...`);
        const allCampaigns = await getCampaignsByLanguage(language);
        console.log(`[Union View] 📊 Retrieved ${allCampaigns.length} campaigns for ${language}`, allCampaigns);

        // If we have campaigns, try to personalize them
        if (allCampaigns.length > 0) {
          if (userProfile?.coordinates) {
            console.log('[Union View] 🎯 Attempting to personalize campaigns for:', userProfile.coordinates.coreStanceType);
            const personalizedCampaigns = await getPersonalizedCampaigns(userProfile.coordinates, language);
            console.log(`[Union View] 📌 Personalization returned ${personalizedCampaigns.length} campaigns`, personalizedCampaigns);

            if (personalizedCampaigns.length >= 4) {
              console.log(`[Union View] ✅ Using 4 personalized campaigns`);
              setCampaigns(personalizedCampaigns.slice(0, 4));
            } else if (personalizedCampaigns.length > 0) {
              // Got some personalized campaigns, but not enough - fill the rest alphabetically
              console.log(`[Union View] ⚠️ Only ${personalizedCampaigns.length} personalized campaigns, filling rest alphabetically`);
              const personalizedIds = new Set(personalizedCampaigns.map(c => c.id));
              const remainingCampaigns = allCampaigns
                .filter(c => !personalizedIds.has(c.id))
                .sort((a, b) => a.target.localeCompare(b.target));
              const neededCount = 4 - personalizedCampaigns.length;
              setCampaigns([...personalizedCampaigns, ...remainingCampaigns.slice(0, neededCount)]);
            } else {
              // Personalization failed, show first 4 campaigns alphabetically
              console.log('[Union View] ⚠️ Personalization returned 0 campaigns, showing first 4 alphabetically');
              const sortedCampaigns = [...allCampaigns].sort((a, b) => a.target.localeCompare(b.target));
              setCampaigns(sortedCampaigns.slice(0, 4));
            }
          } else {
            // No user coordinates, show first 4 campaigns alphabetically
            console.log('[Union View] ℹ️ No user coordinates, showing first 4 campaigns alphabetically');
            const sortedCampaigns = [...allCampaigns].sort((a, b) => a.target.localeCompare(b.target));
            setCampaigns(sortedCampaigns.slice(0, 4));
          }
        } else {
          console.log('[Union View] ❌ No campaigns found in Firebase (empty collection)');
        }
      } catch (error) {
        console.error('[Union View] ❌ Error fetching campaigns:', error);
      } finally {
        setLoadingPersonalizedCampaigns(false);
      }
    };

    fetchCampaigns();

    // Also refresh campaigns every 30 seconds
    const interval = setInterval(fetchCampaigns, 30000);
    return () => clearInterval(interval);
  }, [userProfile, language]); // Re-fetch when user profile or language changes

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

    if (!selectedCampaign) {
      throw new Error('No campaign selected');
    }

    try {
      // Record action to Firebase campaign system (always)
      await recordCampaignAction(selectedCampaign.id, user.uid, actionType, amountCents);
      console.log(`[Union View] ✅ Action recorded to Firebase: ${actionType} ${amountCents}¢ on ${selectedCampaign.id}`);

      // Also record to Polis Protocol backend (production requirement)
      const backendActionType = actionType === 'BOYCOTT' ? 'Boycott' : 'Buycott';
      try {
        await recordPolisAction(user.uid, backendActionType as 'Boycott' | 'Buycott' | 'Vote', selectedCampaign.target, amountCents);
        console.log(`[Union View] ✅ Action recorded to Polis backend`);
      } catch (polisError) {
        console.log('[Union View] ⚠️ Polis backend not available (dev mode), action saved to Firebase only');
      }

      // Refresh campaigns from Firebase and Polis backend
      setTimeout(async () => {
        try {
          // Refresh from Firebase for current language
          const allCampaigns = await getCampaignsByLanguage(language);
          if (allCampaigns.length > 0 && userProfile?.coordinates) {
            const personalizedCampaigns = await getPersonalizedCampaigns(userProfile.coordinates, language);
            if (personalizedCampaigns.length > 0) {
              setCampaigns(personalizedCampaigns);
            } else {
              const sortedCampaigns = [...allCampaigns].sort((a, b) => a.target.localeCompare(b.target));
              setCampaigns(sortedCampaigns.slice(0, 4));
            }
          }

          // Try to refresh from Polis backend (if available)
          try {
            const backendCampaigns = await PolisAPI.fetchCampaigns();
            if (backendCampaigns && backendCampaigns.length > 0) {
              console.log('[Union View] Refreshed campaigns from Polis backend');
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
          } catch (backendError) {
            console.log('[Union View] Polis backend refresh skipped (dev mode)');
          }
        } catch (error) {
          console.error('[Union View] Error refreshing data after action submission:', error);
        }
      }, 1000);
    } catch (error) {
      console.error('[Union View] Error submitting action:', error);
      throw error;
    }
  };

  // Handle offline activity proposal submission
  const handleProposeActivity = async (proposalData: {
    date: string;
    city: string;
    state: string;
    country: string;
    address?: string;
    expectedAttendees?: number;
    description: string;
  }) => {
    if (!user?.uid) {
      throw new Error('Please sign in to propose activities');
    }

    if (!selectedCampaignForProposal) {
      throw new Error('No campaign selected');
    }

    try {
      await submitOfflineActivityProposal(
        user.uid,
        selectedCampaignForProposal.baseId,
        proposalData
      );
      console.log(`[Union View] ✅ Offline activity proposal submitted for ${selectedCampaignForProposal.baseId}`);
    } catch (error) {
      console.error('[Union View] Error submitting proposal:', error);
      throw error;
    }
  };

  // Debug: log demoMode changes
  useEffect(() => {
    console.log('🔍 ImpactView - demoMode:', demoMode);
  }, [demoMode]);

  // If showing all campaigns view, render that instead (AFTER all hooks)
  if (showAllCampaigns) {
    return <AllCampaignsView onBack={() => setShowAllCampaigns(false)} />;
  }

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

      {/* DUEL ARENA Entry Card - Using same style as Active Allies */}
      <PixelCard className="relative bg-white" data-tour-id="duel-arena">
        {/* Top row: Balance left, PVP Arena right */}
        <div className="flex items-center justify-between px-5 pt-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-gray-500 uppercase">{t('duel', 'balance')}:</span>
            <div className="bg-green-500 text-white px-2 py-0.5 font-mono text-xs font-bold">
              {userCredits === null ? '...' : `$${userCredits}`}
            </div>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            <span className="font-mono text-[10px] font-bold text-red-500 tracking-wider">{t('duel', 'pvp_arena')}</span>
          </div>
        </div>

        {/* Main Content - Compact (25% shorter) */}
        <div className="pt-3 pb-3 px-5">
          <div className="flex items-center justify-between gap-4 mb-2">
            {/* Left: Title */}
            <div className="flex-1">
              <h2 className="font-pixel text-3xl leading-none mb-2">{t('duel', 'duel_mode')}</h2>

              {/* Preview Button */}
              <button className="bg-gray-600 text-white px-3 py-1 font-mono text-[10px] font-bold uppercase mb-2">
                {t('duel', 'preview')}
              </button>

              {/* Description - Match style with Active Allies description */}
              <p className="font-mono text-[10px] text-gray-500 leading-relaxed">
                {t('duel', 'duel_description')}
              </p>
            </div>

            {/* Right: Icon */}
            <div className="w-14 h-14 border-2 border-black flex items-center justify-center bg-white shrink-0">
              <Swords size={32} strokeWidth={2} className="text-black" />
            </div>
          </div>

          {/* Feature Tags - Redesigned to match overall UI */}
          <div className="flex gap-2 mb-3 text-[10px] font-mono text-gray-500">
            <div className="flex items-center gap-1">
              <Zap size={12} strokeWidth={2} />
              <span className="font-bold uppercase">{t('duel', 'fast')}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Target size={12} strokeWidth={2} />
              <span className="font-bold uppercase">{t('duel', 'global')}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Shield size={12} strokeWidth={2} />
              <span className="font-bold uppercase">{t('duel', 'safe')}</span>
            </div>
          </div>

          {/* ENTER ARENA Button - Smaller */}
          <button
            onClick={() => setShowDuelModal(true)}
            className="w-full bg-black text-white hover:bg-gray-800 transition-colors py-2.5 font-mono text-sm font-bold uppercase tracking-wide border-2 border-black shadow-pixel mb-2"
          >
            {t('duel', 'enter_arena')}
          </button>

          {/* Deposit and Withdraw Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setWalletInitialTab('DEPOSIT');
                setShowWalletModal(true);
              }}
              className="border-2 border-black bg-white hover:bg-gray-100 transition-colors py-2 flex items-center justify-center gap-1 font-mono text-xs font-bold uppercase"
            >
              <ArrowUpRight size={12} className="rotate-180" />
              {t('duel', 'deposit')}
            </button>
            <button
              onClick={() => {
                setWalletInitialTab('WITHDRAW');
                setShowWalletModal(true);
              }}
              className="border-2 border-black bg-white hover:bg-gray-100 transition-colors py-2 flex items-center justify-center gap-1 font-mono text-xs font-bold uppercase"
            >
              <ArrowUpRight size={12} />
              {t('duel', 'withdraw')}
            </button>
          </div>
        </div>
      </PixelCard>

      {/* Active Campaigns Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-end px-1">
            <h3 className="font-pixel text-2xl">{t('union', 'active_fronts')}</h3>
            <button
              onClick={() => setShowAllCampaigns(true)}
              className="font-mono text-xs underline cursor-pointer hover:text-gray-600 transition-colors"
            >
              {t('union', 'view_all')}
            </button>
        </div>

        {campaigns.slice(0, 4).map((campaign: Campaign) => (
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

            <p className="mt-4 font-mono text-[10px] text-gray-500 leading-relaxed">
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
            
            <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCampaignForDetail(campaign);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-black bg-white hover:bg-gray-100 transition-colors font-mono text-xs font-bold uppercase"
                >
                    <Info size={14} className="inline mr-2"/>
                    DETAILS
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAmplify(campaign.id);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-black bg-black text-white hover:bg-gray-800 transition-colors font-mono text-xs font-bold uppercase"
                >
                    AMPLIFY IMPACT <ArrowUpRight size={14} className="ml-2 inline"/>
                </button>
            </div>
          </PixelCard>
        ))}
      </div>

      {/* REDESIGNED Impact Stats Dashboard - Black & White Theme */}
      <PixelCard className="!p-0">
        {/* Header */}
        <div className="p-6 border-b-2 border-black bg-gray-50 relative z-10">
            <div className="flex justify-between items-end">
                <h3 className="font-pixel text-3xl tracking-wide">{t('union', 'your_impact')}</h3>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {t('union', 'ledger')}
                </div>
            </div>
        </div>
            
        {/* Personal Stats Row */}
        <div className="grid grid-cols-3 divide-x-2 divide-black text-center py-6 relative z-10">
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

        {/* Connector - Clickable to toggle collapse */}
        <button
          onClick={() => setIsCollectiveStatsExpanded(!isCollectiveStatsExpanded)}
          className="w-full bg-black text-white py-2 text-center border-y-2 border-black hover:bg-gray-900 transition-colors cursor-pointer relative z-10"
        >
             <div className="text-[10px] font-mono tracking-[0.3em] flex items-center justify-center gap-4">
                <span className={`transition-transform duration-200 ${isCollectiveStatsExpanded ? '' : 'rotate-180'}`}>▼</span>
                {t('union', 'amplified')}
                <span className={`transition-transform duration-200 ${isCollectiveStatsExpanded ? '' : 'rotate-180'}`}>▼</span>
             </div>
        </button>

        {/* Collective Stats - Typography Focused (Collapsible) */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out relative z-10 ${isCollectiveStatsExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
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
        </div>
      </PixelCard>

      {/* Campaign Detail Modal */}
      {selectedCampaignForDetail && (
        <CampaignDetailModal
          campaign={selectedCampaignForDetail}
          onClose={() => setSelectedCampaignForDetail(null)}
          onAmplify={() => {
            setSelectedCampaign(selectedCampaignForDetail);
            setSelectedCampaignForDetail(null);
          }}
          onProposeActivity={() => {
            setSelectedCampaignForProposal(selectedCampaignForDetail);
            setSelectedCampaignForDetail(null);
          }}
        />
      )}

      {/* Propose Offline Activity Modal */}
      {selectedCampaignForProposal && (
        <ProposeOfflineActivityModal
          campaign={selectedCampaignForProposal}
          onClose={() => setSelectedCampaignForProposal(null)}
          onSubmit={handleProposeActivity}
        />
      )}

      {/* LOG ACTION Modal */}
      {selectedCampaign && (
        <LogActionModal
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onSubmit={handleActionSubmit}
        />
      )}

      {/* DUEL Modal */}
      {showDuelModal && user && userCredits !== null && (
        <DuelModal
          isOpen={showDuelModal}
          onClose={() => setShowDuelModal(false)}
          userCredits={userCredits}
          userPersonaLabel={userProfile?.coordinates?.label || user.displayName || 'Unknown'}
          userStanceType={userProfile?.coordinates?.coreStanceType || 'moderate-centrist'}
          userCoordinates={userProfile?.coordinates}
          onCreditsChange={(newBalance: number) => setUserCredits(newBalance)}
        />
      )}

      {/* WALLET Modal */}
      {showWalletModal && userCredits !== null && (
        <WalletModal
          isOpen={showWalletModal}
          onClose={() => setShowWalletModal(false)}
          currentBalance={userCredits}
          initialTab={walletInitialTab}
          onDeposit={async (amount: number) => {
            try {
              const result = await addCredits(amount);
              if (result) {
                setUserCredits(result.balance);
                console.log(`Deposited $${amount}, new balance: $${result.balance}`);
                return { success: true, newBalance: result.balance };
              }
              return { success: false, error: 'Failed to deposit credits' };
            } catch (error) {
              console.error('Deposit failed:', error);
              return { success: false, error: error instanceof Error ? error.message : 'Deposit failed' };
            }
          }}
          onWithdraw={async (amount: number) => {
            try {
              const result = await withdrawCredits(amount);
              if (result) {
                setUserCredits(result.balance);
                console.log(`Withdrew $${amount}, new balance: $${result.balance}`);
                return { success: true, newBalance: result.balance };
              }
              return { success: false, error: 'Failed to withdraw credits' };
            } catch (error) {
              console.error('Withdraw failed:', error);
              return { success: false, error: error instanceof Error ? error.message : 'Withdraw failed' };
            }
          }}
        />
      )}
    </div>
  );
};
