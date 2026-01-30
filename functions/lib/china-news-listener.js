"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onChinaNewsCreate = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const secret_manager_1 = require("@google-cloud/secret-manager");
const genai_1 = require("@google/genai");
const secretClient = new secret_manager_1.SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'GEMINI_API_KEY';
// Cache for Gemini API key
let geminiApiKey = null;
/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey() {
    if (geminiApiKey) {
        return geminiApiKey;
    }
    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
        });
        const payload = version.payload?.data?.toString();
        if (payload) {
            geminiApiKey = payload;
            console.log('✅ Gemini API key loaded from Secret Manager');
            return payload;
        }
    }
    catch (error) {
        console.error('Failed to load Gemini API key from Secret Manager:', error);
    }
    return '';
}
/**
 * 翻译英文文本到中文
 */
async function translateToChineseServerSide(text) {
    // 检测是否英文
    const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    if (englishRatio < 0.5) {
        return text; // 已经是中文
    }
    try {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            return text;
        }
        const ai = new genai_1.GoogleGenAI({ apiKey });
        const prompt = `Translate this English news headline into concise, natural Chinese. Output ONLY the Chinese translation, no explanations:\n\n${text}`;
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.3,
                maxOutputTokens: 100
            }
        });
        const translation = result.text?.trim() || text;
        return translation;
    }
    catch (error) {
        console.error('Translation failed:', error);
        return text;
    }
}
/**
 * 生成新闻播报稿
 */
async function generateBroadcast(data) {
    let broadcast = '';
    try {
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
        }
        catch (e) {
            // 如果解析失败，使用原始时间
        }
        broadcast += `【今日摘要】\n`;
        broadcast += `这是最新的中国专区动态，截止到${friendlyTime}，以下是重点关注：\n\n`;
        // 2. 提取热点新闻标题
        const allNewsItems = [];
        if (data.hotlist_news && data.hotlist_news.keyword_groups) {
            for (const group of data.hotlist_news.keyword_groups) {
                if (group.news_items) {
                    allNewsItems.push(...group.news_items);
                }
            }
        }
        // 按排名排序
        allNewsItems.sort((a, b) => (a.rank || 999) - (b.rank || 999));
        // 清理标题
        const cleanHeadlines = allNewsItems.map(item => {
            let title = item.title || '';
            title = title
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/\s+/g, ' ')
                .replace(/^[#\d\s]+/, '')
                .trim();
            return title;
        }).filter(t => t.length > 0);
        // 去重（使用 Set）
        const uniqueHeadlines = Array.from(new Set(cleanHeadlines));
        if (uniqueHeadlines.length > 0) {
            broadcast += `【热点新闻】\n`;
            const topNews = uniqueHeadlines.slice(0, 20);
            topNews.forEach(headline => {
                broadcast += `• ${headline}\n`;
            });
            if (uniqueHeadlines.length > 20) {
                broadcast += `... 及其他 ${uniqueHeadlines.length - 20} 条新闻\n`;
            }
            broadcast += `\n`;
        }
        // 3. AI 深度分析（直接使用原始内容）
        if (data.ai_analysis && data.ai_analysis.result) {
            try {
                // 如果 result 已经是对象，直接使用；如果是字符串，才 parse
                const aiResult = typeof data.ai_analysis.result === 'string'
                    ? JSON.parse(data.ai_analysis.result)
                    : data.ai_analysis.result;
                broadcast += `【AI 深度分析】\n`;
                // keyword_analysis
                if (aiResult.keyword_analysis) {
                    broadcast += `▸ 关键词分析：${typeof aiResult.keyword_analysis === 'string' ? aiResult.keyword_analysis : JSON.stringify(aiResult.keyword_analysis)}\n`;
                }
                // sentiment
                if (aiResult.sentiment) {
                    broadcast += `▸ 情绪分析：${typeof aiResult.sentiment === 'string' ? aiResult.sentiment : JSON.stringify(aiResult.sentiment)}\n`;
                }
                // signals
                if (aiResult.signals) {
                    broadcast += `▸ 关键信号：${typeof aiResult.signals === 'string' ? aiResult.signals : JSON.stringify(aiResult.signals)}\n`;
                }
                // cross_platform
                if (aiResult.cross_platform) {
                    broadcast += `▸ 跨平台分析：${typeof aiResult.cross_platform === 'string' ? aiResult.cross_platform : JSON.stringify(aiResult.cross_platform)}\n`;
                }
                // impact
                if (aiResult.impact) {
                    broadcast += `▸ 影响分析：${typeof aiResult.impact === 'string' ? aiResult.impact : JSON.stringify(aiResult.impact)}\n`;
                }
                // conclusion 和 summary 合并
                const conclusionText = aiResult.conclusion || aiResult.summary;
                if (conclusionText) {
                    broadcast += `▸ 总结：${conclusionText}\n`;
                }
                broadcast += `\n`;
            }
            catch (error) {
                console.error('Failed to parse AI analysis:', error);
            }
        }
        // 4. 国际科技动态（翻译 RSS）
        const rssItems = [];
        if (data.rss_feeds && data.rss_feeds.matched_items) {
            for (const feed of data.rss_feeds.matched_items) {
                if (feed.items) {
                    for (const item of feed.items) {
                        if (item.title && item.title.trim().length > 0) {
                            rssItems.push(item.title);
                        }
                    }
                }
            }
        }
        if (rssItems.length > 0) {
            broadcast += `【其他RSS动态】\n`;
            // 翻译 RSS 标题（批量翻译以提高效率）
            const translatedItems = await Promise.all(rssItems.map(title => translateToChineseServerSide(title)));
            translatedItems.forEach(title => {
                if (title && title.trim().length > 0) {
                    broadcast += `• ${title}\n`;
                }
            });
            broadcast += `\n`;
        }
        // 5. 今日总结（放在最后）
        broadcast += `【今日总结】\n`;
        broadcast += `今日监测${platforms}个平台，共${hotlistTotal}条热榜新闻`;
        if (rssMatched > 0) {
            broadcast += `，${rssMatched}条国际科技订阅`;
        }
        broadcast += `。希望您喜欢。\n`;
        return broadcast;
    }
    catch (error) {
        console.error('Failed to generate broadcast:', error);
        return '无法生成新闻播报，请稍后重试。';
    }
}
/**
 * 监听 news_stanseradar_china collection 的新文档创建
 * 生成播报稿并存储到 news_stanseradar_china_consolidated
 */
