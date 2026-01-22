# 15. China News Feed UI Design - V2 简化版

## 概述

在 Feed 界面最下方添加一个**单一框架**，展示整合后的中文新闻播报稿。仅在用户选择中文语言时显示。

## 设计原则

1. **极简主义**：单一框架，无折叠，无交互
2. **统一样式**：与 Market 分析框样式一致
3. **自动整合**：将所有数据整合成连贯的播报稿
4. **纯文本展示**：清晰的层级和字体样式

---

## UI 设计方案

### 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│                        Feed View                                 │
│  (现有的 Feed 内容 - 各种新闻卡片)                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Market Analysis (现有)                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  🇨🇳 今日中文新闻速报            [StanseRadar China]  2026-01-22 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                   │
│  【今日摘要】                                                     │
│  今日监测11个平台，共53条热榜新闻，3条国际科技订阅。以下是       │
│  今日重点新闻播报：                                               │
│                                                                   │
│  【热点新闻】                                                     │
│  • 美国贸易代表：想和中国再谈谈，但不谈稀土                       │
│  • 英国批准中国在伦敦新建使馆，凤凰记者实地探访                   │
│  • 中国第二个5万亿城市诞生                                       │
│  • U23亚洲杯历史性晋级决赛：胜利对中国足球真的很重要             │
│  • 中国 GDP 首破 140 万亿增速 5%，在全球经济中处于领先水平      │
│  ... (更多新闻标题)                                               │
│                                                                   │
│  【AI 深度分析】                                                  │
│  今日新闻呈现以下特点：                                           │
│  ▸ 主要话题：中美贸易、经济数据、国际关系                         │
│  ▸ 情绪倾向：整体中性偏正面，市场信心稳定                         │
│  ▸ 关键信号：GDP数据超预期，国际地位持续提升                     │
│  ▸ 跨平台热度：贸易话题覆盖8个平台，讨论度最高                   │
│                                                                   │
│  【国际科技动态】                                                 │
│  • 等待搜索引擎的黎明：搜索索引、谷歌裁决及对 Kagi 的影响        │
│  • Claude 的新宪法：Anthropic 发布 AI 伦理更新                   │
│  • Autonomous 招聘：零佣金 AI 原生理财顾问                       │
│                                                                   │
│  【今日总结】                                                     │
│  今日新闻聚焦中国经济增长与国际影响力提升，GDP突破140万亿         │
│  大关标志着经济韧性。中美贸易谈判持续进行，稀土话题成为焦点。     │
│  国际科技领域，AI伦理与搜索引擎竞争成为热点。整体而言，           │
│  市场情绪稳定，关注长期发展趋势。                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据处理流程

### 输入数据源

```typescript
interface ChinaNewsData {
  // 1. 热榜新闻标题
  hotlist_news: {
    keyword_groups: Array<{
      news_items: Array<{
        title: string;
        rank: number;
        rank_class: string;
      }>;
    }>;
  };

  // 2. AI 分析结果
  ai_analysis: {
    result: string;  // JSON 字符串，包含所有分析字段
  };

  // 3. RSS 订阅
  rss_feeds: {
    matched_items: Array<{
      items: Array<{
        title: string;
        author: string;
      }>;
    }>;
  };

  // 4. 统计数据
  statistics: {
    platforms: { success: number };
    hotlist: { total: number };
    rss: { matched: number };
  };

  // 5. 时间信息
  time: {
    beijing_time: string;
  };
}
```

### 数据处理逻辑

