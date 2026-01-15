import React, { useRef, useEffect, useState } from 'react';
import { PixelCard } from '../ui/PixelCard';
import { useLanguage } from '../../contexts/LanguageContext';

// Video URLs - 5 rotating intro videos
const VIDEO_URLS = {
  gcs: [
    'https://storage.googleapis.com/stanse-public-assets/videos/stanse_intro_0.mp4',
    'https://storage.googleapis.com/stanse-public-assets/videos/stanse_intro_1.mp4',
    'https://storage.googleapis.com/stanse-public-assets/videos/stanse_intro_2.mp4',
    'https://storage.googleapis.com/stanse-public-assets/videos/stanse_intro_3.mp4',
    'https://storage.googleapis.com/stanse-public-assets/videos/stanse_intro_4.mp4',
  ],
  r2: [
    'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_intro_0.mp4',
    'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_intro_1.mp4',
    'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_intro_2.mp4',
    'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_intro_3.mp4',
    'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_intro_4.mp4',
  ]
};

// Get the next video index for rotation (each page open shows different video)
const getNextVideoIndex = (): number => {
  const STORAGE_KEY = 'stanse_aboutus_video_index_v2'; // v2: reset to start from intro_0
  const TOTAL_VIDEOS = 5;

  try {
    const currentIndex = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    const nextIndex = (currentIndex + 1) % TOTAL_VIDEOS;
    localStorage.setItem(STORAGE_KEY, nextIndex.toString());
    return currentIndex;
  } catch {
    // localStorage not available, use random
    return Math.floor(Math.random() * TOTAL_VIDEOS);
  }
};

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
  const [videoIndex] = useState<number>(() => getNextVideoIndex());
  const [useR2] = useState<boolean>(isLikelyInChina());
  const videoUrl = useR2 ? VIDEO_URLS.r2[videoIndex] : VIDEO_URLS.gcs[videoIndex];

  // Auto-play video when component mounts
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(err => {
        console.warn('[AboutUsView] Auto-play failed:', err);
      });
    }
    console.log(`[AboutUsView] Playing video ${videoIndex + 1}/4: ${videoUrl}`);
  }, [videoIndex, videoUrl]);

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
