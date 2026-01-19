"use strict";
/**
 * Breaking News Checker
 *
 * Independent system that ONLY searches for and stores breaking news.
 * Runs separately from the main news collection system.
 *
 * Flow:
 * 1. Search Google specifically for breaking/urgent news
 * 2. Store ORIGINAL content in news_original collection
 * 3. Store SUMMARY in main news collection (shared)
 * 4. Send notifications to users
 *
 * Only saves news that has breaking keywords!
 *
 * Schedule: Every 30 minutes (more frequent than main news)
 */
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
exports.checkBreakingNews = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const secret_manager_1 = require("@google-cloud/secret-manager");
const secretClient = new secret_manager_1.SecretManagerServiceClient();
const SECRET_PROJECT_ID = 'gen-lang-client-0960644135';
const db = admin.firestore();
// Cache for API keys (loaded once per function instance)
let geminiApiKey = null;
let sendgridApiKey = null;
/**
 * Get Gemini API key from Secret Manager
 */
async function getGeminiApiKey() {
    if (geminiApiKey)
        return geminiApiKey;
    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${SECRET_PROJECT_ID}/secrets/gemini-api-key/versions/latest`,
        });
        geminiApiKey = version.payload?.data?.toString() || '';
        return geminiApiKey;
    }
    catch (error) {
        console.error('Failed to get Gemini API key:', error);
        return '';
    }
}
/**
 * Get SendGrid API key from Secret Manager
 */
async function getSendGridApiKey() {
    if (sendgridApiKey)
        return sendgridApiKey;
    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${SECRET_PROJECT_ID}/secrets/SENDGRID_API_KEY/versions/latest`,
        });
        sendgridApiKey = version.payload?.data?.toString() || '';
        return sendgridApiKey;
    }
    catch (error) {
        console.error('Failed to get SendGrid API key:', error);
        return '';
    }
}
/**
 * Translate text using Gemini
 */
