
import React from 'react';
import { PixelCard } from '../ui/PixelCard';
import { useLanguage } from '../../contexts/LanguageContext';

export const ManifestoView: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="text-center space-y-4">
        <h2 className="font-pixel text-6xl">{t('manifesto', 'title')}</h2>
        <p className="font-mono text-sm uppercase tracking-widest border-y-2 border-black py-2 inline-block">
          {t('manifesto', 'subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <PixelCard className="p-6">
          <h3 className="font-bold font-mono text-xl mb-3 uppercase">{t('manifesto', 'p1_title')}</h3>
          <p className="font-mono text-sm leading-relaxed text-gray-700">
            {t('manifesto', 'p1_body')}
          </p>
        </PixelCard>

        <PixelCard className="p-6">
          <h3 className="font-bold font-mono text-xl mb-3 uppercase">{t('manifesto', 'p2_title')}</h3>
          <p className="font-mono text-sm leading-relaxed text-gray-700">
            {t('manifesto', 'p2_body')}
          </p>
        </PixelCard>

        <PixelCard className="p-6">
          <h3 className="font-bold font-mono text-xl mb-3 uppercase">{t('manifesto', 'p3_title')}</h3>
          <p className="font-mono text-sm leading-relaxed text-gray-700">
            {t('manifesto', 'p3_body')}
          </p>
        </PixelCard>
      </div>
      
      <div className="text-center font-pixel text-2xl animate-pulse uppercase">
        {t('manifesto', 'footer')}
      </div>
    </div>
  );
};
