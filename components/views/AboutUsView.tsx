import React, { useRef, useEffect, useState } from 'react';
import { PixelCard } from '../ui/PixelCard';
import { useLanguage } from '../../contexts/LanguageContext';

// Detect if user is likely in China (Google services are blocked)
// Uses timezone and Chinese browser detection - NOT language (Chinese in USA should use GCS)
const isLikelyInChina = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();

  // Chinese browsers (WeChat, QQ, UC, Baidu) - definitely in China ecosystem
  if (/micromessenger|qq|ucbrowser|baidubrowser/i.test(userAgent)) return true;

  // China timezone - user is likely physically in China
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const chinaTimezones = ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Hong_Kong', 'Asia/Macau'];
  if (chinaTimezones.includes(timezone)) return true;

  return false;
};

export const AboutUsView: React.FC = () => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl] = useState(() =>
    isLikelyInChina()
      ? 'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_intro.mp4'
      : 'https://storage.googleapis.com/stanse-public-assets/videos/stanse_intro.mp4'
  );

  // Auto-play video when component mounts
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(err => {
        console.warn('[AboutUsView] Auto-play failed:', err);
      });
    }
  }, []);

  return (
    <div className="max-w-[115%] mx-auto w-full pb-20" style={{ maxWidth: 'calc(28rem * 1.15)' }}>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="font-pixel text-5xl mb-3">{t('aboutUs', 'title')}</h1>
        <p className="font-mono text-xs text-gray-400 uppercase tracking-wide">
          {t('aboutUs', 'subtitle')}
        </p>
      </div>

      {/* Combined Video + Founder Section */}
      <PixelCard className="mb-8">
        <div className="p-6">
          {/* Video - no controls, auto-play, loop */}
          <div className="mb-6">
            <video
              ref={videoRef}
              className="w-full aspect-video"
              autoPlay
              muted
              playsInline
              loop
              preload="auto"
            >
              <source
                src={videoUrl}
                type="video/mp4"
              />
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Section Header */}
          <div className="mb-6 pb-4 border-b-2 border-black">
            <h2 className="font-pixel text-2xl uppercase mb-2">
              {t('aboutUs', 'founder_title')}
            </h2>
            <p className="font-mono text-xs text-gray-500 uppercase tracking-wide">
              {t('aboutUs', 'founder_name')}
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-4">
            <p className="font-mono text-sm leading-relaxed text-gray-800">
              {t('aboutUs', 'founder_bio')}
            </p>
          </div>
        </div>
      </PixelCard>

      {/* Philosophy Quote */}
      <div className="text-center py-6 opacity-60">
        <p className="font-pixel text-xl">"{t('slogan')}"</p>
      </div>
    </div>
  );
};
