import React, { useEffect, useState, memo, useRef } from 'react';
import { PixelCard } from './ui/PixelCard';
import { useLanguage } from '../contexts/LanguageContext';
import { Language } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getLatestChinaNewsBroadcast, subscribeToLatestChinaNewsBroadcast, ChinaNewsBroadcastData } from '../services/chinaNewsService';
import { translatePersonaLabel } from '../services/geminiService';

const ChinaNewsBroadcastComponent: React.FC = () => {
  const { language, t } = useLanguage();
  const { userProfile } = useAuth();
  const [broadcastData, setBroadcastData] = useState<ChinaNewsBroadcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [translatedPersona, setTranslatedPersona] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(true); // 默认展开

  useEffect(() => {
    console.log('[ChinaNewsBroadcast] Language changed:', language, 'Expected:', Language.ZH, 'Match:', language === Language.ZH);

    // 只在中文时加载数据
    if (language !== Language.ZH) {
      console.log('[ChinaNewsBroadcast] Not Chinese, hiding component. Current language:', language);
      // ⚠️ Don't update state if not Chinese - causes re-renders
      // Just return early without state updates
      return;
    }

    console.log('[ChinaNewsBroadcast] Loading broadcast data...');

    // 初始加载
    setLoading(true);
    setLoadingProgress(0);

    // 模拟进度更新
    const progressInterval = setInterval(() => {
      setLoadingProgress((prev: number) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 100);

    getLatestChinaNewsBroadcast()
      .then((data) => {
        console.log('[ChinaNewsBroadcast] Data loaded:', data ? 'Success' : 'No data');
        clearInterval(progressInterval);
        setLoadingProgress(100);
        setBroadcastData(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('[ChinaNewsBroadcast] Failed to load:', error);
        clearInterval(progressInterval);
        setLoadingProgress(0);
        setLoading(false);
      });

    // 订阅实时更新
    const unsubscribe = subscribeToLatestChinaNewsBroadcast((data) => {
      console.log('[ChinaNewsBroadcast] Data updated:', data ? 'Success' : 'No data');
      setBroadcastData(data);
    });

    return () => {
      unsubscribe();
    };
  }, [language]);

  // Track if we've already loaded for this label to prevent re-translation
  const lastTranslatedLabel = useRef<string>('');

  // 翻译 persona label（和 THE MARKET 一样）
  useEffect(() => {
    if (language !== Language.ZH) {
      // Don't update state if already empty - prevents re-render
      if (translatedPersona !== '') {
        setTranslatedPersona('');
      }
      return;
    }
    if (!userProfile?.coordinates) return;

    const label = userProfile.coordinates.label;

    // Skip if already translated this label
    if (lastTranslatedLabel.current === label) {
      return;
    }

    const cacheKey = `stanse_persona_${label}_${language.toLowerCase()}`;

    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        console.log('[ChinaNewsBroadcast] Using cached persona translation');
        setTranslatedPersona(cached);
        lastTranslatedLabel.current = label;
        return;
      }
    } catch (e) {
      console.warn('[ChinaNewsBroadcast] Failed to read persona cache');
    }

    // Cache miss - translate
    const translateLabel = async () => {
      try {
        const translated = await translatePersonaLabel(
          userProfile.coordinates,
          language.toLowerCase()
        );
        setTranslatedPersona(translated);
        lastTranslatedLabel.current = label;
        // Cache the translation
        try {
          localStorage.setItem(cacheKey, translated);
        } catch (e) {
          console.warn('[ChinaNewsBroadcast] Failed to cache persona translation');
        }
      } catch (error) {
        console.error('Failed to translate persona:', error);
        setTranslatedPersona('');
      }
    };

    translateLabel();
  }, [userProfile?.coordinates?.label, language, translatedPersona]); // Include translatedPersona to avoid unnecessary setState

  // Early return - only after all hooks are called (React rules)
  if (language !== Language.ZH) {
    return null;
  }

  // Loading state
  if (loading) {
    console.log('[ChinaNewsBroadcast] Render: Loading...');
    return (
      <div className="mt-12">
        <div className="text-center mb-3">
          <h2 className="font-pixel text-5xl">{t('feed', 'china_title')}</h2>
          <p className="font-mono text-xs text-gray-400">{t('feed', 'china_subtitle')}</p>
          {userProfile?.coordinates?.label && (
            <p className="font-mono text-[10px] text-gray-500 mt-1">
              {t('feed', 'aligned_with')}: {userProfile.coordinates.label}
            </p>
          )}
          {/* Progress percentage - fixed height to prevent layout jump (same as THE MARKET) */}
          <div className="h-5 mt-2">
            {loadingProgress > 0 && loadingProgress < 100 && (
              <p className="font-mono text-xs text-gray-500">
                {loadingProgress}%
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!broadcastData || !broadcastData.broadcast) {
    console.log('[ChinaNewsBroadcast] Render: No data available');
    return null;
  }

  console.log('[ChinaNewsBroadcast] Render: Displaying broadcast');

  return (
    <div className="mt-12">
      {/* Title Section - Same style as THE MARKET */}
      <div className="text-center mb-3">
        <h2 className="font-pixel text-5xl">{t('feed', 'china_title')}</h2>
        <p className="font-mono text-xs text-gray-400">{t('feed', 'china_subtitle')}</p>
        {userProfile?.coordinates?.label && (
          <p className="font-mono text-[10px] text-gray-500 mt-1">
            {t('feed', 'aligned_with')}: {translatedPersona || userProfile.coordinates.label}
          </p>
        )}
        {/* Fixed height gap to prevent layout jump (same as THE MARKET) */}
        <div className="h-5 mt-2"></div>
      </div>

      {/* Main Card - Same style as Market Analysis */}
      <PixelCard>
        {/* Collapsible Section Header - Same as MARKET SIGNAL */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-4 border-b-2 border-black bg-white hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between"
        >
          <h3 className="font-pixel text-2xl">重点关注</h3>
          <span className={`transition-transform duration-200 text-black ${isExpanded ? '' : 'rotate-180'}`}>▼</span>
        </button>

        {/* Collapsible Content */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-4 py-4">
            <BroadcastText text={broadcastData.broadcast} />
          </div>
        </div>

        {/* Footer with timestamp - Always visible */}
        <div className={`px-3 py-1 bg-gray-50 ${isExpanded ? 'border-t-2 border-black' : ''}`}>
          <p className="font-mono text-xs text-gray-400 text-center">
            {broadcastData.time.beijing_time} · {broadcastData.statistics.platforms.success}个平台 · {broadcastData.statistics.hotlist.total}条新闻
          </p>
        </div>
      </PixelCard>
    </div>
  );
};

/**
 * 格式化播报文本组件
 */
const BroadcastText: React.FC<{ text: string }> = ({ text }) => {
  // 将文本分段
  const sections = text.split(/\n\n+/);

  return (
    <div className="space-y-4">
      {sections.map((section: any, idx: any) => {
        const lines = section.split('\n').filter((line: any) => line.trim());

        if (lines.length === 0) return null;

        const firstLine = lines[0];

        // 检查是否为章节标题（【...】）
        const isHeader = firstLine.startsWith('【') && firstLine.includes('】');

        if (isHeader) {
          return (
            <div key={idx}>
              {/* 章节标题 - 使用新闻标题字体 */}
              <h4 className="font-bold text-lg mb-2 text-gray-900">
                {firstLine}
              </h4>
              {/* 章节内容 - 使用新闻body字体 */}
              <div className="font-mono text-sm text-gray-600 space-y-1 leading-relaxed">
                {lines.slice(1).map((line: any, lineIdx: any) => {
                  // 列表项（• 或 ▸）使用稍粗字体
                  if (line.startsWith('•') || line.startsWith('▸')) {
                    return (
                      <div key={lineIdx} className="pl-0" style={{ fontWeight: 600 }}>
                        {line}
                      </div>
                    );
                  }

                  // 普通段落
                  return (
                    <p key={lineIdx} className="text-justify">
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>
          );
        }

        // 非标题的内容块
        return (
          <div key={idx} className="font-mono text-sm text-gray-600 space-y-1 leading-relaxed">
            {lines.map((line: any, lineIdx: any) => {
              if (line.startsWith('•') || line.startsWith('▸')) {
                return (
                  <div key={lineIdx} className="pl-0" style={{ fontWeight: 600 }}>
                    {line}
                  </div>
                );
              }

              return (
                <p key={lineIdx} className="text-justify">
                  {line}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// Export memoized version to prevent unnecessary re-renders when parent updates
export const ChinaNewsBroadcast = memo(ChinaNewsBroadcastComponent);
