"use strict";
/**
 * Google News RSS Fetcher
 *
 * Firebase Cloud Function to fetch and parse Google News RSS feeds
 * Supports multiple languages and categories
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGoogleNewsRSS = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const node_fetch_1 = __importDefault(require("node-fetch"));
// Google News RSS URLs by language and category
const RSS_URLS = {
    // English (US)
    'en': {
        'WORLD': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB',
        'POLITICS': 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtVnVLQUFQAQ',
        'TECH': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB',
        'BUSINESS': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB',
        'MILITARY': 'https://news.google.com/rss/search?q=military+defense&hl=en-US&gl=US&ceid=US:en',
    },
    // Chinese (Simplified)
    'zh': {
        'WORLD': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtcG9HZ0pEVGlnQVAB?hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
        'POLITICS': 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtcG9LQUFQAQ?hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
        'TECH': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtcG9HZ0pEVGlnQVAB?hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
        'BUSINESS': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtcG9HZ0pEVGlnQVAB?hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
        'MILITARY': 'https://news.google.com/rss/search?q=军事+国防&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    },
    // Japanese
    'ja': {
        'WORLD': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtcGhHZ0pLVUNnQVAB?hl=ja&gl=JP&ceid=JP:ja',
        'POLITICS': 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtcGhLQUFQAQ?hl=ja&gl=JP&ceid=JP:ja',
        'TECH': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtcGhHZ0pLVUNnQVAB?hl=ja&gl=JP&ceid=JP:ja',
        'BUSINESS': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtcGhHZ0pLVUNnQVAB?hl=ja&gl=JP&ceid=JP:ja',
        'MILITARY': 'https://news.google.com/rss/search?q=軍事+防衛&hl=ja&gl=JP&ceid=JP:ja',
    },
    // French
    'fr': {
        'WORLD': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtWnlHZ0pHVWlnQVAB?hl=fr&gl=FR&ceid=FR:fr',
        'POLITICS': 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtWnlLQUFQAQ?hl=fr&gl=FR&ceid=FR:fr',
        'TECH': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtWnlHZ0pHVWlnQVAB?hl=fr&gl=FR&ceid=FR:fr',
        'BUSINESS': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtWnlHZ0pHVWlnQVAB?hl=fr&gl=FR&ceid=FR:fr',
        'MILITARY': 'https://news.google.com/rss/search?q=militaire+défense&hl=fr&gl=FR&ceid=FR:fr',
    },
    // Spanish
    'es': {
        'WORLD': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnpHZ0pGVXlnQVAB?hl=es&gl=ES&ceid=ES:es',
        'POLITICS': 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtVnpLQUFQAQ?hl=es&gl=ES&ceid=ES:es',
        'TECH': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnpHZ0pGVXlnQVAB?hl=es&gl=ES&ceid=ES:es',
        'BUSINESS': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnpHZ0pGVXlnQVAB?hl=es&gl=ES&ceid=ES:es',
        'MILITARY': 'https://news.google.com/rss/search?q=militar+defensa&hl=es&gl=ES&ceid=ES:es',
    }
};
/**
 * Clean HTML tags and entities from text
 */
