import { getFirestore, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import app from '../services/firebase';
import { translateRSSHeadlines } from '../services/translationService';

/**
 * 从真实的 news_stanseradar_china 数据生成播报
 * Usage in browser console: generateRealBroadcast('2026-01-22_09-01')
 */
export async function generateRealBroadcast(docId: string) {
  console.log(`═══════════════ 从真实数据生成播报: ${docId} ═══════════════\n`);

  try {
    const db = getFirestore(app);

    // 1. 获取原始数据
    console.log('📥 获取原始数据...');
    const sourceRef = doc(db, 'news_stanseradar_china', docId);
    const sourceSnap = await getDoc(sourceRef);

    if (!sourceSnap.exists()) {
      console.log('❌ 原始文档不存在:', docId);
      return null;
    }

    const data = sourceSnap.data();
    console.log('✅ 原始数据获取成功');
    console.log('  新闻数:', data.statistics?.hotlist?.total || 0);
    console.log('  RSS 数:', data.statistics?.rss?.matched || 0);

    // 2. 生成播报稿
    console.log('\n📝 生成播报稿...');
    const broadcast = await generateBroadcastFromData(data);

    console.log('✅ 播报稿生成成功');
    console.log('  字符数:', broadcast.length);

    // 3. 存储到 consolidated collection
    console.log('\n💾 存储到 news_stanseradar_china_consolidated...');

    const consolidatedDoc = {
      metadata: {
        source_doc_id: docId,
        source_collection: 'news_stanseradar_china',
        version: data.metadata?.version || '5.0.0',
        created_at: Timestamp.now(),
        source_project: data.metadata?.source_project || 'gen-lang-client-0960644135',
        timezone: data.metadata?.timezone || 'Asia/Shanghai'
      },
      time: {
        beijing_time: data.time?.beijing_time || '',
        crawl_date: data.time?.crawl_date || '',
        crawl_time: data.time?.crawl_time || '',
        generated_at: Timestamp.now()
      },
      statistics: data.statistics || {},
      broadcast: broadcast,
      broadcast_length: broadcast.length,
      language: 'zh',
      processing: {
        translated_rss: data.statistics?.rss?.matched || 0,
        extracted_news: data.statistics?.hotlist?.total || 0,
        has_ai_analysis: !!(data.ai_analysis && data.ai_analysis.result)
      }
    };

    await setDoc(doc(db, 'news_stanseradar_china_consolidated', docId), consolidatedDoc);

    console.log('✅ 播报已保存');
    console.log('\n请刷新页面查看 THE CHINA 部分！');
    console.log('═══════════════════════════════════════════════════\n');

    return consolidatedDoc;
  } catch (error) {
    console.error('❌ 生成失败:', error);
    return null;
  }
}

/**
 * 从数据生成播报稿
 */
async function generateBroadcastFromData(data: any): Promise<string> {
  let broadcast = '';

  const stats = data.statistics || {};
  const platforms = stats.platforms?.success || 0;
  const hotlistTotal = stats.hotlist?.total || 0;
  const rssMatched = stats.rss?.matched || 0;
  const beijingTime = data.time?.beijing_time || '';

  // 1. 今日摘要
  // 格式化时间为友好格式：周几 月日 北京时间 上午/下午 时
  let friendlyTime = beijingTime;
  try {
    const timeMatch = beijingTime.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):/);
    if (timeMatch) {
      const [, year, month, day, hour] = timeMatch;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const weekday = weekdays[date.getDay()];
      const hourNum = parseInt(hour);
      const period = hourNum < 12 ? '上午' : '下午';
      const displayHour = hourNum === 0 ? 12 : (hourNum > 12 ? hourNum - 12 : hourNum);
      friendlyTime = `今天${weekday} ${parseInt(month)}月${parseInt(day)}号 北京时间${period}${displayHour}点`;
    }
  } catch (e) {
    // 如果解析失败，使用原始时间
  }

  broadcast += `【今日摘要】\n`;
  broadcast += `这是最新的中国专区动态，截止到${friendlyTime}，以下是重点关注：\n\n`;

  // 2. 热点新闻
  const allNewsItems: any[] = [];
  if (data.hotlist_news && data.hotlist_news.keyword_groups) {
    for (const group of data.hotlist_news.keyword_groups) {
      if (group.news_items) {
        allNewsItems.push(...group.news_items);
      }
    }
  }

  allNewsItems.sort((a, b) => (a.rank || 999) - (b.rank || 999));

  const cleanHeadlines = allNewsItems.map((item: any) => {
    let title = item.title || '';
    title = title
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[#\d\s]+/, '')
      .trim();
    return title;
  }).filter((t: string) => t.length > 0);

  // 去重（使用 Set）
  const uniqueHeadlines = Array.from(new Set(cleanHeadlines));

  if (uniqueHeadlines.length > 0) {
    broadcast += `【热点新闻】\n`;
    const topNews = uniqueHeadlines.slice(0, 20);
    topNews.forEach((headline: string) => {
      broadcast += `• ${headline}\n`;
    });
    if (uniqueHeadlines.length > 20) {
      broadcast += `... 及其他 ${uniqueHeadlines.length - 20} 条新闻\n`;
    }
    broadcast += `\n`;
  }

  // 3. AI 深度分析
  if (data.ai_analysis && data.ai_analysis.result) {
    try {
      // 如果 result 已经是对象，直接使用；如果是字符串，才 parse
      const aiResult = typeof data.ai_analysis.result === 'string'
        ? JSON.parse(data.ai_analysis.result)
        : data.ai_analysis.result;

      broadcast += `【AI 深度分析】\n`;

      if (aiResult.keyword_analysis) {
        const content = typeof aiResult.keyword_analysis === 'string'
          ? aiResult.keyword_analysis
          : JSON.stringify(aiResult.keyword_analysis);
        broadcast += `▸ 关键词分析：${content}\n`;
      }

      if (aiResult.sentiment) {
        const content = typeof aiResult.sentiment === 'string'
          ? aiResult.sentiment
          : JSON.stringify(aiResult.sentiment);
        broadcast += `▸ 情绪分析：${content}\n`;
      }

      if (aiResult.signals) {
        const content = typeof aiResult.signals === 'string'
          ? aiResult.signals
          : JSON.stringify(aiResult.signals);
        broadcast += `▸ 关键信号：${content}\n`;
      }

      if (aiResult.cross_platform) {
        const content = typeof aiResult.cross_platform === 'string'
          ? aiResult.cross_platform
          : JSON.stringify(aiResult.cross_platform);
        broadcast += `▸ 跨平台分析：${content}\n`;
      }

      if (aiResult.impact) {
        const content = typeof aiResult.impact === 'string'
          ? aiResult.impact
          : JSON.stringify(aiResult.impact);
        broadcast += `▸ 影响分析：${content}\n`;
      }

      const conclusionText = aiResult.conclusion || aiResult.summary;
      if (conclusionText) {
        broadcast += `▸ 总结：${conclusionText}\n`;
      }

      broadcast += `\n`;
    } catch (error) {
      console.error('Failed to parse AI analysis:', error);
    }
  }

  // 4. RSS 动态
  const rssItems: any[] = [];
  if (data.rss_feeds && data.rss_feeds.matched_items) {
    for (const feed of data.rss_feeds.matched_items) {
      if (feed.items) {
        for (const item of feed.items) {
          if (item.title && item.title.trim().length > 0) {
            rssItems.push(item);
          }
        }
      }
    }
  }

  if (rssItems.length > 0) {
    broadcast += `【其他RSS动态】\n`;

    try {
      const translatedTitles = await translateRSSHeadlines(rssItems);
      translatedTitles.forEach((title: string) => {
        if (title && title.trim().length > 0) {
          broadcast += `• ${title}\n`;
        }
      });
    } catch (error) {
      console.error('Translation failed:', error);
      rssItems.forEach((item: any) => {
        broadcast += `• ${item.title}\n`;
      });
    }

    broadcast += `\n`;
  }

  // 5. 今日总结
  broadcast += `【今日总结】\n`;
  broadcast += `今日监测${platforms}个平台，共${hotlistTotal}条热榜新闻`;
  if (rssMatched > 0) {
    broadcast += `，${rssMatched}条国际科技订阅`;
  }
  broadcast += `。希望您喜欢。\n`;

  return broadcast;
}