```typescript
// services/chinaNewsBroadcastService.ts

/**
 * 生成新闻播报稿
 */
export function generateNewsBroadcast(data: ChinaNewsData): string {
  // Step 1: 提取并清理所有新闻标题
  const newsHeadlines = extractAndCleanHeadlines(data.hotlist_news);

  // Step 2: 解析 AI 分析结果
  const aiAnalysis = parseAIAnalysis(data.ai_analysis.result);

  // Step 3: 提取并翻译 RSS 标题
  const rssHeadlines = extractAndTranslateRSS(data.rss_feeds);

  // Step 4: 整合成播报稿
  return assembleBroadcast({
    statistics: data.statistics,
    time: data.time,
    newsHeadlines,
    aiAnalysis,
    rssHeadlines
  });
}

/**
 * Step 1: 提取并清理新闻标题
 */
function extractAndCleanHeadlines(hotlistNews: any): string[] {
  const allItems = hotlistNews.keyword_groups
    .flatMap((group: any) => group.news_items || [])
    .sort((a: any, b: any) => a.rank - b.rank);  // 按排名排序

  return allItems.map((item: any) => {
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
 * Step 2: 解析 AI 分析结果
 */
function parseAIAnalysis(resultString: string): AIAnalysisData {
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
 * Step 3: 提取并翻译 RSS 标题
 */
async function extractAndTranslateRSS(rssFeeds: any): Promise<string[]> {
  const allRSSItems = rssFeeds.matched_items
    .flatMap((feed: any) => feed.items || []);

  const titles = allRSSItems.map((item: any) => item.title);

  // 如果是英文，调用翻译 API（使用 Gemini）
  const translatedTitles = await Promise.all(
    titles.map(async (title: string) => {
      if (isEnglish(title)) {
        return await translateToChinese(title);
      }
      return title;
    })
  );

  return translatedTitles;
}

/**
 * 检测是否为英文
 */
function isEnglish(text: string): boolean {
  const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  return englishRatio > 0.5;
}

/**
 * 翻译成中文（使用 Gemini API）
 */
async function translateToChinese(text: string): Promise<string> {
  // 使用 geminiService 翻译
  // 注意：从 Secret Manager 获取 API key
  const prompt = `将以下英文新闻标题翻译成中文，保持简洁：\n${text}`;
  const translation = await callGeminiAPI(prompt);
  return translation;
}

/**
 * Step 4: 整合成播报稿
 */
function assembleBroadcast(data: BroadcastData): string {
  const {
    statistics,
    time,
    newsHeadlines,
    aiAnalysis,
    rssHeadlines
  } = data;

  let broadcast = '';

  // 1. 今日摘要
  broadcast += `【今日摘要】\n`;
  broadcast += `今日监测${statistics.platforms.success}个平台，`;
  broadcast += `共${statistics.hotlist.total}条热榜新闻，`;
  broadcast += `${statistics.rss.matched}条国际科技订阅。`;
  broadcast += `以下是今日重点新闻播报：\n\n`;

  // 2. 热点新闻（前15-20条）
  broadcast += `【热点新闻】\n`;
  const topNews = newsHeadlines.slice(0, 20);
  topNews.forEach((headline, idx) => {
    broadcast += `• ${headline}\n`;
  });
  broadcast += `\n`;

  // 3. AI 深度分析
  if (aiAnalysis) {
    broadcast += `【AI 深度分析】\n`;
    broadcast += `今日新闻呈现以下特点：\n`;

    // 关键词分析
    if (aiAnalysis.keyword_analysis?.length > 0) {
      const topKeywords = aiAnalysis.keyword_analysis.slice(0, 3);
      broadcast += `▸ 主要话题：${topKeywords.join('、')}\n`;
    }

    // 情绪倾向
    if (aiAnalysis.sentiment) {
      broadcast += `▸ 情绪倾向：${formatSentiment(aiAnalysis.sentiment)}\n`;
    }

    // 关键信号
    if (aiAnalysis.signals?.length > 0) {
      const topSignals = aiAnalysis.signals.slice(0, 2);
      broadcast += `▸ 关键信号：${topSignals.join('，')}\n`;
    }

    // 跨平台分析
    if (aiAnalysis.cross_platform) {
      broadcast += `▸ 跨平台热度：${formatCrossPlatform(aiAnalysis.cross_platform)}\n`;
    }

    broadcast += `\n`;
  }

  // 4. 国际科技动态
  if (rssHeadlines.length > 0) {
    broadcast += `【国际科技动态】\n`;
    rssHeadlines.forEach(headline => {
      broadcast += `• ${headline}\n`;
    });
    broadcast += `\n`;
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
 * 格式化情绪分析
 */
function formatSentiment(sentiment: any): string {
  const { overall, positive, negative, neutral } = sentiment;
  return `整体${overall || '中性'}，市场信心${positive > 50 ? '较强' : '稳定'}`;
}

/**
 * 格式化跨平台分析
 */
function formatCrossPlatform(crossPlatform: any): string {
  const topTopic = Object.entries(crossPlatform)
    .sort(([, a]: any, [, b]: any) => b.count - a.count)[0];

  if (topTopic) {
    const [topic, data] = topTopic as [string, any];
    return `${topic}覆盖${data.platforms || 0}个平台，讨论度最高`;
  }
  return '各话题热度均衡';
}
```