function cleanHtmlText(html) {
    if (!html)
        return '';
    // First, decode HTML entities (in case tags are encoded as &lt;ol&gt;)
    let text = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    // Then remove all HTML tags (now they're actual < > characters)
    text = text.replace(/<[^>]*>/g, '');
    // Remove extra whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}
/**
 * Parse XML RSS feed to extract news items
 */
function parseRSSFeed(xmlText) {
    const items = [];
    try {
        // Match all <item>...</item> blocks
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const itemMatches = xmlText.matchAll(itemRegex);
        for (const match of itemMatches) {
            const itemContent = match[1];
            // Extract fields
            const titleMatch = itemContent.match(/<title>(<!\[CDATA\[)?(.*?)(\]\]>)?<\/title>/s);
            const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
            const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
            const descriptionMatch = itemContent.match(/<description>(<!\[CDATA\[)?(.*?)(\]\]>)?<\/description>/s);
            const sourceMatch = itemContent.match(/<source[^>]*>(.*?)<\/source>/);
            if (titleMatch && linkMatch) {
                // Clean description HTML
                const rawDescription = descriptionMatch?.[2]?.trim() || '';
                const cleanDescription = cleanHtmlText(rawDescription);
                items.push({
                    title: titleMatch[2]?.trim() || '',
                    link: linkMatch[1]?.trim() || '',
                    pubDate: pubDateMatch?.[1]?.trim() || new Date().toISOString(),
                    description: cleanDescription,
                    source: sourceMatch?.[1]?.trim() || 'Google News'
                });
            }
        }
    }
    catch (error) {
        console.error('Error parsing RSS feed:', error);
    }
    return items;
}
/**
 * Fetch and parse RSS feed from URL with retry logic
 */
async function fetchRSSFeed(url, retries = 0) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (attempt > 0) {
                // Wait before retry (5s gentle retry)
                const delay = 5000;
                console.log(`Retry attempt ${attempt} after ${delay}ms delay...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            console.log(`Fetching RSS from: ${url}`);
            // Create abort controller for timeout (15s as recommended)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const response = await (0, node_fetch_1.default)(url, {
                headers: {
                    // Mimic legitimate RSS reader
                    'User-Agent': 'Stanse/2.0 RSS Reader (+https://stanse.ai)',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                // If 503, retry. Other errors, throw immediately
                if (response.status === 503 && attempt < retries) {
                    console.log(`HTTP 503 Service Unavailable on attempt ${attempt + 1}, will retry...`);
                    continue;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const xmlText = await response.text();
            console.log(`✅ Received ${xmlText.length} bytes of XML`);
            const items = parseRSSFeed(xmlText);
            console.log(`✅ Parsed ${items.length} items from RSS feed`);
            return items;
        }
        catch (error) {
            if (attempt === retries) {
                console.error(`❌ Failed to fetch RSS after ${retries + 1} attempts: ${error.message}`);
                throw error;
            }
            console.log(`⚠️ Attempt ${attempt + 1} failed: ${error.message}, retrying...`);
        }
    }
    return [];
}
/**
 * HTTP Callable Function to fetch Google News RSS
 *
 * Parameters:
 * - language: 'en' | 'zh' | 'ja' | 'fr' | 'es' (default: 'en')
 * - categories: string[] (default: ['WORLD', 'POLITICS', 'TECH', 'BUSINESS', 'MILITARY'])
 * - maxPerCategory: number (default: 5)
 *
 * Returns:
 * - success: boolean
 * - data: ParsedNewsItem[]
 * - error?: string
 */
exports.fetchGoogleNewsRSS = functions.https.onCall(async (request) => {
    const { data } = request;
    const language = data?.language || 'en';
    const categories = data?.categories || ['WORLD', 'POLITICS', 'TECH', 'BUSINESS', 'MILITARY'];
    const maxPerCategory = data?.maxPerCategory || 5;
    console.log(`📰 Fetching Google News RSS for language: ${language}, categories: ${categories.join(', ')}`);
    try {
        // Validate language
        if (!RSS_URLS[language]) {
            throw new Error(`Unsupported language: ${language}. Supported: ${Object.keys(RSS_URLS).join(', ')}`);
        }
        const allNews = [];
        const languageUrls = RSS_URLS[language];
        // Fetch news from each category (with delay to avoid rate limiting)
        for (let i = 0; i < categories.length; i++) {
            const category = categories[i];
            const rssUrl = languageUrls[category];
            if (!rssUrl) {
                console.warn(`No RSS URL for category: ${category} in language: ${language}`);
                continue;
            }
            // Add delay between categories to avoid rate limiting (except first request)
            if (i > 0) {
                // Use 1s base interval with ±20% random jitter (like StanseRadar)
                const baseInterval = 1000;
                const jitter = Math.random() * 0.4 - 0.2; // -20% to +20%
                const delay = Math.floor(baseInterval * (1 + jitter)); // 800-1200ms
                console.log(`Waiting ${delay}ms before next category (anti-bot jitter)...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            try {
                const rssItems = await fetchRSSFeed(rssUrl);
                // Convert RSS items to our format
                const parsedItems = rssItems.slice(0, maxPerCategory).map(item => {
                    // Description is already cleaned by cleanHtmlText() in parseRSSFeed
                    // Just limit the length and use title as fallback
                    const summary = item.description && item.description.length > 10
                        ? item.description.slice(0, 200)
                        : item.title;
                    return {
                        title: item.title,
                        summary: summary,
                        url: item.link,
                        source: item.source || 'Google News',
                        publishedAt: new Date(item.pubDate),
                        language: language,
                        category: category
                    };
                });
                allNews.push(...parsedItems);
                console.log(`✅ Fetched ${parsedItems.length} items for ${category}`);
            }
            catch (error) {
                console.error(`Failed to fetch ${category}:`, error.message);
                // Continue with other categories even if one fails
            }
        }
        console.log(`📊 Total news fetched: ${allNews.length} items`);
        return {
            success: true,
            data: allNews,
            metadata: {
                language,
                categories,
                totalItems: allNews.length,
                timestamp: new Date().toISOString()
            }
        };
    }
    catch (error) {
        console.error('Error fetching Google News RSS:', error);
        return {
            success: false,
            error: error.message,
            data: []
        };
    }
});
//# sourceMappingURL=news-rss-fetcher.js.map