/**
 * 生成最新记录的播报
 * Usage: generateLatestBroadcast()
 */
export async function generateLatestBroadcast() {
  console.log('═══════════════ 生成最新播报 ═══════════════\n');

  try {
    const db = getFirestore(app);

    // 查询最新的原始文档
    console.log('🔍 查找最新文档...');

    // 动态生成最近几小时的文档ID列表
    const now = new Date();
    const recentIds: string[] = [];

    // 生成最近12小时的可能文档ID（每2小时一个）
    for (let i = 0; i < 12; i++) {
      const testDate = new Date(now.getTime() - i * 2 * 60 * 60 * 1000);
      const year = testDate.getFullYear();
      const month = String(testDate.getMonth() + 1).padStart(2, '0');
      const day = String(testDate.getDate()).padStart(2, '0');
      const hour = String(testDate.getHours()).padStart(2, '0');
      const docId = `${year}-${month}-${day}_${hour}-01`;
      recentIds.push(docId);
    }

    console.log('📋 尝试查找文档:', recentIds.slice(0, 3).join(', '), '...');

    for (const docId of recentIds) {
      const docRef = doc(db, 'news_stanseradar_china', docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        console.log('✅ 找到最新文档:', docId);
        return await generateRealBroadcast(docId);
      }
    }

    console.log('❌ 未找到可用的文档');
    console.log('请手动指定文档ID: generateRealBroadcast("YYYY-MM-DD_HH-01")');
    return null;
  } catch (error) {
    console.error('❌ 失败:', error);
    return null;
  }
}

// 使函数在浏览器控制台可用
if (typeof window !== 'undefined') {
  (window as any).generateRealBroadcast = generateRealBroadcast;
  (window as any).generateLatestBroadcast = generateLatestBroadcast;
}
