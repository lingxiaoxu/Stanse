
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

      <PixelCard className="p-8 space-y-16 leading-relaxed font-mono text-sm promax:text-base">
        <p>
          <strong className="text-xl block mb-2 uppercase">{t('manifesto', 'p1_title')}</strong>
          {t('manifesto', 'p1_body')}
        </p>
        
        <hr className="border-black opacity-20" />

        <p>
          <strong className="text-xl block mb-2 uppercase">{t('manifesto', 'p2_title')}</strong>
          {t('manifesto', 'p2_body')}
        </p>

        <hr className="border-black opacity-20" />

        <p>
          <strong className="text-xl block mb-2 uppercase">{t('manifesto', 'p3_title')}</strong>
          {t('manifesto', 'p3_body')}
        </p>
      </PixelCard>
      
      <div className="text-center font-pixel text-2xl animate-pulse uppercase">
        {t('manifesto', 'footer')}
      </div>
    </div>
  );
};