async function translateText(text, targetLanguage) {
    const languageNames = {
        'zh': 'Simplified Chinese',
        'ja': 'Japanese',
        'fr': 'French',
        'es': 'Spanish'
    };
    try {
        const { GoogleGenAI } = require('@google/genai');
        const apiKey = await getGeminiApiKey();
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Translate the following English text to ${languageNames[targetLanguage]}. Maintain the same tone and meaning. Only return the translation:\n\n${text}`
        });
        return response.text?.trim() || text;
    }
    catch (error) {
        console.error(`Translation to ${targetLanguage} failed:`, error);
        return text; // Return original if translation fails
    }
}
/**
 * Generate multi-language versions of breaking news
 */
async function generateMultiLanguageVersions(newsItems) {
    console.log(`🌐 Generating multi-language versions for ${newsItems.length} breaking news items...`);
    const multiLangResults = [];
    for (const item of newsItems) {
        try {
            // Translate title and summary to all 4 languages in parallel
            const [titleZH, titleJA, titleFR, titleES, summaryZH, summaryJA, summaryFR, summaryES] = await Promise.all([
                translateText(item.title, 'zh'),
                translateText(item.title, 'ja'),
                translateText(item.title, 'fr'),
                translateText(item.title, 'es'),
                translateText(item.summary, 'zh'),
                translateText(item.summary, 'ja'),
                translateText(item.summary, 'fr'),
                translateText(item.summary, 'es')
            ]);
            multiLangResults.push({
                ...item,
                titleZH,
                titleJA,
                titleFR,
                titleES,
                summaryZH,
                summaryJA,
                summaryFR,
                summaryES
            });
            console.log(`✅ Generated multi-language versions for: "${item.title.slice(0, 50)}..."`);
        }
        catch (error) {
            console.error(`Failed to generate multi-language versions for: ${item.title}`, error);
            // Still include the English version
            multiLangResults.push(item);
        }
    }
    return multiLangResults;
}
/**
 * Search specifically for breaking news using Gemini with Google Search (English only)
 */
async function searchBreakingNews() {
    try {
        const { GoogleGenAI } = require('@google/genai');
        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            console.error('GEMINI_API_KEY not configured');
            return [];
        }
        const ai = new GoogleGenAI({ apiKey });
        // Search ONLY for breaking/urgent news
        const prompt = `
      Search for BREAKING NEWS and URGENT headlines happening RIGHT NOW (within the last hour).

      Focus on news with these indicators:
      - Explicitly labeled as "BREAKING" or "URGENT"
      - Major political events (president, congress, supreme court)
      - Military conflicts, attacks, or security incidents
      - Major market movements or economic crises
      - Natural disasters or emergencies
      - Significant corporate events (CEO resignations, major lawsuits)

      For each breaking news story, provide:

      ---BREAKING_NEWS---
      TITLE: [exact headline from source]
      ORIGINAL: [Full article snippet from Google Search - include everything available]
      SOURCE: [news outlet name]
      URL: [full article URL from the source]
      CATEGORY: [one of: POLITICS, TECH, MILITARY, WORLD, BUSINESS]
      ---END---

      CRITICAL: The ORIGINAL field must contain substantial article content (300-500 words), not a brief summary.
      Only include news that is genuinely breaking/urgent. If there are no breaking news stories, return empty.
      Find 3-5 breaking news items maximum.
    `;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        const rawText = response.text || '';
        console.log('🔍 Search response length:', rawText.length);
        // Parse results
        const results = [];
        const blocks = rawText.split('---BREAKING_NEWS---').filter((b) => b.includes('---END---'));
        for (const block of blocks) {
            const titleMatch = block.match(/TITLE:\s*(.+?)(?=\n|ORIGINAL:)/s);
            const originalMatch = block.match(/ORIGINAL:\s*(.+?)(?=\n|SOURCE:)/s);
            const sourceMatch = block.match(/SOURCE:\s*(.+?)(?=\n|URL:)/s);
            const urlMatch = block.match(/URL:\s*(.+?)(?=\n|CATEGORY:)/s);
            const categoryMatch = block.match(/CATEGORY:\s*(.+?)(?=\n|---END---)/s);
            if (titleMatch && originalMatch && sourceMatch && categoryMatch) {
                const title = titleMatch[1].trim();
                let originalContent = originalMatch[1].trim();
                const source = sourceMatch[1].trim();
                const url = urlMatch ? urlMatch[1].trim() : '';
                const category = categoryMatch[1].trim().toUpperCase();
                // If we have a URL, try to fetch full article content
                if (url && url.startsWith('http')) {
                    try {
                        console.log(`🌐 Fetching full article from: ${url}`);
                        const fetch = require('node-fetch');
                        const articleResponse = await fetch(url, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (compatible; StanseBot/1.0; +https://stanse.ai)'
                            },
                            timeout: 10000
                        });
                        if (articleResponse.ok) {
                            const html = await articleResponse.text();
                            // Extract text content using Gemini
                            const extractResponse = await ai.models.generateContent({
                                model: 'gemini-3-flash-preview',
                                contents: `Extract the main article text from this HTML. Return ONLY the article content (first 5-6 paragraphs), no ads, no navigation, no headers:\n\n${html.slice(0, 50000)}`
                            });
                            const fullContent = extractResponse.text?.trim();
                            if (fullContent && fullContent.length > originalContent.length) {
                                originalContent = fullContent;
                                console.log(`✅ Fetched ${fullContent.length} chars of full article`);
                            }
                        }
                    }
                    catch (fetchError) {
                        console.log(`⚠️  Could not fetch full article, using search snippet`);
                    }
                }
                // Double-check this is actually breaking news
                // Use STRICT criteria - must have explicit breaking indicator OR major event keyword
                const titleLower = title.toLowerCase();
                const contentLower = originalContent.toLowerCase();
                // TIER 1: Explicit breaking indicators (highest priority)
                // TIER 1: Explicit breaking labels (must appear in TITLE, very strict)
                const explicitBreaking = [
                    'breaking:', 'breaking news:', 'urgent:', 'just in:'
                ];
                // TIER 2: Critical events that are always breaking news (very narrow scope)
                const criticalEvents = [
                    'war declared', 'declares war',
                    'military strike', 'missile strike', 'attack on',
                    'president dies', 'president dead', 'assassination',
                    'market crash', 'stock market crash', 'trading halted',
                    'major earthquake', 'magnitude 7', 'magnitude 8',
                    'nuclear', 'reactor', 'meltdown',
                    'terror attack', 'terrorist attack',
                    'mass shooting', 'active shooter'
                ];
                const titleText = titleLower;
                const fullText = titleLower + ' ' + contentLower;
                // Stricter logic: Require explicit breaking label in TITLE, OR critical event
                const hasExplicitInTitle = explicitBreaking.some(k => titleText.includes(k));
                const hasCriticalEvent = criticalEvents.some(k => fullText.includes(k));
                // Must meet BOTH conditions OR have critical event
                if (!hasCriticalEvent && !hasExplicitInTitle) {
                    console.log(`⏭️  Skipping: "${title}" - not breaking (titleBreaking=${hasExplicitInTitle}, critical=${hasCriticalEvent})`);
                    continue;
                }
                // Generate summary using Gemini
                const summaryResponse = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: `Summarize this breaking news in 1-2 sentences (max 200 chars):\n\n${originalContent}`
                });
                const summary = summaryResponse.text?.trim() || originalContent.slice(0, 200);
                results.push({
                    title,
                    originalContent,
                    summary,
                    sources: [source],
                    category,
                    url: url || undefined
                });
                console.log(`⚡ Found breaking: "${title}" [${category}]`);
            }
        }
        return results;
    }
    catch (error) {
        console.error('Error searching breaking news:', error);
        return [];
    }
}
/**
 * Store breaking news in Firestore with multi-language support
 * - news_original: Uses "news-{hash}" format (for breaking news service)
 * - news: Uses simple base36 hash (same as regular news)
 * - Both use titleHash field for cross-language linking
 */
async function storeBreakingNews(newsItems) {
    let storedCount = 0;
    for (const item of newsItems) {
        try {
            // Generate base hash from English title (MD5, shared across languages)
            const titleHash = require('crypto')
                .createHash('md5')
                .update(item.title)
                .digest('hex')
                .slice(0, 6);
            // Language configurations
            const languages = [
                { code: 'en', title: item.title, summary: item.summary },
                { code: 'zh', title: item.titleZH || item.title, summary: item.summaryZH || item.summary },
                { code: 'ja', title: item.titleJA || item.title, summary: item.summaryJA || item.summary },
                { code: 'fr', title: item.titleFR || item.title, summary: item.summaryFR || item.summary },
                { code: 'es', title: item.titleES || item.title, summary: item.summaryES || item.summary }
            ];
            // Store for each language with unique document ID
            for (const lang of languages) {
                // For news_original: Use "news-{hash}" format (existing breaking news format)
                const newsOriginalHash = require('crypto')
                    .createHash('md5')
                    .update(`${lang.title}-${lang.code}`)
                    .digest('hex')
                    .slice(0, 6);
                const newsOriginalId = `news-${newsOriginalHash}`;
                // For news collection: Use simple base36 hash (same as regular news)
                const languageSpecificText = `${lang.title}-${lang.code}`;
                let simpleHash = 0;
                for (let i = 0; i < languageSpecificText.length; i++) {
                    const char = languageSpecificText.charCodeAt(i);
                    simpleHash = ((simpleHash << 5) - simpleHash) + char;
                    simpleHash = simpleHash & simpleHash;
                }
                const newsId = Math.abs(simpleHash).toString(36);
                // Check if already exists in news collection
                const existingDoc = await db.collection('news').doc(newsId).get();
                if (existingDoc.exists) {
                    console.log(`⏭️  Already exists (${lang.code}): ${lang.title.slice(0, 50)}...`);
                    continue;
                }
                // Store SUMMARY in news collection (simple hash format)
                await db.collection('news').doc(newsId).set({
                    id: newsId,
                    title: lang.title,
                    summary: lang.summary,
                    sources: item.sources,
                    category: item.category,
                    date: 'TODAY',
                    originalLanguage: lang.code,
                    isBreaking: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    titleHash: titleHash // Shared titleHash for cross-language linking
                });
                // Store ORIGINAL content in news_original collection ("news-{hash}" format)
                const originalData = {
                    id: newsOriginalId,
                    title: lang.title,
                    originalContent: lang.code === 'en' ? item.originalContent : item.summary, // Only EN has full content
                    sources: item.sources,
                    category: item.category,
                    date: 'TODAY',
                    originalLanguage: lang.code,
                    isBreaking: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    titleHash: titleHash // Same titleHash for linking
                };
                if (item.url) {
                    originalData.url = item.url;
                }
                await db.collection('news_original').doc(newsOriginalId).set(originalData);
                console.log(`✅ Stored breaking news (${lang.code}):`);
                console.log(`   news: ${newsId} | news_original: ${newsOriginalId}`);
                console.log(`   title: ${lang.title.slice(0, 50)}...`);
                storedCount++;
            }
        }
        catch (error) {
            console.error(`Failed to store: ${item.title}`, error);
        }
    }
    return storedCount;
}
/**
 * Send notifications to admin and users (English version only for notifications)
 */
async function sendNotifications(newsItems) {
    try {
        const ADMIN_EMAIL = 'lxu912@gmail.com';
        const apiKey = await getSendGridApiKey();
        if (!apiKey) {
            console.error('SendGrid API key not available');
            return 0;
        }
        // Build email content (following email_notifier.py pattern)
        const articlesHtml = newsItems.slice(0, 3).map(item => `
      <div style="margin: 20px 0; padding: 15px; border: 2px solid #dc2626; background: #fef2f2;">
        <div style="display: inline-block; padding: 4px 8px; background: #dc2626; color: white; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
          ⚡ ${item.category}
        </div>
        <h3 style="margin: 0 0 10px 0; color: #000; font-size: 18px;">
          ${item.title}
        </h3>
        <p style="color: #333; font-size: 14px; line-height: 1.5; margin: 8px 0;">
          ${item.summary}
        </p>
        <div style="font-size: 12px; color: #666; margin-top: 8px;">
          📰 ${item.sources.join(', ')}
        </div>
      </div>
    `).join('');
        const htmlBody = `
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
          h2 { color: #dc2626; border-bottom: 3px solid #000; padding-bottom: 10px; }
        </style>
      </head>
      <body>
        <h2>⚡ Breaking News Alert</h2>
        <p style="color: #666; font-size: 14px;">
          ${newsItems.length} breaking news ${newsItems.length > 1 ? 'stories' : 'story'} detected in the last 30 minutes:
        </p>
        ${articlesHtml}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
        <p style="color: #999; font-size: 12px;">
          Timestamp: ${new Date().toISOString()}<br>
          This is an automated notification from Stanse Breaking News System.
        </p>
      </body>
      </html>
    `;
        // SendGrid API payload (following email_notifier.py pattern)
        const payload = {
            personalizations: [
                {
                    to: [{ email: ADMIN_EMAIL }],
                    subject: `⚡ BREAKING NEWS: ${newsItems[0].title.slice(0, 60)}...`
                }
            ],
            from: { email: ADMIN_EMAIL, name: 'Stanse Breaking News' },
            content: [
                { type: 'text/html', value: htmlBody }
            ]
        };
        // Send via SendGrid API
        const fetch = require('node-fetch');
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (response.status === 202) {
            console.log(`✅ Email sent to ${ADMIN_EMAIL}`);
        }
        else {
            console.error(`❌ Failed to send email: ${response.status}`);
        }
        // Store EACH breaking news as separate browser notification
        // This way users see multiple popups, one for each breaking news
        for (const item of newsItems) {
            await db.collection('breaking_news_notifications').add({
                title: item.title,
                body: item.summary,
                category: item.category,
                sources: item.sources.join(', '),
                timestamp: new Date().toISOString(),
                read: false
            });
            console.log(`📱 Created browser notification for: ${item.title}`);
        }
        return 1;
    }
    catch (error) {
        console.error('Error sending notifications:', error);
        return 0;
    }
}
/**
 * Main function - runs every 30 minutes
 * Only during peak hours (EST):
 * - 3pm-6pm EST (20:00-23:00 UTC)
 * - 8:30pm-11:30pm EST (01:30-04:30 UTC next day)
 */
exports.checkBreakingNews = functions.scheduler.onSchedule({
    // Run at :00 and :30 during EST peak hours
    // Using America/New_York timezone for automatic DST handling
    schedule: '0,30 15-17,20-23 * * *', // Every 30min during 3-6pm and 8-11:30pm EST
    timeZone: 'America/New_York',
    region: 'us-central1',
    memory: '512MiB'
}, async () => {
    console.log('🔔 [BREAKING NEWS CHECK] Starting...');
    console.log(`Time: ${new Date().toISOString()}`);
    try {
        // 1. Search for breaking news in English only (independent from main news system)
        const breakingNews = await searchBreakingNews();
        if (breakingNews.length === 0) {
            console.log('✅ No breaking news found');
            return;
        }
        console.log(`📰 Found ${breakingNews.length} breaking news items`);
        // 2. Generate multi-language versions (only if qualified as breaking)
        const multiLangBreakingNews = await generateMultiLanguageVersions(breakingNews);
        console.log(`🌐 Generated ${multiLangBreakingNews.length} multi-language breaking news sets`);
        // 3. Store in Firestore (all languages)
        const storedCount = await storeBreakingNews(multiLangBreakingNews);
        console.log(`💾 Stored ${storedCount} breaking news documents (across 5 languages)`);
        if (storedCount === 0) {
            console.log('✅ All breaking news already in database');
            return;
        }
        // 3. Send notifications
        const notifiedUsers = await sendNotifications(breakingNews);
        console.log(`📧 Notified ${notifiedUsers} users`);
        // 4. Log
        await db.collection('notification_logs').add({
            timestamp: new Date().toISOString(),
            type: 'BREAKING_NEWS',
            articlesFound: breakingNews.length,
            articlesStored: storedCount,
            usersNotified: notifiedUsers,
            topArticles: breakingNews.slice(0, 2).map(a => ({
                title: a.title,
                category: a.category
            }))
        });
        console.log('✅ Breaking news check completed');
    }
    catch (error) {
        console.error('❌ Error in breaking news check:', error);
    }
});
//# sourceMappingURL=breaking-news-checker.js.map