exports.onChinaNewsCreate = functions.firestore.onDocumentCreated({
    document: 'news_stanseradar_china/{docId}',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB'
}, async (event) => {
    const docId = event.params.docId;
    const data = event.data?.data();
    if (!data) {
        console.log('❌ No data in document:', docId);
        return;
    }
    console.log('🔔 New China news document created:', docId);
    try {
        const db = admin.firestore();
        // 生成播报稿
        console.log('📝 Generating broadcast...');
        const broadcastText = await generateBroadcast(data);
        // 存储到 news_stanseradar_china_consolidated
        const consolidatedDoc = {
            // Metadata
            metadata: {
                source_doc_id: docId,
                source_collection: 'news_stanseradar_china',
                version: data.metadata?.version || '5.0.0',
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                source_project: data.metadata?.source_project || 'gen-lang-client-0960644135',
                timezone: data.metadata?.timezone || 'Asia/Shanghai'
            },
            // Time information from source
            time: {
                beijing_time: data.time?.beijing_time || '',
                crawl_date: data.time?.crawl_date || '',
                crawl_time: data.time?.crawl_time || '',
                generated_at: data.time?.generated_at || admin.firestore.FieldValue.serverTimestamp()
            },
            // Statistics from source
            statistics: data.statistics || {},
            // Generated broadcast text
            broadcast: broadcastText,
            // Character count
            broadcast_length: broadcastText.length,
            // Language
            language: 'zh',
            // Processing info
            processing: {
                translated_rss: data.statistics?.rss?.matched || 0,
                extracted_news: data.statistics?.hotlist?.total || 0,
                has_ai_analysis: !!(data.ai_analysis && data.ai_analysis.result)
            }
        };
        await db
            .collection('news_stanseradar_china_consolidated')
            .doc(docId) // 使用相同的 docId
            .set(consolidatedDoc);
        console.log('✅ Broadcast saved to news_stanseradar_china_consolidated');
        console.log(`📊 Broadcast length: ${broadcastText.length} characters`);
        // 记录统计信息
        if (data.statistics) {
            console.log('📊 Source statistics:', {
                platforms: data.statistics.platforms,
                hotlist_total: data.statistics.hotlist?.total,
                rss_matched: data.statistics.rss?.matched
            });
        }
    }
    catch (error) {
        console.error('❌ Failed to process China news:', error);
    }
});
//# sourceMappingURL=china-news-listener.js.map