
import React, { useState, useEffect, useCallback } from 'react';
import { Layers, TrendingUp, TrendingDown, ExternalLink, RefreshCw, ChevronDown } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { NewsEvent, StockTicker } from '../../types';
import { generatePrismSummary, fetchPersonalizedNews } from '../../services/geminiService';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

// Mock Stocks aligned with "Liberal/Green" values for demo
const MOCK_STOCKS: StockTicker[] = [
    { symbol: 'ICLN', name: 'Global Clean Energy', price: 14.52, change: 2.4, alignment: 'HIGH' },
    { symbol: 'TSLA', name: 'Tesla Inc', price: 182.40, change: -1.2, alignment: 'HIGH' },
    { symbol: 'ESG', name: 'Social Governance ETF', price: 64.20, change: 0.8, alignment: 'HIGH' },
    { symbol: 'XOM', name: 'Exxon Mobil', price: 102.30, change: 1.5, alignment: 'LOW' },
    { symbol: 'RIVN', name: 'Rivian Automotive', price: 12.30, change: 0.5, alignment: 'HIGH' },
];

export const FeedView: React.FC = () => {
  const [activePrism, setActivePrism] = useState<string | null>(null);
  const [prismData, setPrismData] = useState<Record<string, any>>({});
  const [loadingPrism, setLoadingPrism] = useState(false);
  const { t } = useLanguage();
  const { userProfile, hasCompletedOnboarding } = useAuth();

  // News state
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMoreNews, setHasMoreNews] = useState(true);
  const [lastStanceHash, setLastStanceHash] = useState<string>('');

  // Create a hash of the user's stance to detect changes
  const getStanceHash = useCallback(() => {
    if (!userProfile?.coordinates) return '';
    const { economic, social, diplomatic, label } = userProfile.coordinates;
    return `${economic}-${social}-${diplomatic}-${label}`;
  }, [userProfile]);

  // Fetch news when stance changes or on initial load
  const fetchNews = useCallback(async (page: number = 0, append: boolean = false) => {
    if (!userProfile?.coordinates || !hasCompletedOnboarding) return;

    setLoadingNews(true);
    setNewsError(null);

    try {
      const fetchedNews = await fetchPersonalizedNews(userProfile.coordinates, page);

      if (append) {
        setNews(prev => [...prev, ...fetchedNews]);
      } else {
        setNews(fetchedNews);
      }

      setHasMoreNews(fetchedNews.length === 5);
      setCurrentPage(page);
      setLastStanceHash(getStanceHash());
    } catch (error: any) {
      console.error('Error fetching news:', error);
      setNewsError(error.message || 'Failed to load news');
    } finally {
      setLoadingNews(false);
    }
  }, [userProfile, hasCompletedOnboarding, getStanceHash]);

  // Initial load and stance change detection
  useEffect(() => {
    const currentHash = getStanceHash();
    if (currentHash && currentHash !== lastStanceHash) {
      fetchNews(0, false);
    }
  }, [getStanceHash, lastStanceHash, fetchNews]);

  // Load more news (pagination)
  const loadMoreNews = () => {
    if (!loadingNews && hasMoreNews) {
      fetchNews(currentPage + 1, true);
    }
  };

  // Refresh news
  const refreshNews = () => {
    setCurrentPage(0);
    fetchNews(0, false);
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

  // Open source URL
  const openSource = (url?: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
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
             <div className="flex overflow-x-auto no-scrollbar snap-x horizontal-snap">
                {MOCK_STOCKS.map((stock, i) => (
                    <div key={i} className={`
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
         </PixelCard>
      </div>

      {/* SECTION 2: THE FEED */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-4">
          <h2 className="font-pixel text-5xl">{t('feed', 'title')}</h2>
          {hasCompletedOnboarding && (
            <button
              onClick={refreshNews}
              disabled={loadingNews}
              className="p-2 border-2 border-black bg-white hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Refresh news"
            >
              <RefreshCw size={16} className={loadingNews ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        <p className="font-mono text-xs text-gray-400">{t('feed', 'subtitle')}</p>
        {userProfile?.coordinates?.label && (
          <p className="font-mono text-[10px] text-gray-500 mt-1">
            Curated for: {userProfile.coordinates.label}
          </p>
        )}
      </div>

      {/* Not onboarded message */}
      {!hasCompletedOnboarding && (
        <PixelCard className="text-center py-8">
          <p className="font-mono text-sm text-gray-500 mb-2">Complete your stance calibration</p>
          <p className="font-mono text-xs text-gray-400">to get personalized news</p>
        </PixelCard>
      )}

      {/* Loading state */}
      {loadingNews && news.length === 0 && (
        <div className="text-center py-12">
          <div className="font-pixel text-2xl animate-pulse mb-2">LOADING...</div>
          <p className="font-mono text-xs text-gray-500">Searching for news aligned with your stance</p>
        </div>
      )}

      {/* Error state */}
      {newsError && (
        <PixelCard className="text-center py-8 bg-red-50">
          <p className="font-mono text-sm text-red-600 mb-2">{newsError}</p>
          <PixelButton variant="secondary" onClick={refreshNews} className="text-xs">
            Try Again
          </PixelButton>
        </PixelCard>
      )}

      {/* Feed List Container with Local Relative Positioning for Timeline */}
      {news.length > 0 && (
        <div className="relative pl-6">
          {/* Timeline Line */}
          <div className="absolute left-[3px] top-2 bottom-6 w-0.5 bg-pixel-black opacity-20 z-0"></div>

          <div className="space-y-12 relative z-10">
              {news.map((newsItem) => (
              <div key={newsItem.id} className="relative">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[24px] top-6 w-3 h-3 bg-black border-2 border-white box-content"></div>

                  <PixelCard className="hover:translate-x-1 transition-transform duration-200 mb-0">
                  <div className="relative h-32 w-full border-b-2 border-black mb-3 overflow-hidden group">
                      <img src={newsItem.imageUrl} alt={newsItem.title} className="w-full h-full object-cover filter grayscale contrast-125 group-hover:scale-105 transition-transform duration-700" />
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

                  <div className="flex justify-between items-center">
                      {newsItem.sourceUrl && (
                        <button
                          onClick={() => openSource(newsItem.sourceUrl)}
                          className="flex items-center gap-1 text-xs font-mono text-gray-500 hover:text-black transition-colors"
                        >
                          <ExternalLink size={12} />
                          Source
                        </button>
                      )}
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
          {hasMoreNews && news.length >= 5 && (
            <div className="mt-8 text-center">
              <PixelButton
                variant="secondary"
                onClick={loadMoreNews}
                disabled={loadingNews}
                className="flex items-center gap-2 mx-auto"
              >
                <ChevronDown size={16} />
                {loadingNews ? 'Loading...' : 'Load More'}
              </PixelButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
