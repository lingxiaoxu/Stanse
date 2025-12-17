
import React, { useState, useEffect, useCallback } from 'react';
import { Layers, TrendingUp, TrendingDown, RefreshCw, ChevronDown } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { ValuesCompanyRanking } from '../ui/ValuesCompanyRanking';
import { NewsEvent } from '../../types';
import { generatePrismSummary, fetchPersonalizedNews, translatePersonaLabel, cleanAndRepopulateNews } from '../../services/geminiService';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { CompanyRanking } from '../../services/companyRankingCache';
import { useAppState } from '../../contexts/AppStateContext';

// Stock price interface for market alignment display
interface MarketStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  alignment: 'HIGH' | 'LOW';
}

export const FeedView: React.FC = () => {
  const [activePrism, setActivePrism] = useState<string | null>(null);
  const [prismData, setPrismData] = useState<Record<string, any>>({});
  const [loadingPrism, setLoadingPrism] = useState(false);
  const { t, language } = useLanguage();
  const { userProfile, hasCompletedOnboarding } = useAuth();

  // Use global state for news loading (persists across tab switches)
  const {
    feedNews,
    feedLoading,
    feedProgress,
    feedError,
    setFeedNews,
    setFeedLoading,
    setFeedProgress,
    setFeedError,
    feedLoadingAbortController
  } = useAppState();

  // Translated persona label state
  const [translatedPersona, setTranslatedPersona] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Market alignment stocks (from company rankings)
  const [marketStocks, setMarketStocks] = useState<MarketStock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  // Handle rankings change from ValuesCompanyRanking component
  const handleRankingsChange = useCallback(async (rankings: CompanyRanking) => {
    console.log('Rankings changed, updating market stocks...');
    setLoadingStocks(true);

    try {
      // Combine support and oppose companies
      const allCompanies = [
        ...rankings.supportCompanies.map(c => ({ ...c, alignment: 'HIGH' as const })),
        ...rankings.opposeCompanies.map(c => ({ ...c, alignment: 'LOW' as const }))
      ];

      console.log('Companies for market alignment:', allCompanies.map(c => c.symbol));

      // Fetch real stock prices using Polygon.io API
      const polygonApiKey = process.env.POLYGON_API_KEY;

      const stocksWithPrices: MarketStock[] = await Promise.all(
        allCompanies.slice(0, 10).map(async (company) => {
          // Fallback function for mock prices
          const getMockPrice = () => {
            const hashCode = company.symbol.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
            const basePrice = 50 + Math.abs(hashCode % 300);
            const change = ((hashCode % 100) - 50) / 10;
            return {
              symbol: company.symbol,
              name: company.name,
              price: Math.round(basePrice * 100) / 100,
              change: Math.round(change * 100) / 100,
              alignment: company.alignment
            };
          };

          // If no API key, use mock data
          if (!polygonApiKey) {
            console.warn('No Polygon API key configured, using mock prices');
            return getMockPrice();
          }

          try {
            // Polygon.io Previous Close API - get previous day's close and current day's open
            const response = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${company.symbol}/prev?adjusted=true&apiKey=${polygonApiKey}`
            );

            if (response.ok) {
              const data = await response.json();
              const result = data.results?.[0];

              if (result) {
                const closePrice = result.c || 100; // close price
                const openPrice = result.o || closePrice; // open price
                const change = openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;

                return {
                  symbol: company.symbol,
                  name: company.name,
                  price: Math.round(closePrice * 100) / 100,
                  change: Math.round(change * 100) / 100,
                  alignment: company.alignment
                };
              }
            }
          } catch (e) {
            console.warn(`Failed to fetch price for ${company.symbol}:`, e);
          }

          // Fallback to mock price
          return getMockPrice();
        })
      );

      console.log('Market stocks updated:', stocksWithPrices.map(s => s.symbol));
      setMarketStocks(stocksWithPrices);
    } catch (error) {
      console.error('Error fetching market stocks:', error);
    } finally {
      setLoadingStocks(false);
    }
  }, []);

  // Cache version - increment this to invalidate stale cached data
  const CACHE_VERSION = 'v5'; // Now using Gemini Imagen + curated Unsplash images

  // Local pagination state (not affected by tab switches)
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMoreNews, setHasMoreNews] = useState(true);
  const [lastStanceHash, setLastStanceHash] = useState<string>(() => {
    const cacheVersion = localStorage.getItem('stanse_cache_version');
    if (cacheVersion !== CACHE_VERSION) {
      return ''; // Force refresh
    }
    return localStorage.getItem('stanse_last_stance_hash') || '';
  });

  // Initialize news from localStorage on mount
  useEffect(() => {
    if (feedNews.length === 0) {
      try {
        const cacheVersion = localStorage.getItem('stanse_cache_version');
        if (cacheVersion !== CACHE_VERSION) {
          localStorage.removeItem('stanse_news_cache');
          localStorage.removeItem('stanse_last_stance_hash');
          localStorage.setItem('stanse_cache_version', CACHE_VERSION);
        } else {
          const cached = localStorage.getItem('stanse_news_cache');
          if (cached) {
            setFeedNews(JSON.parse(cached));
          }
        }
      } catch (e) {
        console.warn('Failed to load cached news:', e);
      }
    }
  }, []);

  // Create a hash of the user's stance to detect changes
  const getStanceHash = useCallback(() => {
    if (!userProfile?.coordinates) return '';
    const { economic, social, diplomatic, label } = userProfile.coordinates;
    return `${economic}-${social}-${diplomatic}-${label}`;
  }, [userProfile]);

  // Fetch news when stance changes or on initial load (with progress tracking)
  const fetchNews = useCallback(async (page: number = 0, append: boolean = false) => {
    if (!userProfile?.coordinates || !hasCompletedOnboarding) return;

    // Create new AbortController for this fetch
    const abortController = new AbortController();
    feedLoadingAbortController.current = abortController;

    setFeedLoading(true);
    setFeedError(null);
    setFeedProgress(0);

    try {
      // Simulate progress updates during fetch
      const progressInterval = setInterval(() => {
        setFeedProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const fetchedNews = await fetchPersonalizedNews(userProfile.coordinates, page);

      clearInterval(progressInterval);

      // Check if this fetch was aborted
      if (abortController.signal.aborted) {
        console.log('News fetch was aborted');
        return;
      }

      setFeedProgress(100);

      const newStanceHash = getStanceHash();

      if (append) {
        setFeedNews(prev => {
          const updated = [...prev, ...fetchedNews];
          localStorage.setItem('stanse_news_cache', JSON.stringify(updated));
          return updated;
        });
      } else {
        setFeedNews(fetchedNews);
        localStorage.setItem('stanse_news_cache', JSON.stringify(fetchedNews));
      }

      setHasMoreNews(fetchedNews.length === 5);
      setCurrentPage(page);
      setLastStanceHash(newStanceHash);
      localStorage.setItem('stanse_last_stance_hash', newStanceHash);
    } catch (error: any) {
      if (abortController.signal.aborted) {
        console.log('News fetch was aborted during error');
        return;
      }
      console.error('Error fetching news:', error);
      setFeedError(error.message || 'Failed to load news');
      setFeedProgress(0);
    } finally {
      if (!abortController.signal.aborted) {
        setFeedLoading(false);
      }
    }
  }, [userProfile, hasCompletedOnboarding, getStanceHash, feedLoadingAbortController, setFeedLoading, setFeedError, setFeedProgress, setFeedNews]);

  // Initial load and stance change detection
  useEffect(() => {
    const currentHash = getStanceHash();
    if (currentHash && currentHash !== lastStanceHash) {
      fetchNews(0, false);
    }
  }, [getStanceHash, lastStanceHash, fetchNews]);

  // Translate persona label when language changes - with localStorage caching
  useEffect(() => {
    if (!hasCompletedOnboarding || !userProfile?.coordinates) {
      return;
    }

    const label = userProfile.coordinates.label;
    const cacheKey = `stanse_persona_${label}_${language.toLowerCase()}`;

    // Check localStorage cache first - ALWAYS check on mount
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        console.log('[PersonaCache] Cache hit from localStorage:', cached);
        setTranslatedPersona(cached);
        setIsTranslating(false);
        return;
      }
    } catch (e) {
      console.warn('[PersonaCache] Failed to read cache');
    }

    // Cache miss - need to translate
    console.log('[PersonaCache] Cache miss, translating...');
    setIsTranslating(true);
    translatePersonaLabel(userProfile.coordinates, language)
      .then((translated) => {
        setTranslatedPersona(translated);
        setIsTranslating(false);
        // Save to localStorage with specific key
        try {
          localStorage.setItem(cacheKey, translated);
          console.log('[PersonaCache] Translation cached:', translated);
        } catch (e) {
          console.warn('[PersonaCache] Failed to cache translation');
        }
      })
      .catch((err) => {
        console.error('Persona translation error:', err);
        setIsTranslating(false);
      });
  }, [language, hasCompletedOnboarding, userProfile?.coordinates?.label]);

  // Load more news (pagination)
  const loadMoreNews = () => {
    if (!feedLoading && hasMoreNews) {
      fetchNews(currentPage + 1, true);
    }
  };

  // Refresh news - cleans old news and fetches fresh real news
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshNews = async () => {
    if (!userProfile?.coordinates) return;

    setIsRefreshing(true);
    setFeedError(null);

    try {
      console.log('Refreshing news: cleaning and fetching real news...');
      const result = await cleanAndRepopulateNews(userProfile.coordinates);
      console.log(`Refresh complete: deleted ${result.deleted}, fetched ${result.fetched}`);

      // Clear local cache
      localStorage.removeItem('stanse_news_cache');
      localStorage.removeItem('stanse_last_stance_hash');

      // Refresh the feed
      setCurrentPage(0);
      await fetchNews(0, false);
    } catch (error: any) {
      console.error('Error refreshing news:', error);
      setFeedError(error.message || 'Failed to refresh news');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePrismClick = async (newsItem: NewsEvent) => {
    if (activePrism === newsItem.id) {
      setActivePrism(null);
      return;
    }

    setActivePrism(newsItem.id);

    if (!prismData[newsItem.id]) {
      setLoadingPrism(true);
      const prism = await generatePrismSummary(newsItem.title + " " + newsItem.summary);
      setPrismData(prev => ({ ...prev, [newsItem.id]: prism }));
      setLoadingPrism(false);
    }
  };

  return (
    <div className="max-w-md mx-auto w-full pb-20">

      {/* SECTION 1: MARKET INDEX (Independent Area) */}
      <div className="mb-12 relative">
         <div className="flex items-center justify-center mb-3 gap-2 text-gray-500">
            <TrendingUp size={14} />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase">{t('feed', 'market')}</span>
         </div>

         {/* CSS Hiding Scrollbars inline for this specific container & Enforcing no vertical scroll */}
         <style>
            {`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .horizontal-snap {
                    overflow-y: hidden;
                    touch-action: pan-x;
                }
            `}
         </style>

         <PixelCard className="p-0 bg-white/50 backdrop-blur-sm">
             {loadingStocks && marketStocks.length === 0 ? (
               <div className="p-4 text-center">
                 <div className="font-mono text-xs text-gray-500 animate-pulse">Loading market data...</div>
               </div>
             ) : marketStocks.length === 0 ? (
               <div className="p-4 text-center">
                 <div className="font-pixel text-sm animate-pulse uppercase">{t('feed', 'onboarding_required_market')}</div>
               </div>
             ) : (
               <div className="flex overflow-x-auto no-scrollbar snap-x horizontal-snap">
                  {marketStocks.map((stock, i) => (
                      <div key={`${stock.symbol}-${i}`} className={`
                          flex-shrink-0 flex flex-col p-4 border-r-2 border-black w-32
                          ${stock.alignment === 'HIGH' ? 'bg-white' : 'bg-gray-100'}
                          first:pl-4 last:border-r-0 snap-start
                      `}>
                          <div className="flex justify-between items-start gap-2 mb-2">
                              <span className="font-bold font-mono text-sm">{stock.symbol}</span>
                              {stock.change >= 0 ? <TrendingUp size={14} className="text-black"/> : <TrendingDown size={14} className="text-gray-500"/>}
                          </div>
                          <div className="font-pixel text-2xl leading-none mb-1">${stock.price}</div>
                          <div className={`text-[10px] font-mono font-bold ${stock.change >= 0 ? 'text-black' : 'text-gray-400'}`}>
                              {stock.change >= 0 ? '+' : ''}{stock.change}%
                          </div>
                      </div>
                  ))}
               </div>
             )}
         </PixelCard>
      </div>

      {/* SECTION 1.5: VALUES COMPANY RANKING */}
      <ValuesCompanyRanking onRankingsChange={handleRankingsChange} />

      {/* SECTION 2: THE FEED */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-4">
          <h2 className="font-pixel text-5xl">{t('feed', 'title')}</h2>
          {hasCompletedOnboarding && (
            <button
              onClick={refreshNews}
              disabled={feedLoading || isRefreshing}
              className="p-2 border-2 border-black bg-white hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Refresh news"
            >
              <RefreshCw size={16} className={(feedLoading || isRefreshing) ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        <p className="font-mono text-xs text-gray-400">{t('feed', 'subtitle')}</p>
        {userProfile?.coordinates?.label && (
          <p className="font-mono text-[10px] text-gray-500 mt-1">
            Curated for: {translatedPersona || userProfile.coordinates.label}
          </p>
        )}
        {/* Progress percentage */}
        {feedLoading && feedProgress > 0 && feedProgress < 100 && (
          <p className="font-mono text-xs text-gray-500 mt-2">
            {feedProgress}%
          </p>
        )}
      </div>

      {/* Not onboarded message */}
      {!hasCompletedOnboarding && (
        <PixelCard className="text-center py-8">
          <p className="font-mono text-xs text-gray-400 uppercase tracking-wider">{t('feed', 'onboarding_required_news')}</p>
        </PixelCard>
      )}

      {/* Loading state */}
      {feedLoading && feedNews.length === 0 && (
        <div className="text-center py-12">
          <div className="font-pixel text-2xl animate-pulse mb-2">LOADING...</div>
          <p className="font-mono text-xs text-gray-500">Searching for news aligned with your stance</p>
        </div>
      )}

      {/* Error state */}
      {feedError && (
        <PixelCard className="text-center py-8 bg-red-50">
          <p className="font-mono text-sm text-red-600 mb-2">{feedError}</p>
          <PixelButton variant="secondary" onClick={refreshNews} className="text-xs">
            Try Again
          </PixelButton>
        </PixelCard>
      )}

      {/* Feed List Container with Local Relative Positioning for Timeline */}
      {feedNews.length > 0 && (
        <div className="relative pl-6">
          {/* Timeline Line */}
          <div className="absolute left-[3px] top-2 bottom-6 w-0.5 bg-pixel-black opacity-20 z-0"></div>

          <div className="space-y-12 relative z-10">
              {feedNews.map((newsItem) => (
              <div key={newsItem.id} className="relative">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[24px] top-6 w-3 h-3 bg-black border-2 border-white box-content"></div>

                  <PixelCard className="hover:translate-x-1 transition-transform duration-200 mb-0">
                  <div className="relative h-32 w-full border-b-2 border-black mb-3 overflow-hidden group bg-gray-200">
                      <img
                        src={newsItem.imageUrl}
                        alt={newsItem.title}
                        className="w-full h-full object-cover filter grayscale contrast-125 group-hover:scale-105 transition-transform duration-700"
                        onError={(e) => {
                          // Fallback when image fails to load: show a geometric pattern
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.fallback-pattern')) {
                            const fallback = document.createElement('div');
                            fallback.className = 'fallback-pattern w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center';
                            fallback.innerHTML = '<div class="text-6xl opacity-20">📰</div>';
                            parent.insertBefore(fallback, parent.firstChild);
                          }
                        }}
                      />
                      <div className="absolute top-2 right-2 bg-white px-2 py-1 text-xs font-bold border-2 border-black">
                      {newsItem.date}
                      </div>
                      {newsItem.category && (
                        <div className="absolute top-2 left-2 bg-black text-white px-2 py-1 text-[10px] font-mono">
                          {newsItem.category}
                        </div>
                      )}
                  </div>

                  <h3 className="font-bold text-xl mb-2 leading-tight">{newsItem.title}</h3>
                  <p className="text-sm text-gray-600 mb-4 font-mono">{newsItem.summary}</p>

                  <div className="flex justify-end items-center">
                      <PixelButton
                      variant="secondary"
                      className="text-xs px-3 py-1 flex items-center gap-2"
                      onClick={() => handlePrismClick(newsItem)}
                      >
                      <Layers size={14} />
                      {activePrism === newsItem.id ? t('feed', 'close_lens') : t('feed', 'lens')}
                      </PixelButton>
                  </div>

                  {/* AI Prism Expansion */}
                  {activePrism === newsItem.id && (
                      <div className="mt-4 pt-4 border-t-2 border-black animate-fade-in">
                      {loadingPrism ? (
                          <div className="text-center py-4 font-pixel text-gray-500 animate-pulse">{t('feed', 'loading_lens')}</div>
                      ) : (
                          <div className="space-y-3 font-mono text-xs">
                          <div className="flex gap-2 items-start">
                              <div className="min-w-[4px] h-full bg-black self-stretch"></div>
                              <div><span className="font-bold bg-black text-white px-1">{t('feed', 'support')}</span> <p className="mt-1">{prismData[newsItem.id]?.support}</p></div>
                          </div>
                          <div className="flex gap-2 items-start">
                              <div className="min-w-[4px] h-full bg-gray-400 self-stretch"></div>
                              <div><span className="font-bold bg-gray-200 text-black px-1">{t('feed', 'neutral')}</span> <p className="mt-1">{prismData[newsItem.id]?.neutral}</p></div>
                          </div>
                          <div className="flex gap-2 items-start">
                              <div className="min-w-[4px] h-full bg-white border border-black self-stretch"></div>
                              <div><span className="font-bold border border-black px-1">{t('feed', 'oppose')}</span> <p className="mt-1">{prismData[newsItem.id]?.oppose}</p></div>
                          </div>
                          </div>
                      )}
                      </div>
                  )}
                  </PixelCard>
              </div>
              ))}
          </div>

          {/* Load More Button */}
          {hasMoreNews && feedNews.length >= 5 && (
            <div className="mt-8 text-center">
              <PixelButton
                variant="secondary"
                onClick={loadMoreNews}
                disabled={feedLoading}
                className="flex items-center gap-2 mx-auto"
              >
                <ChevronDown size={16} />
                {feedLoading ? 'Loading...' : 'Load More'}
              </PixelButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
