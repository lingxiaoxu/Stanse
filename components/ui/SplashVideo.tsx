import React, { useEffect, useState, useRef } from 'react';

interface SplashVideoProps {
  onComplete: () => void;
}

// Video URLs - GCS for global, R2 for China (Google is blocked in China)
const VIDEO_URLS = {
  gcs: {
    mobile: 'https://storage.googleapis.com/stanse-public-assets/videos/stanse_loading.mp4',
    desktop: 'https://storage.googleapis.com/stanse-public-assets/videos/stanse_intro.mp4'
  },
  r2: {
    mobile: 'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_loading.mp4',
    desktop: 'https://pub-d7df9460a68d416f8e9b251939afe4ae.r2.dev/stanse_intro.mp4'
  }
};

// Detect if user is likely in China (Google services are blocked)
// Uses timezone and Chinese browser detection - NOT language (Chinese in USA should use GCS)
const isLikelyInChina = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();

  // WeChat browser - definitely in China ecosystem
  if (/micromessenger/i.test(userAgent)) {
    return true;
  }

  // QQ browser or other Chinese browsers - these are China-specific
  if (/qq/i.test(userAgent) || /ucbrowser/i.test(userAgent) || /baidubrowser/i.test(userAgent)) {
    return true;
  }

  // Check timezone - China uses UTC+8 (Asia/Shanghai, Asia/Chongqing, etc.)
  // If user is in China timezone, they're likely in China and need R2
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const chinaTimezones = ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Hong_Kong', 'Asia/Macau'];
  if (chinaTimezones.includes(timezone)) {
    return true;
  }

  return false;
};

// Detect device type based on screen size and user agent
const getDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  const width = window.innerWidth;
  const userAgent = navigator.userAgent.toLowerCase();

  // Check user agent for mobile indicators
  const isMobileUA = /iphone|ipod|android.*mobile/i.test(userAgent);
  const isTabletUA = /ipad|android(?!.*mobile)/i.test(userAgent);

  // Screen size detection (more reliable)
  // Mobile: width < 768px OR mobile user agent
  // Tablet: 768px <= width < 1024px OR iPad
  // Desktop: width >= 1024px

  if (isMobileUA || width < 768) {
    return 'mobile';
  }

  if (isTabletUA || (width >= 768 && width < 1024)) {
    return 'tablet';
  }

  return 'desktop';
};

export const SplashVideo: React.FC<SplashVideoProps> = ({ onComplete }) => {
  const [deviceType] = useState<'mobile' | 'tablet' | 'desktop'>(getDeviceType());
  const [useR2] = useState<boolean>(isLikelyInChina());
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [showTapToStart, setShowTapToStart] = useState(false);
  const hasCompletedRef = useRef(false);

  // Select video based on device type and location
  // Use R2 (Cloudflare) for China users, GCS for others
  const videoSource = useR2 ? VIDEO_URLS.r2 : VIDEO_URLS.gcs;
  const videoUrl = deviceType === 'mobile' ? videoSource.mobile : videoSource.desktop;

  // Safe complete function to prevent double-calling
  const safeComplete = () => {
    if (!hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onComplete();
    }
  };

  // Log video source for debugging
  useEffect(() => {
    console.log(`[SplashVideo] Using ${useR2 ? 'R2 (China)' : 'GCS (Global)'} video source`);
    console.log(`[SplashVideo] Video URL: ${videoUrl}`);
  }, [useR2, videoUrl]);

  // Timeout fallback - if video doesn't load in 5 seconds, show "tap to start"
  // If still not loaded after 10 seconds, auto-skip
  useEffect(() => {
    const tapTimeout = setTimeout(() => {
      if (!isVideoLoaded) {
        console.log('[SplashVideo] Video load timeout (5s), showing tap to start');
        setShowTapToStart(true);
      }
    }, 5000);

    const autoSkipTimeout = setTimeout(() => {
      if (!isVideoLoaded) {
        console.log('[SplashVideo] Video load timeout (10s), auto-skipping');
        safeComplete();
      }
    }, 10000);

    return () => {
      clearTimeout(tapTimeout);
      clearTimeout(autoSkipTimeout);
    };
  }, [isVideoLoaded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      console.log(`[SplashVideo] Video ended (${deviceType})`);
      safeComplete();
    };

    const handleLoadedData = () => {
      console.log(`[SplashVideo] Video loaded (${deviceType})`);
      setIsVideoLoaded(true);
      setShowTapToStart(false);
    };

    const handleError = (e: Event) => {
      console.error('[SplashVideo] Video error:', e);
      setShowTapToStart(true);
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    // Auto-play when loaded
    video.play().catch(err => {
      console.warn('[SplashVideo] Auto-play failed, allowing user to tap:', err);
      setShowTapToStart(true);
    });

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [deviceType]);

  // Allow user to skip/start by tapping
  const handleSkip = () => {
    console.log('[SplashVideo] User tapped to skip/start');
    // If video hasn't loaded, try to play it first (WeChat requires user interaction)
    const video = videoRef.current;
    if (video && !isVideoLoaded) {
      video.play().catch(() => {
        // If still can't play, just skip
        safeComplete();
      });
      return;
    }
    onComplete();
  };

  // Mobile: fullscreen (object-cover) aligned right so right side is not cut off
  // Tablet/Desktop: contain with letterboxing
  const videoClassName = deviceType === 'mobile'
    ? "w-full h-full object-cover object-right"
    : "w-full h-full object-contain";

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center cursor-pointer"
      onClick={handleSkip}
    >
      <video
        ref={videoRef}
        className={videoClassName}
        playsInline
        muted
        preload="auto"
      >
        <source src={videoUrl} type="video/mp4" />
      </video>

      {/* Loading indicator while video is loading - always black background */}
      {!isVideoLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          <div className="font-pixel text-5xl text-white mb-4">STANSE</div>
          {showTapToStart ? (
            <div className="font-mono text-sm text-white animate-pulse">Tap to enter / 点击进入</div>
          ) : (
            <div className="font-mono text-sm text-gray-400">Loading...</div>
          )}
        </div>
      )}

      {/* Tap to skip hint */}
      {isVideoLoaded && (
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="font-mono text-xs text-gray-400 animate-pulse">
            Tap anywhere to skip
          </p>
        </div>
      )}
    </div>
  );
};
