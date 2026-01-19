
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Sparkles, ThumbsUp, ThumbsDown, Info } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { ValuesCompanyRanking } from '../ui/ValuesCompanyRanking';
import { NewsEvent } from '../../types';
import { generatePrismSummary, fetchPersonalizedNews, translatePersonaLabel } from '../../services/geminiService';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { CompanyRanking } from '../../services/companyRankingCache';
import { useAppState } from '../../contexts/AppStateContext';
import { getEnhancedCompanyRankingsForUser } from '../../services/enhancedCompanyRankingService';
import { generateTodayAnalysis, MarketAnalysisResult } from '../../services/marketAnalysisService';

import { Language } from '../../types';

// Locale mapping for date formatting
const LOCALE_MAP: Record<Language, string> = {
  [Language.EN]: 'en-US',
  [Language.ZH]: 'zh-CN',
  [Language.JA]: 'ja-JP',
  [Language.FR]: 'fr-FR',
  [Language.ES]: 'es-ES'
};

// Stock price interface for market alignment display
interface MarketStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  alignment: 'HIGH' | 'LOW';
}

// Extract political persona type from full label (removes nationality prefix)
// Works for all languages by counting words in the English nationalityPrefix
const extractPoliticalPersona = (label: string, nationalityPrefix?: string): string => {
  // For English: if label starts with nationalityPrefix, just remove it
  if (nationalityPrefix && label.startsWith(nationalityPrefix)) {
    return label.slice(nationalityPrefix.length).trim();
  }

  // For translated labels: count how many space-separated parts are in the nationality
  // English nationalityPrefix examples:
  // - "Spanish-American" (1 word with hyphen) -> skip 1 word in translation
  // - "Chinese American" (2 words) -> skip 2 words in translation
  // - "American" (1 word) -> skip 1 word in translation
  if (nationalityPrefix) {
    const prefixWordCount = nationalityPrefix.split(' ').length;
    const labelParts = label.split(' ');
    if (labelParts.length > prefixWordCount) {
      return labelParts.slice(prefixWordCount).join(' ');
    }
  }

  // Fallback for English labels with hyphenated nationality
  const parts = label.split(' ');
  if (parts.length > 1 && parts[0].includes('-')) {
    return parts.slice(1).join(' ');
  }

  return label;
};

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
  const [marketProgress, setMarketProgress] = useState(0);
  const [refreshingRankings, setRefreshingRankings] = useState(false);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<Date | null>(null);

  // Company rankings for REPRESENTATIVE POSITIONS section
  const [rankings, setRankings] = useState<CompanyRanking | null>(null);

  // WHY TODAY? analysis state
  const [todayAnalysis, setTodayAnalysis] = useState<MarketAnalysisResult | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Hover state for market stocks auto-scroll
  const [isStocksHovered, setIsStocksHovered] = useState(false);

  // Click-based tooltip state
  const [activeTooltip, setActiveTooltip] = useState<'support' | 'oppose' | 'performance' | 'persona' | null>(null);

  // Collapsible section states (default expanded)
  const [isMarketSignalExpanded, setIsMarketSignalExpanded] = useState(true);
  const [isPositionsExpanded, setIsPositionsExpanded] = useState(true);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(true);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const stocksContainerRef = useRef<HTMLDivElement>(null);
  const stocksScrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Refresh rankings handler
  const handleRefreshRankings = async () => {
    if (!userProfile?.coordinates) return;

    setRefreshingRankings(true);

    try {
      const { economic, social, diplomatic } = userProfile.coordinates;
      // Force refresh by calling with forceRefresh = true
      const result = await getEnhancedCompanyRankingsForUser(economic, social, diplomatic, true);
      // Update market stocks with the new rankings
      await handleRankingsChange(result);
    } catch (err: any) {
      console.error('Error refreshing rankings:', err);
    } finally {
      setRefreshingRankings(false);
    }
  };

  // Handle rankings change from ValuesCompanyRanking component
  const handleRankingsChange = useCallback(async (newRankings: CompanyRanking) => {
    console.log('Rankings changed, updating market stocks...');
    setLoadingStocks(true);
    setMarketProgress(0);
    setRankings(newRankings); // Store rankings for REPRESENTATIVE POSITIONS section

    try {
      // Combine support and oppose companies
      const allCompanies = [
        ...newRankings.supportCompanies.map(c => ({ ...c, alignment: 'HIGH' as const })),
        ...newRankings.opposeCompanies.map(c => ({ ...c, alignment: 'LOW' as const }))
      ];

      console.log('Companies for market alignment:', allCompanies.map(c => c.symbol));

      // Fetch real stock prices using Polygon.io API
      const polygonApiKey = process.env.POLYGON_API_KEY;
      const companiesToFetch = allCompanies.slice(0, 10);
      const totalSteps = companiesToFetch.length + 1; // +1 for WHY TODAY analysis
      let completedSteps = 0;

      const stocksWithPrices: MarketStock[] = [];

      for (let i = 0; i < companiesToFetch.length; i++) {
        const company = companiesToFetch[i];

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

        let stockData: MarketStock;

        // If no API key, use mock data
        if (!polygonApiKey) {
          console.warn('No Polygon API key configured, using mock prices');
          stockData = getMockPrice();
        } else {
          try {
            // Polygon.io Snapshot API - get current price and day-over-day change
            const response = await fetch(
              `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${company.symbol}?apiKey=${polygonApiKey}`
            );

            if (response.ok) {
              const data = await response.json();
              const ticker = data.ticker;

              if (ticker) {
                // day contains current day's aggregates, prevDay contains previous day's aggregates
                const currentPrice = ticker.day?.c || ticker.lastTrade?.p || ticker.prevDay?.c || 100;
                const todaysChangePercent = ticker.todaysChangePerc || 0;

                stockData = {
                  symbol: company.symbol,
                  name: company.name,
                  price: Math.round(currentPrice * 100) / 100,
                  change: Math.round(todaysChangePercent * 100) / 100,
                  alignment: company.alignment
                };
              } else {
                stockData = getMockPrice();
              }
            } else {
              stockData = getMockPrice();
            }
          } catch (e) {
            console.warn(`Failed to fetch price for ${company.symbol}:`, e);
            stockData = getMockPrice();
          }
        }

        stocksWithPrices.push(stockData);

        // Update progress (stocks are 90% of total progress, analysis is 10%)
        completedSteps++;
        setMarketProgress(Math.round((completedSteps / totalSteps) * 90));
      }

      console.log('Market stocks updated:', stocksWithPrices.map(s => s.symbol));
      setMarketStocks(stocksWithPrices);
      setMarketUpdatedAt(new Date());

      // Generate WHY TODAY? analysis after stocks are loaded
      if (stocksWithPrices.length > 0 && userProfile?.coordinates?.label) {
        setLoadingAnalysis(true);
        try {
          const personaLabel = translatedPersona || userProfile.coordinates.label;
          const nationalityPrefix = userProfile.coordinates.nationalityPrefix;
          const politicalPersona = extractPoliticalPersona(personaLabel, nationalityPrefix);

          const analysis = await generateTodayAnalysis(stocksWithPrices, politicalPersona, language);
          setTodayAnalysis(analysis);
        } catch (error) {
          console.error('Error generating today analysis:', error);
        } finally {
          setLoadingAnalysis(false);
          setMarketProgress(100); // Analysis complete
        }
      } else {
        setMarketProgress(100); // No analysis needed, mark as complete
      }
    } catch (error) {
      console.error('Error fetching market stocks:', error);
    } finally {
      setLoadingStocks(false);
    }
  }, [userProfile?.coordinates?.label, userProfile?.coordinates?.nationalityPrefix, translatedPersona, language]);

  // Auto-scroll effect for stock ticker
  useEffect(() => {
    const scrollContainer = stocksScrollRef.current;
    if (!scrollContainer || marketStocks.length === 0) return;

    const stockWidth = 79.3; // Width of each stock card
    const totalWidth = stockWidth * marketStocks.length;
    const speed = 0.5; // pixels per frame (~30px per second at 60fps)

    const animate = () => {
      if (!isStocksHovered && scrollContainer) {
        scrollPositionRef.current += speed;
        // Reset when we've scrolled through the first set
        if (scrollPositionRef.current >= totalWidth) {
          scrollPositionRef.current = 0;
        }
        scrollContainer.style.transform = `translateX(-${scrollPositionRef.current}px)`;
        updateScrollIndicators();
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [marketStocks.length, isStocksHovered]);

  // Update scroll indicators based on current position
  const updateScrollIndicators = useCallback(() => {
    const stockWidth = 79.3;
    const totalWidth = stockWidth * marketStocks.length;
    const containerWidth = stocksContainerRef.current?.clientWidth || 400;

    // Can scroll left if not at start
    setCanScrollLeft(scrollPositionRef.current > 0);
    // Can scroll right if not at end of first set
    setCanScrollRight(scrollPositionRef.current < totalWidth - containerWidth);
  }, [marketStocks.length]);

  // Manual scroll animation refs
  const manualScrollRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);

  // Smooth scroll animation function
  const smoothScrollTo = useCallback((targetPosition: number, duration: number = 300) => {
    const startPosition = scrollPositionRef.current;
    const distance = targetPosition - startPosition;
    const startTime = performance.now();

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);

      scrollPositionRef.current = startPosition + distance * easeOut;
      if (stocksScrollRef.current) {
        stocksScrollRef.current.style.transform = `translateX(-${scrollPositionRef.current}px)`;
      }
      updateScrollIndicators();

      if (progress < 1) {
        manualScrollRef.current = requestAnimationFrame(animateScroll);
      }
    };

    if (manualScrollRef.current) {
      cancelAnimationFrame(manualScrollRef.current);
    }
    manualScrollRef.current = requestAnimationFrame(animateScroll);
  }, [updateScrollIndicators]);

  // Continuous scroll for hold (mobile touch)
  const startContinuousScroll = useCallback((direction: 'left' | 'right') => {
    isHoldingRef.current = true;
    const stockWidth = 79.3;
    const totalWidth = stockWidth * marketStocks.length;
    const speed = 2; // pixels per frame

    const scroll = () => {
      if (!isHoldingRef.current) return;

      if (direction === 'left') {
        scrollPositionRef.current = Math.max(0, scrollPositionRef.current - speed);
      } else {
        scrollPositionRef.current = Math.min(totalWidth - 1, scrollPositionRef.current + speed);
      }

      if (stocksScrollRef.current) {
        stocksScrollRef.current.style.transform = `translateX(-${scrollPositionRef.current}px)`;
      }
      updateScrollIndicators();

      manualScrollRef.current = requestAnimationFrame(scroll);
    };

    manualScrollRef.current = requestAnimationFrame(scroll);
  }, [marketStocks.length, updateScrollIndicators]);

  const stopContinuousScroll = useCallback(() => {
    isHoldingRef.current = false;
    if (manualScrollRef.current) {
      cancelAnimationFrame(manualScrollRef.current);
      manualScrollRef.current = null;
    }
  }, []);

  // Click handlers for desktop (smooth scroll by 2 cards)
  const handleScrollLeft = useCallback(() => {
    const stockWidth = 79.3;
    const targetPosition = Math.max(0, scrollPositionRef.current - stockWidth * 2);
    smoothScrollTo(targetPosition);
  }, [smoothScrollTo]);

  const handleScrollRight = useCallback(() => {
    const stockWidth = 79.3;
    const totalWidth = stockWidth * marketStocks.length;
    const targetPosition = Math.min(totalWidth - 1, scrollPositionRef.current + stockWidth * 2);
    smoothScrollTo(targetPosition);
  }, [marketStocks.length, smoothScrollTo]);

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

      // Map language enum to string code
      const languageCode = language.toLowerCase();
      const fetchedNews = await fetchPersonalizedNews(
        userProfile.coordinates,
        page,
        undefined,
        languageCode,
        userProfile.id  // Pass userId for persona embedding
      );

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

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setActiveTooltip(null);
      }
    };

    if (activeTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeTooltip]);

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

  // Refresh news - fetches fresh news for current language WITHOUT deleting others
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshNews = async () => {
    if (!userProfile?.coordinates) return;

    setIsRefreshing(true);
    setFeedError(null);

    try {
      console.log('Refreshing news for current language...');

      // Clear local cache to force fetch
      localStorage.removeItem('stanse_news_cache');
      localStorage.removeItem('stanse_last_stance_hash');

      // Refresh the feed (will fetch news in current language)
      setCurrentPage(0);
      await fetchNews(0, false);

      console.log('Refresh complete!');
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

      {/* VALUES MARKET ALIGNMENT - Combined Sections */}
      <div className="mb-12 relative">
         <div className="text-center mb-3" data-tour-id="market-signal">
           <div className="flex items-center justify-center gap-4">
             <h2 className="font-pixel text-5xl">{t('feed', 'market_title')}</h2>
             {hasCompletedOnboarding && (
               <button
                 onClick={handleRefreshRankings}
                 disabled={loadingStocks || refreshingRankings}
                 className="p-2 border-2 border-black bg-white hover:bg-gray-100 transition-colors disabled:opacity-50"
                 title="Refresh rankings"
               >
                 <RefreshCw size={16} className={(loadingStocks || refreshingRankings) ? 'animate-spin' : ''} />
               </button>
             )}
           </div>
           <p className="font-mono text-xs text-gray-400">{t('feed', 'market_subtitle')}</p>
           {userProfile?.coordinates?.label && (
             <p className="font-mono text-[10px] text-gray-500 mt-1">
               {t('feed', 'aligned_with')}: {translatedPersona || userProfile.coordinates.label}
             </p>
           )}
           {/* Progress percentage for loading stocks - fixed height to prevent layout jump */}
           <div className="h-5 mt-2">
             {(loadingStocks || refreshingRankings) && marketProgress > 0 && marketProgress < 100 && (
               <p className="font-mono text-xs text-gray-500">
                 {marketProgress}%
               </p>
             )}
           </div>
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
               <>
               {/* MARKET SIGNAL Section Header - Collapsible */}
               <button
                 onClick={() => setIsMarketSignalExpanded(!isMarketSignalExpanded)}
                 className="w-full px-4 py-4 border-b-2 border-black bg-white hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between"
               >
                 <h3 className="font-pixel text-2xl">{t('feed', 'market_signal')}</h3>
                 <span className={`transition-transform duration-200 text-black ${isMarketSignalExpanded ? '' : 'rotate-180'}`}>▼</span>
               </button>

               {/* MARKET SIGNAL Content - Collapsible */}
               <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isMarketSignalExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
               {/* Persona label bar */}
               <div className="bg-black text-white px-3 py-2 flex items-center gap-2 relative" ref={activeTooltip === 'persona' ? tooltipRef : null}>
                 <span className="font-mono text-[10px] tracking-wider uppercase flex-1">
                   {(() => {
                     const label = translatedPersona || userProfile?.coordinates?.label || 'Your Values';
                     const nationalityPrefix = userProfile?.coordinates?.nationalityPrefix;
                     return extractPoliticalPersona(label, nationalityPrefix);
                   })()}
                 </span>
                 <Info
                   size={12}
                   className="text-gray-400 hover:text-white cursor-pointer flex-shrink-0"
                   onClick={() => setActiveTooltip(activeTooltip === 'persona' ? null : 'persona')}
                 />
                 {activeTooltip === 'persona' && (
                   <div className="absolute right-2 top-full mt-1 z-50 bg-white text-black border-2 border-black px-3 py-2 shadow-pixel-sm max-w-[250px]">
                     <p className="font-mono text-[10px] leading-relaxed">
                       {t('feed', 'persona_tooltip')}
                     </p>
                   </div>
                 )}
               </div>

               {/* VALUES POSITIONING - Three axes visualization (moved up) */}
               <div className="border-t border-gray-200 px-4 py-3 bg-white">
                 <div className="space-y-2">
                   {/* Economic Axis */}
                   <div>
                     <div className="flex justify-between items-center mb-1">
                       <span className="font-mono text-[9px] text-gray-500 uppercase">{t('feed', 'economic_axis')}</span>
                       <span className="font-mono text-[9px] font-bold text-black">
                         {userProfile?.coordinates?.economic !== undefined
                           ? `${userProfile.coordinates.economic > 0 ? t('feed', 'right') : t('feed', 'left')} ${Math.abs(userProfile.coordinates.economic)}`
                           : ''}
                       </span>
                     </div>
                     <div className="h-2 flex">
                       <div
                         className="bg-black h-full"
                         style={{
                           width: `${((userProfile?.coordinates?.economic ?? 0) + 100) / 2}%`
                         }}
                       />
                       <div
                         className="bg-gray-300 h-full"
                         style={{
                           width: `${100 - ((userProfile?.coordinates?.economic ?? 0) + 100) / 2}%`
                         }}
                       />
                     </div>
                     <div className="flex justify-between mt-0.5">
                       <span className="font-mono text-[7px] text-gray-400">{t('feed', 'left')}</span>
                       <span className="font-mono text-[7px] text-gray-400">{t('feed', 'right')} →</span>
                     </div>
                   </div>

                   {/* Social Axis */}
                   <div>
                     <div className="flex justify-between items-center mb-1">
                       <span className="font-mono text-[9px] text-gray-500 uppercase">{t('feed', 'social_axis')}</span>
                       <span className="font-mono text-[9px] font-bold text-black">
                         {userProfile?.coordinates?.social !== undefined
                           ? `${userProfile.coordinates.social > 0 ? t('feed', 'progressive') : t('feed', 'conservative')} ${Math.abs(userProfile.coordinates.social)}`
                           : ''}
                       </span>
                     </div>
                     <div className="h-2 flex">
                       <div
                         className="bg-black h-full"
                         style={{
                           width: `${(-(userProfile?.coordinates?.social ?? 0) + 100) / 2}%`
                         }}
                       />
                       <div
                         className="bg-gray-300 h-full"
                         style={{
                           width: `${100 - (-(userProfile?.coordinates?.social ?? 0) + 100) / 2}%`
                         }}
                       />
                     </div>
                     <div className="flex justify-between mt-0.5">
                       <span className="font-mono text-[7px] text-gray-400">{t('feed', 'progressive')}</span>
                       <span className="font-mono text-[7px] text-gray-400">{t('feed', 'conservative')} →</span>
                     </div>
                   </div>

                   {/* Diplomatic Axis */}
                   <div>
                     <div className="flex justify-between items-center mb-1">
                       <span className="font-mono text-[9px] text-gray-500 uppercase">{t('feed', 'diplomatic_axis')}</span>
                       <span className="font-mono text-[9px] font-bold text-black">
                         {userProfile?.coordinates?.diplomatic !== undefined
                           ? `${userProfile.coordinates.diplomatic > 0 ? t('feed', 'global') : t('feed', 'national')} ${Math.abs(userProfile.coordinates.diplomatic)}`
                           : ''}
                       </span>
                     </div>
                     <div className="h-2 flex">
                       <div
                         className="bg-black h-full"
                         style={{
                           width: `${(-(userProfile?.coordinates?.diplomatic ?? 0) + 100) / 2}%`
                         }}
                       />
                       <div
                         className="bg-gray-300 h-full"
                         style={{
                           width: `${100 - (-(userProfile?.coordinates?.diplomatic ?? 0) + 100) / 2}%`
                         }}
                       />
                     </div>
                     <div className="flex justify-between mt-0.5">
                       <span className="font-mono text-[7px] text-gray-400">{t('feed', 'global')}</span>
                       <span className="font-mono text-[7px] text-gray-400">{t('feed', 'national')} →</span>
                     </div>
                   </div>
                 </div>
               </div>

               {/* Performance bar */}
               <div className="bg-black text-white px-3 py-2 border-t border-gray-700 relative" ref={activeTooltip === 'performance' ? tooltipRef : null}>
                 <div className="flex items-center gap-2 mb-1">
                   {(() => {
                     // Calculate portfolio return: long first 5 (support), short last 5 (oppose), equal weight
                     if (marketStocks.length < 10) return <></>;
                     const supportStocks = marketStocks.slice(0, 5);
                     const opposeStocks = marketStocks.slice(5, 10);
                     const longReturn = supportStocks.reduce((sum, s) => sum + (s.change || 0), 0) / 5;
                     const shortReturn = opposeStocks.reduce((sum, s) => sum - (s.change || 0), 0) / 5;
                     const portfolioReturn = (longReturn + shortReturn) / 2;
                     const isOutperforming = portfolioReturn > 0;

                     return (
                       <>
                         {isOutperforming ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                         <span className="font-mono text-sm font-bold tracking-wider uppercase">
                           {isOutperforming ? t('feed', 'outperforming') : t('feed', 'underperforming')}
                         </span>
                       </>
                     );
                   })()}
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="font-mono text-xs flex-1">
                     {(() => {
                       if (marketStocks.length < 10) return '...';
                       const supportStocks = marketStocks.slice(0, 5);
                       const opposeStocks = marketStocks.slice(5, 10);
                       const longReturn = supportStocks.reduce((sum, s) => sum + (s.change || 0), 0) / 5;
                       const shortReturn = opposeStocks.reduce((sum, s) => sum - (s.change || 0), 0) / 5;
                       const portfolioReturn = (longReturn + shortReturn) / 2;
                       const sign = portfolioReturn >= 0 ? '+' : '';
                       return `${sign}${portfolioReturn.toFixed(2)}% ${t('feed', 'today_long_short')}`;
                     })()}
                   </span>
                   <Info
                     size={12}
                     className="text-gray-400 hover:text-white cursor-pointer flex-shrink-0"
                     onClick={() => setActiveTooltip(activeTooltip === 'performance' ? null : 'performance')}
                   />
                 </div>
                 {activeTooltip === 'performance' && (
                   <div className="absolute right-2 bottom-full mb-1 z-50 bg-white text-black border-2 border-black px-3 py-2 shadow-pixel-sm max-w-[250px]">
                     <p className="font-mono text-[10px] leading-relaxed">
                       {t('feed', 'performance_tooltip')}
                     </p>
                   </div>
                 )}
               </div>
               {/* Auto-scrolling stock ticker with manual controls */}
               <div
                 className="relative"
                 onMouseEnter={() => setIsStocksHovered(true)}
                 onMouseLeave={() => setIsStocksHovered(false)}
               >
                  {/* Left scroll arrow - visible when hovered and can scroll left */}
                  {isStocksHovered && canScrollLeft && (
                    <button
                      onClick={handleScrollLeft}
                      onTouchStart={() => startContinuousScroll('left')}
                      onTouchEnd={stopContinuousScroll}
                      onTouchCancel={stopContinuousScroll}
                      className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-white/90 to-transparent flex items-center justify-start pl-1 hover:from-white"
                    >
                      <ChevronLeft size={16} className="text-black animate-pulse" />
                    </button>
                  )}

                  {/* Right scroll arrow - visible when hovered and can scroll right */}
                  {isStocksHovered && canScrollRight && (
                    <button
                      onClick={handleScrollRight}
                      onTouchStart={() => startContinuousScroll('right')}
                      onTouchEnd={stopContinuousScroll}
                      onTouchCancel={stopContinuousScroll}
                      className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-white/90 to-transparent flex items-center justify-end pr-1 hover:from-white"
                    >
                      <ChevronRight size={16} className="text-black animate-pulse" />
                    </button>
                  )}

                  <div ref={stocksContainerRef} className="overflow-hidden">
                    <div
                      ref={stocksScrollRef}
                      className="flex"
                      style={{ width: 'fit-content' }}
                    >
                      {/* First set of stocks */}
                      {marketStocks.map((stock, i) => (
                          <div key={`${stock.symbol}-${i}`} className={`
                              flex-shrink-0 flex flex-col p-2 border-r-2 border-black w-[79.3px]
                              ${stock.alignment === 'HIGH' ? 'bg-white hover:bg-green-50' : 'bg-gray-100 hover:bg-red-50'}
                              ${i === 0 ? 'border-l-2' : ''}
                              transition-colors cursor-pointer
                          `}>
                              <div className="flex justify-between items-start gap-1 mb-1">
                                  <span className="font-bold font-mono text-xs">{stock.symbol}</span>
                                  {stock.change >= 0 ? <TrendingUp size={12} className="text-black"/> : <TrendingDown size={12} className="text-gray-500"/>}
                              </div>
                              <div className="font-pixel text-xl leading-none mb-0.5">${stock.price}</div>
                              <div className={`text-[9px] font-mono font-bold ${stock.change >= 0 ? 'text-black' : 'text-gray-400'}`}>
                                  {stock.change >= 0 ? '+' : ''}{stock.change}%
                              </div>
                          </div>
                      ))}
                      {/* Duplicate set for seamless loop */}
                      {marketStocks.map((stock, i) => (
                          <div key={`${stock.symbol}-dup-${i}`} className={`
                              flex-shrink-0 flex flex-col p-2 border-r-2 border-black w-[79.3px]
                              ${stock.alignment === 'HIGH' ? 'bg-white hover:bg-green-50' : 'bg-gray-100 hover:bg-red-50'}
                              transition-colors cursor-pointer
                          `}>
                              <div className="flex justify-between items-start gap-1 mb-1">
                                  <span className="font-bold font-mono text-xs">{stock.symbol}</span>
                                  {stock.change >= 0 ? <TrendingUp size={12} className="text-black"/> : <TrendingDown size={12} className="text-gray-500"/>}
                              </div>
                              <div className="font-pixel text-xl leading-none mb-0.5">${stock.price}</div>
                              <div className={`text-[9px] font-mono font-bold ${stock.change >= 0 ? 'text-black' : 'text-gray-400'}`}>
                                  {stock.change >= 0 ? '+' : ''}{stock.change}%
                              </div>
                          </div>
                      ))}
                    </div>
                  </div>
               </div>

               </div>
               {/* End of MARKET SIGNAL collapsible content */}

               {/* REPRESENTATIVE POSITIONS Section Header - Collapsible */}
               <button
                 onClick={() => setIsPositionsExpanded(!isPositionsExpanded)}
                 className={`w-full px-4 py-4 border-black bg-white hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between ${isMarketSignalExpanded ? 'border-t-2 border-b-2' : 'border-b-2'}`}
               >
                 <h3 className="font-pixel text-2xl">{t('feed', 'representative_positions')}</h3>
                 <span className={`transition-transform duration-200 text-black ${isPositionsExpanded ? '' : 'rotate-180'}`}>▼</span>
               </button>

               {/* REPRESENTATIVE POSITIONS Content - Collapsible */}
               <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isPositionsExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
               {!rankings ? (
                 <div className="p-4 text-center">
                   <div className="font-mono text-xs text-gray-500">Loading positions...</div>
                 </div>
               ) : (
                 <div className="flex">
                   {/* LONG (Aligned) Column */}
                   <div className="flex-1 border-r border-black">
                     <div className="bg-black text-white px-3 py-2 flex items-center gap-2 relative" ref={activeTooltip === 'support' ? tooltipRef : null}>
                       <ThumbsUp size={12} />
                       <span className="font-mono text-[10px] tracking-wider uppercase font-bold flex-1">
                         {t('feed', 'long_aligned')}
                       </span>
                       <Info
                         size={12}
                         className="text-gray-400 hover:text-white cursor-pointer"
                         onClick={() => setActiveTooltip(activeTooltip === 'support' ? null : 'support')}
                       />
                       {activeTooltip === 'support' && (
                         <div className="absolute right-2 top-full mt-1 z-50 bg-white text-black border-2 border-black px-3 py-2 shadow-pixel-sm max-w-[200px]">
                           <p className="font-mono text-[10px] leading-relaxed">{t('feed', 'support_companies_tooltip')}</p>
                         </div>
                       )}
                     </div>
                     <div className="divide-y divide-gray-100">
                       {rankings.supportCompanies.slice(0, 5).map((company, i) => {
                         const stock = marketStocks.find(s => s.symbol === company.symbol);
                         return (
                           <div key={`long-${i}`} className="p-2 hover:bg-green-50 transition-colors cursor-pointer">
                             <div className="flex items-center justify-between gap-2">
                               <div className="flex items-center gap-1 flex-1 min-w-0">
                                 <span className="font-mono font-bold text-xs">+</span>
                                 <div>
                                   <div className="font-mono font-bold text-xs">{company.symbol}</div>
                                   <div className="text-[8px] text-gray-500 uppercase truncate">{company.sector}</div>
                                 </div>
                               </div>
                               <div className="text-right">
                                 <div className="font-mono text-xs font-bold">
                                   ${stock?.price.toFixed(2) || '...'}
                                 </div>
                                 <div className={`text-[8px] font-mono font-bold ${(stock?.change || 0) >= 0 ? 'text-black' : 'text-gray-400'}`}>
                                   {stock?.change !== undefined ? `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(1)}%` : '...'}
                                 </div>
                               </div>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>

                   {/* SHORT (Opposed) Column */}
                   <div className="flex-1">
                     <div className="bg-gray-100 text-black px-3 py-2 flex items-center gap-2 relative" ref={activeTooltip === 'oppose' ? tooltipRef : null}>
                       <ThumbsDown size={12} />
                       <span className="font-mono text-[10px] tracking-wider uppercase font-bold flex-1">
                         {t('feed', 'short_opposed')}
                       </span>
                       <Info
                         size={12}
                         className="text-gray-500 hover:text-black cursor-pointer"
                         onClick={() => setActiveTooltip(activeTooltip === 'oppose' ? null : 'oppose')}
                       />
                       {activeTooltip === 'oppose' && (
                         <div className="absolute right-2 top-full mt-1 z-50 bg-white text-black border-2 border-black px-3 py-2 shadow-pixel-sm max-w-[200px]">
                           <p className="font-mono text-[10px] leading-relaxed">{t('feed', 'oppose_companies_tooltip')}</p>
                         </div>
                       )}
                     </div>
                     <div className="divide-y divide-gray-100">
                       {rankings.opposeCompanies.slice(0, 5).map((company, i) => {
                         const stock = marketStocks.find(s => s.symbol === company.symbol);
                         return (
                           <div key={`short-${i}`} className="p-2 hover:bg-red-50 transition-colors cursor-pointer">
                             <div className="flex items-center justify-between gap-2">
                               <div className="flex items-center gap-1 flex-1 min-w-0">
                                 <span className="font-mono font-bold text-xs">-</span>
                                 <div>
                                   <div className="font-mono font-bold text-xs">{company.symbol}</div>
                                   <div className="text-[8px] text-gray-500 uppercase truncate">{company.sector}</div>
                                 </div>
                               </div>
                               <div className="text-right">
                                 <div className="font-mono text-xs font-bold">
                                   ${stock?.price.toFixed(2) || '...'}
                                 </div>
                                 <div className={`text-[8px] font-mono font-bold ${(stock?.change || 0) >= 0 ? 'text-black' : 'text-gray-400'}`}>
                                   {stock?.change !== undefined ? `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(1)}%` : '...'}
                                 </div>
                               </div>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>
                 </div>
               )}
               </div>
               {/* End of REPRESENTATIVE POSITIONS collapsible content */}

               {/* TODAY'S ANALYSIS Section Header - Collapsible */}
               <button
                 onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                 className={`w-full px-4 py-4 border-black bg-white hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between ${isPositionsExpanded ? 'border-t-2 border-b-2' : 'border-b-2'}`}
               >
                 <h3 className="font-pixel text-2xl">{t('feed', 'why_today')}</h3>
                 <span className={`transition-transform duration-200 text-black ${isAnalysisExpanded ? '' : 'rotate-180'}`}>▼</span>
               </button>

               {/* TODAY'S ANALYSIS Content - Collapsible */}
               <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isAnalysisExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                 <div className="bg-black text-white px-4 py-3 max-h-[600px] overflow-y-auto">
                   {loadingAnalysis ? (
                     <p className="font-mono text-xs text-gray-400">{t('feed', 'analyzing_market')}</p>
                   ) : todayAnalysis ? (
                     <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                       {todayAnalysis.explanation}
                     </p>
                   ) : (
                     <p className="font-mono text-xs text-gray-400">{t('feed', 'analysis_placeholder')}</p>
                   )}
                 </div>
               </div>

               {/* Footer with update time */}
               <div className={`px-3 py-1 bg-gray-50 ${isAnalysisExpanded ? 'border-t-2 border-black' : ''}`}>
                 <p className="font-mono text-[8px] text-gray-400 text-center">
                   Updated: {marketUpdatedAt?.toLocaleString(LOCALE_MAP[language])}
                 </p>
               </div>
               </>
             )}
         </PixelCard>

        {/* Hidden ValuesCompanyRanking component - still needed to fetch rankings */}
        <div className="hidden">
          <ValuesCompanyRanking onRankingsChange={handleRankingsChange} />
        </div>
      </div>

      {/* SECTION 2: THE FEED */}
      <div className="text-center mb-4" data-tour-id="news-feed">
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
            {t('feed', 'curated_for')}: {translatedPersona || userProfile.coordinates.label}
          </p>
        )}
        {/* Progress percentage - fixed height to prevent layout jump */}
        <div className="h-5 mt-2">
          {feedLoading && feedProgress > 0 && feedProgress < 100 && (
            <p className="font-mono text-xs text-gray-500">
              {feedProgress}%
            </p>
          )}
        </div>
      </div>

      {/* Not onboarded message */}
      {!hasCompletedOnboarding && (
        <PixelCard className="text-center py-8">
          <p className="font-pixel text-sm animate-pulse uppercase">{t('feed', 'onboarding_required_news')}</p>
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
      {hasCompletedOnboarding && feedNews.length > 0 && (
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
                      <Sparkles size={14} />
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
                              <div className="min-w-[4px] h-full bg-red-600 self-stretch"></div>
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
