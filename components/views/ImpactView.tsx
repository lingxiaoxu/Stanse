
import React, { useState, useEffect } from 'react';
import { Users, Zap, ArrowUpRight, ShieldCheck, Target } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { PixelButton } from '../ui/PixelButton';
import { Campaign } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

// Mock Campaigns
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
  const [liveCount, setLiveCount] = useState(5420);
  const { t } = useLanguage();
  
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveCount(prev => prev + Math.floor(Math.random() * 3));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-lg promax:max-w-xl mx-auto w-full space-y-8 pb-20">
      <div className="text-center mb-10">
        <h2 className="font-pixel text-5xl">{t('union', 'title')}</h2>
        <p className="font-mono text-xs text-gray-400 uppercase">
          {t('union', 'subtitle')}
        </p>
      </div>

      {/* Active Pulse Map - Clean White Version */}
      <PixelCard className="relative bg-white">
        <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-full">
             <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
             <span className="font-mono text-[10px] font-bold text-red-500 tracking-wider">{t('union', 'live')}</span>
        </div>
        
        <div className="flex flex-col items-center justify-center py-6 space-y-2">
           <span className="font-mono text-xs font-bold tracking-widest text-gray-400 uppercase">{t('union', 'active_allies')}</span>
           <div className="font-pixel text-7xl">{liveCount.toLocaleString()}</div>
           
           <div className="text-[10px] font-mono text-center text-gray-500 mt-4 max-w-xs">
              {t('union', 'active_desc')}
           </div>
        </div>
      </PixelCard>

      {/* Active Campaigns Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-end px-1">
            <h3 className="font-pixel text-2xl">{t('union', 'active_fronts')}</h3>
            <span className="font-mono text-xs underline cursor-pointer hover:text-gray-600">{t('union', 'view_all')}</span>
        </div>

        {MOCK_CAMPAIGNS.map(campaign => (
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
                <PixelButton variant="secondary" className="text-xs py-1 border-black uppercase">
                    AMPLIFY IMPACT <ArrowUpRight size={14} className="ml-2 inline"/>
                </PixelButton>
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
                <div className="font-pixel text-4xl">3</div>
                <div className="text-[10px] font-mono font-bold text-gray-500 mt-1 uppercase">{t('union', 'camp_stat')}</div>
            </div>
            <div>
                <div className="font-pixel text-4xl">12<span className="text-xl text-gray-400">d</span></div>
                <div className="text-[10px] font-mono font-bold text-gray-500 mt-1 uppercase">{t('union', 'streak_stat')}</div>
            </div>
            <div>
                <div className="font-pixel text-4xl">$420</div>
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
                    45,201
                </div>
                <div className="h-1 w-16 bg-black mt-4 mb-1"></div>
            </div>

            {/* Stat 2 */}
            <div className="flex flex-col items-center">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{t('union', 'capital_divested')}</span>
                <div className="font-pixel text-6xl promax:text-7xl leading-none">
                    $1.24M
                </div>
                <p className="text-[10px] font-mono text-gray-500 mt-2 max-w-xs text-center">
                    {t('union', 'divested_desc')}
                </p>
            </div>
        </div>
      </PixelCard>
    </div>
  );
};