---

## UI 实现

### 组件结构

```typescript
// components/ChinaNewsBroadcast.tsx

import React, { useEffect, useState } from 'react';
import { PixelCard } from '../ui/PixelCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { Language } from '../../types';
import { getLatestChinaNews, generateNewsBroadcast } from '../../services/chinaNewsService';

export const ChinaNewsBroadcast: React.FC = () => {
  const { language } = useLanguage();
  const [broadcast, setBroadcast] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [timestamp, setTimestamp] = useState<string>('');

  useEffect(() => {
    if (language !== Language.ZH) return;

    loadBroadcast();
  }, [language]);

  const loadBroadcast = async () => {
    try {
      setLoading(true);
      const data = await getLatestChinaNews();

      if (data) {
        const broadcastText = await generateNewsBroadcast(data);
        setBroadcast(broadcastText);
        setTimestamp(data.time.beijing_time);
      }
    } catch (error) {
      console.error('Failed to load China news broadcast:', error);
    } finally {
      setLoading(false);
    }
  };

  // 只在中文时显示
  if (language !== Language.ZH) {
    return null;
  }

  if (loading) {
    return (
      <PixelCard className="china-broadcast-card loading">
        <div className="loading-state">加载中...</div>
      </PixelCard>
    );
  }

  if (!broadcast) {
    return null;
  }

  return (
    <PixelCard className="china-broadcast-card">
      {/* Header */}
      <div className="broadcast-header">
        <div className="title-row">
          <span className="flag">🇨🇳</span>
          <h3 className="title">今日中文新闻速报</h3>
        </div>
        <div className="meta-row">
          <span className="source-badge">StanseRadar China</span>
          <span className="timestamp">{timestamp}</span>
        </div>
      </div>

      {/* Content */}
      <div className="broadcast-content">
        <BroadcastText text={broadcast} />
      </div>
    </PixelCard>
  );
};

/**
 * 格式化播报文本
 */
const BroadcastText: React.FC<{ text: string }> = ({ text }) => {
  // 将文本分段并应用不同样式
  const sections = text.split(/\n\n+/);

  return (
    <div className="broadcast-text">
      {sections.map((section, idx) => {
        const isHeader = section.startsWith('【') && section.includes('】');

        if (isHeader) {
          return (
            <SectionHeader key={idx} text={section} />
          );
        }

        return (
          <SectionContent key={idx} text={section} />
        );
      })}
    </div>
  );
};

/**
 * 章节标题（使用新闻标题字体）
 */
const SectionHeader: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="section-header">
      {text}
    </div>
  );
};

/**
 * 章节内容（使用新闻body字体）
 */
const SectionContent: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').filter(line => line.trim());

  return (
    <div className="section-content">
      {lines.map((line, idx) => {
        // 如果是列表项（以 • 或 ▸ 开头）
        if (line.startsWith('•') || line.startsWith('▸')) {
          return (
            <div key={idx} className="list-item">
              {line}
            </div>
          );
        }

        // 普通段落
        return (
          <p key={idx} className="paragraph">
            {line}
          </p>
        );
      })}
    </div>
  );
};
```

