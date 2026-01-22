import { ChinaNewsData } from './chinaNewsService';
import { translateRSSHeadlines } from './translationService';

// AI 分析数据接口
interface AIAnalysisData {
  summary?: string;
  conclusion?: string;
  sentiment?: {
    overall?: string;
    positive?: number;
    negative?: number;
    neutral?: number;
  };
  keyword_analysis?: string[];
  cross_platform?: Record<string, any>;
  signals?: string[];
  impact?: Record<string, any>;
}

/**
 * 提取并清理所有新闻标题
 */
function extractAndCleanHeadlines(hotlistNews: ChinaNewsData['hotlist_news']): string[] {
  const allItems = hotlistNews.keyword_groups
    .flatMap(group => group.news_items || [])
    .sort((a, b) => a.rank - b.rank);  // 按排名排序

  return allItems.map(item => {
    let title = item.title;

    // 清理无效符号和内容
    title = title
      .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 零宽字符
      .replace(/\s+/g, ' ')                    // 多余空格
      .replace(/^[#\d\s]+/, '')                // 开头的 # 和数字
      .trim();

    return title;
  }).filter(title => title.length > 0);  // 过滤空标题
}

/**
 * 解析 AI 分析结果
 */
function parseAIAnalysis(resultString: string): AIAnalysisData | null {
  if (!resultString || resultString.trim().length === 0) {
    return null;
  }

  try {
    const result = JSON.parse(resultString);

    return {
      summary: result.summary || '',
      conclusion: result.conclusion || '',
      sentiment: result.sentiment || {},
      keyword_analysis: result.keyword_analysis || [],
      cross_platform: result.cross_platform || {},
      signals: result.signals || [],
      impact: result.impact || {}
    };
  } catch (error) {
    console.error('Failed to parse AI analysis:', error);
    return null;
  }
}

/**
 * 提取 RSS 标题
 */
function extractRSSItems(rssFeeds: ChinaNewsData['rss_feeds']): Array<{ title: string; author: string }> {
  const allRSSItems: Array<{ title: string; author: string }> = [];

  if (!rssFeeds || !rssFeeds.matched_items) {
    return allRSSItems;
  }

  for (const feed of rssFeeds.matched_items) {
    if (feed.items && Array.isArray(feed.items)) {
      for (const item of feed.items) {
        if (item.title && item.title.trim().length > 0) {
          allRSSItems.push({
            title: item.title,
            author: item.author || ''
          });
        }
      }
    }
  }

  return allRSSItems;
}

/**
 * 格式化情绪分析
 */
function formatSentiment(sentiment: any): string {
  if (!sentiment) return '整体中性';

  const { overall, positive, negative } = sentiment;

  let result = '整体';

  if (overall) {
    result += overall;
  } else if (positive && negative) {
    if (positive > 60) {
      result += '偏正面';
    } else if (negative > 60) {
      result += '偏负面';
    } else {
      result += '中性';
    }
  } else {
    result += '中性';
  }

  // 添加市场信心描述
  if (positive && positive > 50) {
    result += '，市场信心较强';
  } else {
    result += '，市场信心稳定';
  }

  return result;
}

/**
 * 格式化跨平台分析
 */
function formatCrossPlatform(crossPlatform: any): string {
  if (!crossPlatform || Object.keys(crossPlatform).length === 0) {
    return '各话题热度均衡';
  }

  try {
    const entries = Object.entries(crossPlatform);
    if (entries.length === 0) return '各话题热度均衡';

    // 找到覆盖平台数最多的话题
    const topTopic = entries.sort(([, a]: any, [, b]: any) => {
      const aCount = a.platforms || a.count || 0;
      const bCount = b.platforms || b.count || 0;
      return bCount - aCount;
    })[0];

    if (topTopic) {
      const [topic, data] = topTopic as [string, any];
      const platforms = data.platforms || data.count || 0;
      return `${topic}覆盖${platforms}个平台，讨论度最高`;
    }
  } catch (error) {
    console.error('Failed to format cross-platform:', error);
  }

  return '各话题热度均衡';
}

/**
 * 整合成播报稿
 */
async function assembleBroadcast(data: {
  statistics: ChinaNewsData['statistics'];
  time: ChinaNewsData['time'];
  newsHeadlines: string[];
  aiAnalysis: AIAnalysisData | null;
  rssItems: Array<{ title: string; author: string }>;
}): Promise<string> {
  const {
    statistics,
    time,
    newsHeadlines,
    aiAnalysis,
    rssItems
  } = data;

  let broadcast = '';

  // 1. 今日摘要
  broadcast += `【今日摘要】\n`;
  broadcast += `今日监测${statistics.platforms.success}个平台，`;
  broadcast += `共${statistics.hotlist.total}条热榜新闻`;
  if (statistics.rss.matched > 0) {
    broadcast += `，${statistics.rss.matched}条国际科技订阅`;
  }
  broadcast += `。以下是今日重点新闻播报：\n\n`;

  // 2. 热点新闻（前20条）
  if (newsHeadlines.length > 0) {
    broadcast += `【热点新闻】\n`;
    const topNews = newsHeadlines.slice(0, 20);
    topNews.forEach((headline) => {
      broadcast += `• ${headline}\n`;
    });

    if (newsHeadlines.length > 20) {
      broadcast += `... 及其他 ${newsHeadlines.length - 20} 条新闻\n`;
    }

    broadcast += `\n`;
  }

  // 3. AI 深度分析
  if (aiAnalysis) {
    broadcast += `【AI 深度分析】\n`;
    broadcast += `今日新闻呈现以下特点：\n`;

    // 关键词分析
    if (aiAnalysis.keyword_analysis && aiAnalysis.keyword_analysis.length > 0) {
      const topKeywords = aiAnalysis.keyword_analysis.slice(0, 3);
      broadcast += `▸ 主要话题：${topKeywords.join('、')}\n`;
    }

    // 情绪倾向
    if (aiAnalysis.sentiment) {
      broadcast += `▸ 情绪倾向：${formatSentiment(aiAnalysis.sentiment)}\n`;
    }

    // 关键信号
    if (aiAnalysis.signals && aiAnalysis.signals.length > 0) {
      const topSignals = aiAnalysis.signals.slice(0, 2);
      broadcast += `▸ 关键信号：${topSignals.join('，')}\n`;
    }

    // 跨平台分析
    if (aiAnalysis.cross_platform) {
      broadcast += `▸ 跨平台热度：${formatCrossPlatform(aiAnalysis.cross_platform)}\n`;
    }

    broadcast += `\n`;
  }

  // 4. 国际科技动态（翻译 RSS）
  if (rssItems.length > 0) {
    broadcast += `【国际科技动态】\n`;

    try {
      const translatedTitles = await translateRSSHeadlines(rssItems);

      translatedTitles.forEach((title) => {
        if (title && title.trim().length > 0) {
          broadcast += `• ${title}\n`;
        }
      });

      broadcast += `\n`;
    } catch (error) {
      console.error('Failed to translate RSS headlines:', error);
      // 失败时使用原标题
      rssItems.forEach(item => {
        if (item.title && item.title.trim().length > 0) {
          broadcast += `• ${item.title}\n`;
        }
      });
      broadcast += `\n`;
    }
  }

  // 5. 今日总结
  if (aiAnalysis?.conclusion) {
    broadcast += `【今日总结】\n`;
    broadcast += aiAnalysis.conclusion;
    broadcast += `\n`;
  } else if (aiAnalysis?.summary) {
    broadcast += `【今日总结】\n`;
    broadcast += aiAnalysis.summary;
    broadcast += `\n`;
  }

  return broadcast;
}

/**
 * 生成新闻播报稿（主函数）
 * @param data 中文新闻数据
 * @returns 格式化的播报稿文本
 */
export async function generateNewsBroadcast(data: ChinaNewsData): Promise<string> {
  try {
    // Step 1: 提取并清理所有新闻标题
    const newsHeadlines = extractAndCleanHeadlines(data.hotlist_news);

    // Step 2: 解析 AI 分析结果
    const aiAnalysis = parseAIAnalysis(data.ai_analysis.result);

    // Step 3: 提取 RSS 项目
    const rssItems = extractRSSItems(data.rss_feeds);

    // Step 4: 整合成播报稿
    const broadcast = await assembleBroadcast({
      statistics: data.statistics,
      time: data.time,
      newsHeadlines,
      aiAnalysis,
      rssItems
    });

    return broadcast;
  } catch (error) {
    console.error('Failed to generate news broadcast:', error);
    return '无法生成新闻播报，请稍后重试。';
  }
}
