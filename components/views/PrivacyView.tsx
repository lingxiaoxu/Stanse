
import React from 'react';
import { Shield, Lock, EyeOff } from 'lucide-react';
import { PixelCard } from '../ui/PixelCard';
import { useLanguage } from '../../contexts/LanguageContext';

export const PrivacyView: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="text-center space-y-2">
        <h2 className="font-pixel text-5xl uppercase">{t('privacy', 'title')}</h2>
        <p className="font-mono text-xs text-gray-500 uppercase">{t('privacy', 'subtitle')}</p>
      </div>

      <PixelCard variant="dark" className="p-8 text-center">
        <Shield className="w-20 h-20 mx-auto mb-4 text-white" />
        <h3 className="font-bold text-2xl mb-2 uppercase">{t('privacy', 'card_title')}</h3>
        <p className="font-mono text-sm opacity-80">
            {t('privacy', 'card_body')}
        </p>
      </PixelCard>

      <div className="grid grid-cols-1 gap-4">
        <PixelCard className="p-6 flex items-start gap-4">
            <div className="bg-black text-white p-3 flex-shrink-0">
                <Lock size={24} />
            </div>
            <div className="flex-1">
                <h4 className="font-bold font-mono text-lg uppercase">{t('privacy', 'local_title')}</h4>
                <p className="font-mono text-sm text-gray-600 mt-1">
                    {t('privacy', 'local_body')}
                </p>
            </div>
        </PixelCard>

        <PixelCard className="p-6 flex items-start gap-4">
            <div className="bg-black text-white p-3 flex-shrink-0">
                <EyeOff size={24} />
            </div>
            <div className="flex-1">
                <h4 className="font-bold font-mono text-lg uppercase">{t('privacy', 'diff_title')}</h4>
                <p className="font-mono text-sm text-gray-600 mt-1">
                    {t('privacy', 'diff_body')}
                </p>
            </div>
        </PixelCard>
      </div>
    </div>
  );
};