---

## 样式定义

```scss
// styles/ChinaNewsBroadcast.module.scss

.china-broadcast-card {
  // 与 Market Analysis 卡片样式一致
  margin-top: 2rem;
  border-left: 4px solid var(--china-accent);

  &.loading {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .broadcast-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--border-color);

    .title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;

      .flag {
        font-size: 1.5rem;
      }

      .title {
        // 使用新闻标题字体
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--china-accent);
        margin: 0;
      }
    }

    .meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.875rem;
      color: var(--text-secondary);

      .source-badge {
        padding: 0.25rem 0.75rem;
        background: var(--china-accent-light);
        border-radius: 9999px;
        font-weight: 500;
      }

      .timestamp {
        color: var(--text-tertiary);
      }
    }
  }

  .broadcast-content {
    .broadcast-text {
      .section-header {
        // 使用新闻标题字体
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;

        &:first-child {
          margin-top: 0;
        }
      }

      .section-content {
        // 使用新闻body字体
        font-size: 0.9375rem;
        line-height: 1.7;
        color: var(--text-secondary);

        .list-item {
          margin-bottom: 0.5rem;
          padding-left: 0.5rem;
        }

        .paragraph {
          margin-bottom: 0.75rem;
          text-align: justify;

          &:last-child {
            margin-bottom: 0;
          }
        }
      }
    }
  }
}

// 颜色变量
:root {
  --china-accent: #dc2626;
  --china-accent-light: #fca5a5;
}
```

---

## 集成到 FeedView

```typescript
// components/views/FeedView.tsx

import { ChinaNewsBroadcast } from '../ChinaNewsBroadcast';

export const FeedView: React.FC = () => {
  // ... 现有代码

  return (
    <div className="feed-container">
      {/* 现有 Feed 内容 */}
      <Feed />

      {/* Market Analysis */}
      <MarketAnalysis />

      {/* 中文新闻播报 - 仅在中文时显示 */}
      <ChinaNewsBroadcast />
    </div>
  );
};
```

---

## Firebase Function 监听

```typescript
// functions/src/chinaNewsListener.ts

import * as functions from 'firebase-functions';
import * as admin from 'admin';

export const onChinaNewsCreate = functions.firestore
  .document('news_stanseradar_china/{docId}')
  .onCreate(async (snapshot, context) => {
    const docId = context.params.docId;
    const data = snapshot.data();

    // 更新缓存文档
    await admin.firestore()
      .collection('cache')
      .doc('latest_china_news')
      .set({
        docId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        data: data
      });

    console.log(`Updated latest China news: ${docId}`);
  });
```

---

## 翻译服务

```typescript
// services/translationService.ts

import { getGeminiAPIKey } from './secretManager';

/**
 * 使用 Gemini 翻译文本
 */
export async function translateToChineseWithGemini(
  text: string
): Promise<string> {
  try {
    const apiKey = await getGeminiAPIKey();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `将以下英文新闻标题翻译成简洁的中文，只返回翻译结果，不要其他内容：\n\n${text}`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 100
          }
        })
      }
    );

    const result = await response.json();
    return result.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error('Translation failed:', error);
    return text;  // 失败时返回原文
  }
}

/**
 * 批量翻译
 */
export async function batchTranslate(texts: string[]): Promise<string[]> {
  return Promise.all(
    texts.map(text => translateToChineseWithGemini(text))
  );
}
```

---

## 预期输出示例

