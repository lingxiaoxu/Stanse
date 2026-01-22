import { getLatestChinaNewsBroadcast, getChinaNewsBroadcastByDocId } from '../services/chinaNewsService';
import { queryChinaNewsDocument } from './queryChinaNews';

/**
 * 测试获取最新的中文新闻播报
 * Usage in browser console: testLatestBroadcast()
 */
export async function testLatestBroadcast() {
  console.log('═══════════════ 测试最新中文新闻播报 ═══════════════\n');

  try {
    const data = await getLatestChinaNewsBroadcast();

    if (!data) {
      console.log('❌ 未找到播报数据');
      return null;
    }

    console.log('✅ 成功获取播报数据\n');
    console.log('【文档信息】');
    console.log('  • Source Doc ID:', data.metadata.source_doc_id);
    console.log('  • Version:', data.metadata.version);
    console.log('  • 北京时间:', data.time.beijing_time);
    console.log('');

    console.log('【统计信息】');
    console.log('  • 平台数:', data.statistics.platforms.success, '/', data.statistics.platforms.total);
    console.log('  • 热榜新闻:', data.statistics.hotlist.total, '条');
    console.log('  • RSS 订阅:', data.statistics.rss.matched, '条');
    console.log('');

    console.log('【播报内容】');
    console.log('  • 字符数:', data.broadcast_length);
    console.log('  • 翻译 RSS:', data.processing.translated_rss, '条');
    console.log('  • AI 分析:', data.processing.has_ai_analysis ? '是' : '否');
    console.log('');

    console.log('【播报稿预览】（前500字符）');
    console.log(data.broadcast.substring(0, 500));
    console.log('\n...(完整内容请查看 data.broadcast)');
    console.log('');

    console.log('═══════════════════════════════════════════════════\n');

    return data;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return null;
  }
}

/**
 * 测试获取指定文档的播报
 * Usage in browser console: testBroadcastByDocId('2026-01-22_09-01')
 */
export async function testBroadcastByDocId(docId: string) {
  console.log(`═══════════════ 测试播报文档: ${docId} ═══════════════\n`);

  try {
    const data = await getChinaNewsBroadcastByDocId(docId);

    if (!data) {
      console.log('❌ 未找到该文档');
      return null;
    }

    console.log('✅ 成功获取播报数据\n');
    console.log('【播报稿完整内容】\n');
    console.log(data.broadcast);
    console.log('');
    console.log('═══════════════════════════════════════════════════\n');

    return data;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return null;
  }
}

/**
 * 对比原始数据和播报数据
 * Usage in browser console: compareBroadcastData('2026-01-22_09-01')
 */
export async function compareBroadcastData(docId: string) {
  console.log(`═══════════════ 对比原始数据和播报 ═══════════════\n`);

  try {
    // 获取原始数据
    const originalData = await queryChinaNewsDocument(docId);

    // 获取播报数据
    const broadcastData = await getChinaNewsBroadcastByDocId(docId);

    if (!originalData || !broadcastData) {
      console.log('❌ 数据不完整');
      return null;
    }

    console.log('【原始数据】');
    console.log('  • 新闻总数:', originalData.statistics?.hotlist?.total || 0);
    console.log('  • RSS 数量:', originalData.statistics?.rss?.matched || 0);
    console.log('  • AI 分析长度:', originalData.ai_analysis?.result?.length || 0, '字符');
    console.log('');

    console.log('【播报数据】');
    console.log('  • 提取新闻数:', broadcastData.processing.extracted_news);
    console.log('  • 翻译 RSS 数:', broadcastData.processing.translated_rss);
    console.log('  • 播报稿长度:', broadcastData.broadcast_length, '字符');
    console.log('  • 包含 AI 分析:', broadcastData.processing.has_ai_analysis ? '是' : '否');
    console.log('');

    console.log('【数据一致性检查】');
    const newsMatch = originalData.statistics?.hotlist?.total === broadcastData.processing.extracted_news;
    const rssMatch = originalData.statistics?.rss?.matched === broadcastData.processing.translated_rss;

    console.log('  • 新闻数量:', newsMatch ? '✅ 一致' : '⚠️ 不一致');
    console.log('  • RSS 数量:', rssMatch ? '✅ 一致' : '⚠️ 不一致');
    console.log('');

    console.log('═══════════════════════════════════════════════════\n');

    return {
      original: originalData,
      broadcast: broadcastData,
      match: { newsMatch, rssMatch }
    };
  } catch (error) {
    console.error('❌ 对比失败:', error);
    return null;
  }
}

/**
 * 显示播报稿的完整格式化内容
 * Usage in browser console: showFormattedBroadcast('2026-01-22_09-01')
 */
export async function showFormattedBroadcast(docId?: string) {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                  中文新闻播报完整内容                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    const data = docId
      ? await getChinaNewsBroadcastByDocId(docId)
      : await getLatestChinaNewsBroadcast();

    if (!data) {
      console.log('❌ 未找到播报数据');
      return null;
    }

    console.log(`📅 ${data.time.beijing_time}`);
    console.log(`📊 ${data.statistics.platforms.success}个平台 · ${data.statistics.hotlist.total}条新闻\n`);
    console.log('─────────────────────────────────────────────────────────────\n');

    // 显示播报内容
    console.log(data.broadcast);

    console.log('\n─────────────────────────────────────────────────────────────');
    console.log(`\n字符总数: ${data.broadcast_length}`);
    console.log(`数据来源: ${data.metadata.source_project} v${data.metadata.version}\n`);

    return data;
  } catch (error) {
    console.error('❌ 显示失败:', error);
    return null;
  }
}

// 使函数在浏览器控制台可用
if (typeof window !== 'undefined') {
  (window as any).testLatestBroadcast = testLatestBroadcast;
  (window as any).testBroadcastByDocId = testBroadcastByDocId;
  (window as any).compareBroadcastData = compareBroadcastData;
  (window as any).showFormattedBroadcast = showFormattedBroadcast;
}
