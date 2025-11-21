
import React, { useState } from 'react';
import { Layers, TrendingUp, TrendingDown, DollarSign, Globe } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { NewsEvent, StockTicker } from '../../types';
import { generatePrismSummary } from '../../services/geminiService';
import { useLanguage } from '../../contexts/LanguageContext';

const MOCK_NEWS: NewsEvent[] = [
  {
    id: '1',
    title: 'Global Tech Tax Summit',
    summary: 'Major nations agree to a 15% minimum corporate tax rate for tech giants.',
    date: 'TODAY',
    imageUrl: 'https://picsum.photos/400/200?grayscale'
  },
  {
    id: '2',
    title: 'Arctic Conservation Treaty',
    summary: 'New proposal limits drilling in the arctic zone, sparking energy debates.',
    date: 'YESTERDAY',
    imageUrl: 'https://picsum.photos/400/201?grayscale'
  },
  {
    id: '3',
    title: 'AI Regulation Framework',
    summary: 'EU proposes strict guidelines on generative AI deployment in public sectors.',
    date: '2 DAYS AGO',
    imageUrl: 'https://picsum.photos/400/202?grayscale'
  }
];

// Mock Stocks aligned with "Liberal/Green" values for demo
const MOCK_STOCKS: StockTicker[] = [
    { symbol: 'ICLN', name: 'Global Clean Energy', price: 14.52, change: 2.4, alignment: 'HIGH' },
    { symbol: 'TSLA', name: 'Tesla Inc', price: 182.40, change: -1.2, alignment: 'HIGH' },
    { symbol: 'ESG', name: 'Social Governance ETF', price: 64.20, change: 0.8, alignment: 'HIGH' },
    { symbol: 'XOM', name: 'Exxon Mobil', price: 102.30, change: 1.5, alignment: 'LOW' }, // Low alignment
    { symbol: 'RIVN', name: 'Rivian Automotive', price: 12.30, change: 0.5, alignment: 'HIGH' },
];

export const FeedView: React.FC = () => {
  const [activePrism, setActivePrism] = useState<string | null>(null);
  const [prismData, setPrismData] = useState<Record<string, any>>({});
  const [loadingPrism, setLoadingPrism] = useState(false);
  const { t } = useLanguage();

  const handlePrismClick = async (news: NewsEvent) => {
    if (activePrism === news.id) {
      setActivePrism(null);
      return;
    }
    
    setActivePrism(news.id);
    
    if (!prismData[news.id]) {
      setLoadingPrism(true);
      const prism = await generatePrismSummary(news.title + " " + news.summary);
      setPrismData(prev => ({ ...prev, [news.id]: prism }));
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
        <h2 className="font-pixel text-5xl">{t('feed', 'title')}</h2>
        <p className="font-mono text-xs text-gray-400">{t('feed', 'subtitle')}</p>
      </div>
      
      {/* Feed List Container with Local Relative Positioning for Timeline */}
      <div className="relative pl-6">
        {/* Timeline Line */}
        <div className="absolute left-[3px] top-2 bottom-6 w-0.5 bg-pixel-black opacity-20 z-0"></div>

        <div className="space-y-12 relative z-10">
            {MOCK_NEWS.map((news) => (
            <div key={news.id} className="relative">
                {/* Timeline Dot */}
                <div className="absolute -left-[24px] top-6 w-3 h-3 bg-black border-2 border-white box-content"></div>
                
                <PixelCard className="hover:translate-x-1 transition-transform duration-200 mb-0">
                <div className="relative h-32 w-full border-b-2 border-black mb-3 overflow-hidden group">
                    <img src={news.imageUrl} alt={news.title} className="w-full h-full object-cover filter grayscale contrast-125 group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute top-2 right-2 bg-white px-2 py-1 text-xs font-bold border-2 border-black">
                    {news.date}
                    </div>
                </div>
                
                <h3 className="font-bold text-xl mb-2 leading-tight">{news.title}</h3>
                <p className="text-sm text-gray-600 mb-4 font-mono">{news.summary}</p>

                <div className="flex justify-end">
                    <PixelButton 
                    variant="secondary" 
                    className="text-xs px-3 py-1 flex items-center gap-2"
                    onClick={() => handlePrismClick(news)}
                    >
                    <Layers size={14} />
                    {activePrism === news.id ? t('feed', 'close_lens') : t('feed', 'lens')}
                    </PixelButton>
                </div>

                {/* AI Prism Expansion */}
                {activePrism === news.id && (
                    <div className="mt-4 pt-4 border-t-2 border-black animate-fade-in">
                    {loadingPrism ? (
                        <div className="text-center py-4 font-pixel text-gray-500 animate-pulse">{t('feed', 'loading_lens')}</div>
                    ) : (
                        <div className="space-y-3 font-mono text-xs">
                        <div className="flex gap-2 items-start">
                            <div className="min-w-[4px] h-full bg-black self-stretch"></div>
                            <div><span className="font-bold bg-black text-white px-1">{t('feed', 'support')}</span> <p className="mt-1">{prismData[news.id]?.support}</p></div>
                        </div>
                        <div className="flex gap-2 items-start">
                            <div className="min-w-[4px] h-full bg-gray-400 self-stretch"></div>
                            <div><span className="font-bold bg-gray-200 text-black px-1">{t('feed', 'neutral')}</span> <p className="mt-1">{prismData[news.id]?.neutral}</p></div>
                        </div>
                        <div className="flex gap-2 items-start">
                            <div className="min-w-[4px] h-full bg-white border border-black self-stretch"></div>
                            <div><span className="font-bold border border-black px-1">{t('feed', 'oppose')}</span> <p className="mt-1">{prismData[news.id]?.oppose}</p></div>
                        </div>
                        </div>
                    )}
                    </div>
                )}
                </PixelCard>
            </div>
            ))}
        </div>
      </div>
    </div>
  );
};