```
【今日摘要】
今日监测11个平台，共53条热榜新闻，3条国际科技订阅。以下是今日重点新闻播报：

【热点新闻】
• 美国贸易代表：想和中国再谈谈，但不谈稀土
• 英国批准中国在伦敦新建使馆，凤凰记者实地探访
• 中国第二个5万亿城市诞生
• U23亚洲杯历史性晋级决赛：胜利对中国足球真的很重要
• 中国 GDP 首破 140 万亿增速 5%，140 万亿意味着什么？在全球经济中处于什么水平？
• 日债风暴叠加格陵兰危机，"抛售美国"重现，美股债汇三杀，黄金再新高
• 加拿大总理卡尼重磅演讲：基于规则的秩序已死，中等强国应团结行动
• 美国赢学升级，懂王天天开赢趴
• 沪指冲高回落微幅收涨，AI硬件端卷土重来，机器人概念人气股罕见走出16连板
• 图灵的猫回应预测韩服AI疑云
• 沪指震荡，上证50ETF成交创历史天量，AI算力产业链爆发
... (更多新闻)

【AI 深度分析】
今日新闻呈现以下特点：
▸ 主要话题：中美贸易、经济数据、国际关系
▸ 情绪倾向：整体中性偏正面，市场信心稳定
▸ 关键信号：GDP数据超预期，国际地位持续提升
▸ 跨平台热度：贸易话题覆盖8个平台，讨论度最高

【国际科技动态】
• 等待搜索引擎的黎明：搜索索引、谷歌裁决及对 Kagi 的影响
• Claude 的新宪法：Anthropic 发布 AI 伦理更新
• Autonomous 招聘：零佣金 AI 原生理财顾问

【今日总结】
今日新闻聚焦中国经济增长与国际影响力提升，GDP突破140万亿大关标志着经济韧性。中美贸易谈判持续进行，稀土话题成为焦点。国际科技领域，AI伦理与搜索引擎竞争成为热点。整体而言，市场情绪稳定，关注长期发展趋势。
```

---

## 实现顺序

1. ✅ **Phase 1**: 数据服务
   - `chinaNewsService.ts` - 获取最新数据
   - `chinaNewsBroadcastService.ts` - 生成播报稿
   - `translationService.ts` - RSS 翻译

2. ✅ **Phase 2**: UI 组件
   - `ChinaNewsBroadcast.tsx` - 主组件
   - 样式文件
   - 集成到 FeedView

3. ✅ **Phase 3**: Firebase Function
   - 监听 `news_stanseradar_china` 创建事件
   - 更新缓存文档

4. ✅ **Phase 4**: 优化
   - 错误处理
   - 加载状态
   - 缓存策略

---

## 技术要点

### 字体选择规则

```typescript
// 章节标题（【...】）-> 新闻标题字体
.section-header {
  font-size: 1.125rem;
  font-weight: 700;
}

// 列表项（• ...）-> 新闻标题字体
.list-item {
  font-size: 1rem;
  font-weight: 600;
}

// 段落内容 -> 新闻body字体
.paragraph {
  font-size: 0.9375rem;
  line-height: 1.7;
  font-weight: 400;
}
```

### 数据更新策略

```typescript
// 实时监听缓存文档
useEffect(() => {
  if (language !== Language.ZH) return;

  const unsubscribe = onSnapshot(
    doc(db, 'cache', 'latest_china_news'),
    (snapshot) => {
      const data = snapshot.data();
      if (data) {
        const broadcastText = generateNewsBroadcast(data.data);
        setBroadcast(broadcastText);
      }
    }
  );

  return () => unsubscribe();
}, [language]);
```

---

## 预估尺寸

- **默认高度**: 600-800px（取决于内容长度）
- **宽度**: 与其他卡片一致（100% 容器宽度）
- **间距**: 与 Market Analysis 间距 2rem

---

## 总结

**极简方案特点**：
- ✅ 单一框架，样式统一
- ✅ 自动整合所有数据源
- ✅ 纯文本播报，易读性强
- ✅ 仅中文时显示
- ✅ 实现简单，维护方便

**下一步**：审阅设计后开始实现

---

**文档创建日期**: 2026-01-22
