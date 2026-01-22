import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import app from '../services/firebase';

/**
 * 创建测试播报文档（用于前端测试）
 * Usage in browser console: createTestBroadcast()
 */
export async function createTestBroadcast() {
  console.log('═══════════════ 创建测试播报 ═══════════════\n');

  try {
    const db = getFirestore(app);

    const testDoc = {
      metadata: {
        source_doc_id: '2026-01-22_09-01',
        source_collection: 'news_stanseradar_china',
        version: '5.0.0',
        created_at: Timestamp.now(),
        source_project: 'gen-lang-client-0960644135',
        timezone: 'Asia/Shanghai'
      },
      time: {
        beijing_time: '2026-01-22 09:01:12',
        crawl_date: '2026-01-22',
        crawl_time: '09:01',
        generated_at: Timestamp.now()
      },
      statistics: {
        platforms: { total: 11, success: 11, failed: 0 },
        rss: { total: 0, new: 0, matched: 3, filtered: 0 },
        hotlist: { total: 53, new: 0, matched: 53 },
        combined: { total: 53, new: 0, matched: 56 }
      },
      broadcast: `【今日摘要】
这是最新的中国专区动态，截止到今天周三 1月22号 北京时间 9点，以下是重点关注：

【热点新闻】
• 美国贸易代表：想和中国再谈谈，但不谈稀土
• 英国批准中国在伦敦新建使馆，凤凰记者实地探访
• 中国第二个5万亿城市诞生
• U23亚洲杯历史性晋级决赛：胜利对中国足球真的很重要
• 中国 GDP 首破 140 万亿增速 5%，140 万亿意味着什么？在全球经济中处于什么水平？
• 日债风暴叠加格陵兰危机，"抛售美国"重现，美股债汇三杀，黄金再新高，加密货币重挫
• 加拿大总理卡尼重磅演讲：基于规则的秩序已死，中等强国应团结行动，抵制某些大国胁迫
• 美国赢学升级,懂王天天开赢趴
• 沪指冲高回落微幅收涨，AI硬件端卷土重来，机器人概念人气股罕见走出16连板
• 图灵的猫回应预测韩服AI疑云

【AI 深度分析】
▸ 关键词分析：中美贸易、经济数据、国际关系成为今日讨论焦点
▸ 情绪分析：市场整体呈现中性偏正面态势，投资者信心保持稳定
▸ 关键信号：GDP数据超预期增长，国际地位持续提升
▸ 跨平台分析：贸易相关话题在8个主流平台获得广泛讨论，热度最高
▸ 影响分析：经济数据发布对市场情绪产生积极影响，政策预期向好
▸ 总结：今日新闻聚焦中国经济增长与国际影响力提升，GDP突破140万亿大关标志着经济韧性

【其他RSS动态】
• 等待搜索引擎的黎明：搜索索引、谷歌裁决及对 Kagi 的影响
• Claude 的新宪法：Anthropic 发布 AI 伦理更新
• Autonomous 招聘：零佣金 AI 原生理财顾问

【今日总结】
今日监测11个平台，共53条热榜新闻，3条国际科技订阅。希望您喜欢。`,
      broadcast_length: 650,
      language: 'zh',
      processing: {
        translated_rss: 3,
        extracted_news: 53,
        has_ai_analysis: true
      }
    };

    await setDoc(doc(db, 'news_stanseradar_china_consolidated', '2026-01-22_09-01'), testDoc);

    console.log('✅ 测试播报已创建');
    console.log('Document ID: 2026-01-22_09-01');
    console.log('Broadcast length:', testDoc.broadcast_length);
    console.log('\n请刷新页面查看 THE CHINA 部分！');

    return testDoc;
  } catch (error) {
    console.error('❌ 创建失败:', error);
    return null;
  }
}

// 使函数在浏览器控制台可用
if (typeof window !== 'undefined') {
  (window as any).createTestBroadcast = createTestBroadcast;
}
