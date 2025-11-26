/**
 * News Agent
 * Responsible for fetching real news from multiple sources:
 * 1. Google Search Grounding (real-time news)
 * 2. Google News RSS
 * 3. 6park Chinese news scraper
 *
 * All news is translated to English and stored in Firestore
 */

import { GoogleGenAI } from "@google/genai";
import { RawNewsItem, ProcessedNewsItem, AgentResponse } from './types';
import { saveNewsToCache, createTitleHash, getNewsFromCache } from '../newsCache';
import { newsLogger } from './logger';

// Initialize Gemini
const getBaseUrl = () => {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return `${window.location.origin}/api/gemini`;
};

const baseUrl = getBaseUrl();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: baseUrl ? { baseUrl } : undefined
});

// Curated Unsplash images for news categories
const CATEGORY_IMAGES: Record<string, string[]> = {
  'POLITICS': [
    'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=800&h=450&fit=crop',
  ],
  'TECH': [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=450&fit=crop',
  ],
  'MILITARY': [
    'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1580752300992-559f8e6a7b36?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1562564055-71e051d33c19?w=800&h=450&fit=crop',
  ],
  'WORLD': [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&h=450&fit=crop',
  ],
  'BUSINESS': [
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=450&fit=crop',
  ],
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop';

/**
 * Get image URL for a news category
 */
const getImageForCategory = (category: string, seed: number): string => {
  const images = CATEGORY_IMAGES[category.toUpperCase()] || [DEFAULT_IMAGE];
  return images[Math.abs(seed) % images.length];
};

/**
 * Translate text to English using Gemini
 */
const translateToEnglish = async (text: string, sourceLanguage: string): Promise<string> => {
  if (sourceLanguage === 'en') return text;

  const opId = newsLogger.operationStart('translate', { sourceLanguage, textLength: text.length });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following ${sourceLanguage} text to English. Only return the translation, nothing else:\n\n${text}`,
    });
    const translated = response.text?.trim() || text;
    newsLogger.operationSuccess(opId, 'translate', { originalLength: text.length, translatedLength: translated.length });
    return translated;
  } catch (error: any) {
    newsLogger.operationFailed(opId, 'translate', error, { text: text.slice(0, 50) });
    return text;
  }
};

/**
 * Fetch news using Google Search Grounding
 * This gets real-time news from Google Search
 */
export const fetchNewsWithGrounding = async (
  categories: string[] = ['politics', 'technology', 'military', 'international', 'business']
): Promise<AgentResponse<RawNewsItem[]>> => {
  const opId = newsLogger.operationStart('fetchGrounding', { categories });
  const startTime = Date.now();

  try {
    newsLogger.debug('fetchGrounding', 'Building search prompt for categories', { categories });

    // IMPORTANT: Google Search Grounding does NOT support JSON response format
    // We must use plain text and parse manually
    const prompt = `
      Search for the latest news headlines from TODAY across these categories: ${categories.join(', ')}.

      For each category, find 2-3 REAL news stories that are currently trending.

      Format your response EXACTLY like this (use this exact format):

      ---NEWS_ITEM---
      TITLE: [actual headline, max 100 chars]
      SUMMARY: [brief description, max 200 chars]
      SOURCE: [news outlet name like Reuters, BBC, CNN, etc.]
      CATEGORY: [one of: POLITICS, TECH, MILITARY, WORLD, BUSINESS]
      ---END_ITEM---

      Repeat this format for each news item. Focus on factual, verified news from reputable sources.
      Find at least 10 news items total across all categories.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const rawText = response.text || '';
    newsLogger.debug('fetchGrounding', 'Raw response length: ' + rawText.length);

    // Parse the structured text response
    const newsItems: RawNewsItem[] = [];
    const itemBlocks = rawText.split('---NEWS_ITEM---').filter(block => block.includes('---END_ITEM---'));

    for (const block of itemBlocks) {
      const titleMatch = block.match(/TITLE:\s*(.+?)(?=\n|SUMMARY:)/s);
      const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=\n|SOURCE:)/s);
      const sourceMatch = block.match(/SOURCE:\s*(.+?)(?=\n|CATEGORY:)/s);
      const categoryMatch = block.match(/CATEGORY:\s*(.+?)(?=\n|---END_ITEM---)/s);

      if (titleMatch && summaryMatch && categoryMatch) {
        const category = categoryMatch[1].trim().toUpperCase();
        const validCategories = ['POLITICS', 'TECH', 'MILITARY', 'WORLD', 'BUSINESS'];

        newsItems.push({
          title: titleMatch[1].trim(),
          summary: summaryMatch[1].trim(),
          url: '',
          source: sourceMatch ? sourceMatch[1].trim() : 'Google News',
          publishedAt: new Date(),
          language: 'en' as const,
          category: validCategories.includes(category) ? category : 'WORLD'
        });
      }
    }

    // Extract grounding sources for reference
    const groundingSources: string[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          groundingSources.push(chunk.web.uri);
        }
      });
    }

    // Assign grounding URLs to news items where possible
    newsItems.forEach((item, index) => {
      if (groundingSources[index]) {
        item.url = groundingSources[index];
      }
    });

    newsLogger.operationSuccess(opId, 'fetchGrounding', {
      newsCount: newsItems.length,
      sources: groundingSources.length,
      categories: [...new Set(newsItems.map(n => n.category))]
    });

    newsLogger.summary('fetchGrounding', {
      totalNews: newsItems.length,
      groundingSources: groundingSources.length,
      processingTimeMs: Date.now() - startTime
    });

    return {
      success: true,
      data: newsItems,
      metadata: {
        source: 'google-search-grounding',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  } catch (error: any) {
    newsLogger.operationFailed(opId, 'fetchGrounding', error, { categories });
    return {
      success: false,
      error: error.message,
      metadata: {
        source: 'google-search-grounding',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Fetch news from Google News RSS
 */
export const fetchGoogleNewsRSS = async (
  topic: string = 'WORLD'
): Promise<AgentResponse<RawNewsItem[]>> => {
  const opId = newsLogger.operationStart('fetchRSS', { topic });
  const startTime = Date.now();

  try {
    // Google News RSS URLs by topic
    const rssUrls: Record<string, string> = {
      'WORLD': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB',
      'POLITICS': 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtVnVLQUFQAQ',
      'TECH': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB',
      'BUSINESS': 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB',
    };

    const _rssUrl = rssUrls[topic] || rssUrls['WORLD'];

    // Fetch RSS using a CORS proxy or server-side
    // For now, we'll use the grounding method as primary
    // This is a placeholder for when we add server-side RSS parsing
    newsLogger.warn('fetchRSS', 'RSS fetching not implemented yet, requires server-side', { topic });

    return {
      success: false,
      error: 'RSS fetching requires server-side implementation',
      metadata: {
        source: 'google-news-rss',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  } catch (error: any) {
    newsLogger.operationFailed(opId, 'fetchRSS', error, { topic });
    return {
      success: false,
      error: error.message,
      metadata: {
        source: 'google-news-rss',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Scrape news from 6park (Chinese news)
 * Uses Gemini to extract and translate content
 */
export const fetch6ParkNews = async (): Promise<AgentResponse<RawNewsItem[]>> => {
  const opId = newsLogger.operationStart('fetch6Park', { source: '6park.com' });
  const startTime = Date.now();

  try {
    newsLogger.debug('fetch6Park', 'Fetching Chinese news via Google Search grounding');

    // IMPORTANT: Google Search Grounding does NOT support JSON response format
    // We must use plain text and parse manually
    const prompt = `
      Search for the latest Chinese news headlines from 6park.com (留园网), Sina, Sohu, or similar Chinese news aggregators.

      Find 5-8 important news stories about:
      - China politics and government
      - US-China relations
      - Chinese economy and business
      - International news from Chinese perspective

      Format your response EXACTLY like this (use this exact format):

      ---NEWS_ITEM---
      TITLE_CN: [Original Chinese title]
      TITLE_EN: [English translation of the title]
      SUMMARY: [Brief summary in English, max 200 chars]
      CATEGORY: [one of: POLITICS, WORLD, BUSINESS]
      ---END_ITEM---

      Repeat this format for each news item. Focus on factual news from major Chinese news sources.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const rawText = response.text || '';
    newsLogger.debug('fetch6Park', 'Raw response length: ' + rawText.length);

    // Parse the structured text response
    const newsItems: RawNewsItem[] = [];
    const itemBlocks = rawText.split('---NEWS_ITEM---').filter(block => block.includes('---END_ITEM---'));

    for (const block of itemBlocks) {
      const titleEnMatch = block.match(/TITLE_EN:\s*(.+?)(?=\n|SUMMARY:)/s);
      const titleCnMatch = block.match(/TITLE_CN:\s*(.+?)(?=\n|TITLE_EN:)/s);
      const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=\n|CATEGORY:)/s);
      const categoryMatch = block.match(/CATEGORY:\s*(.+?)(?=\n|---END_ITEM---)/s);

      if ((titleEnMatch || titleCnMatch) && summaryMatch && categoryMatch) {
        const category = categoryMatch[1].trim().toUpperCase();
        const validCategories = ['POLITICS', 'WORLD', 'BUSINESS'];

        newsItems.push({
          title: titleEnMatch ? titleEnMatch[1].trim() : (titleCnMatch ? titleCnMatch[1].trim() : 'Untitled'),
          summary: summaryMatch[1].trim(),
          url: '',
          source: '6park/Chinese Media',
          publishedAt: new Date(),
          language: 'zh' as const,
          category: validCategories.includes(category) ? category : 'WORLD'
        });
      }
    }

    newsLogger.operationSuccess(opId, 'fetch6Park', {
      newsCount: newsItems.length,
      categories: [...new Set(newsItems.map(n => n.category))]
    });

    newsLogger.summary('fetch6Park', {
      totalNews: newsItems.length,
      processingTimeMs: Date.now() - startTime
    });

    return {
      success: true,
      data: newsItems,
      metadata: {
        source: '6park-news',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  } catch (error: any) {
    newsLogger.operationFailed(opId, 'fetch6Park', error);
    return {
      success: false,
      error: error.message,
      metadata: {
        source: '6park-news',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Process raw news items into standardized format
 * Translates non-English content and generates images
 */
export const processNewsItems = async (
  rawNews: RawNewsItem[]
): Promise<ProcessedNewsItem[]> => {
  const opId = newsLogger.operationStart('processNews', { count: rawNews.length });
  let cached = 0;
  let translated = 0;

  // OPTIMIZATION: Process all news items in parallel using Promise.all
  const processedNews = await Promise.all(
    rawNews.map(async (item) => {
      const titleHash = createTitleHash(item.title);

      // Check if already in cache
      const cachedItem = await getNewsFromCache(titleHash);
      if (cachedItem) {
        newsLogger.debug('processNews', `Cache hit for: ${item.title.slice(0, 40)}...`);
        cached++;
        return {
          ...cachedItem,
          titleHash,
          originalLanguage: item.language,
          sources: [item.source],
        } as ProcessedNewsItem;
      }

      // OPTIMIZATION: Translate title and summary in parallel
      const [englishTitle, englishSummary] = await Promise.all([
        item.language === 'en' ? Promise.resolve(item.title) : translateToEnglish(item.title, item.language),
        item.language === 'en' ? Promise.resolve(item.summary) : translateToEnglish(item.summary, item.language)
      ]);

      if (item.language !== 'en') {
        translated++;
        newsLogger.debug('processNews', `Translated from ${item.language}: ${englishTitle.slice(0, 40)}...`);
      }

      // Generate seed for image selection
      const seed = englishTitle.split('').reduce((acc, char) => {
        return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
      }, 0);

      const processedItem: ProcessedNewsItem = {
        id: `news-${titleHash}`,
        titleHash,
        title: englishTitle,
        summary: englishSummary,
        date: getRelativeDate(item.publishedAt),
        imageUrl: getImageForCategory(item.category || 'WORLD', seed),
        category: item.category?.toUpperCase() || 'WORLD',
        originalLanguage: item.language,
        sources: [item.source],
      };

      // Save to cache
      await saveNewsToCache(processedItem);
      newsLogger.debug('processNews', `Saved to cache: ${englishTitle.slice(0, 40)}...`);
      return processedItem;
    })
  );

  newsLogger.operationSuccess(opId, 'processNews', { processed: processedNews.length });
  newsLogger.summary('processNews', {
    total: rawNews.length,
    cached,
    translated,
    newItems: rawNews.length - cached
  });

  return processedNews;
};

/**
 * Get relative date string
 */
const getRelativeDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays <= 3) return `${diffDays} DAYS AGO`;
  return 'THIS WEEK';
};

/**
 * Main function: Fetch news from all sources
 */
export const fetchAllNews = async (
  categories: string[] = ['politics', 'technology', 'military', 'international', 'business']
): Promise<AgentResponse<ProcessedNewsItem[]>> => {
  const opId = newsLogger.operationStart('fetchAllNews', { categories });
  const startTime = Date.now();
  const allRawNews: RawNewsItem[] = [];
  const errors: string[] = [];

  // Fetch from Google Search Grounding (primary source)
  newsLogger.info('fetchAllNews', 'Fetching from Google Search Grounding...');
  const groundingResult = await fetchNewsWithGrounding(categories);
  if (groundingResult.success && groundingResult.data) {
    newsLogger.info('fetchAllNews', `Grounding returned ${groundingResult.data.length} items`);
    allRawNews.push(...groundingResult.data);
  } else if (groundingResult.error) {
    newsLogger.warn('fetchAllNews', `Grounding failed: ${groundingResult.error}`);
    errors.push(`Grounding: ${groundingResult.error}`);
  }

  // Fetch Chinese news from 6park
  newsLogger.info('fetchAllNews', 'Fetching from 6park Chinese news...');
  const sixParkResult = await fetch6ParkNews();
  if (sixParkResult.success && sixParkResult.data) {
    newsLogger.info('fetchAllNews', `6park returned ${sixParkResult.data.length} items`);
    allRawNews.push(...sixParkResult.data);
  } else if (sixParkResult.error) {
    newsLogger.warn('fetchAllNews', `6park failed: ${sixParkResult.error}`);
    errors.push(`6park: ${sixParkResult.error}`);
  }

  // Process all news
  newsLogger.info('fetchAllNews', `Processing ${allRawNews.length} raw news items...`);
  const processedNews = await processNewsItems(allRawNews);

  // Deduplicate by title similarity (simple approach)
  const uniqueNews = deduplicateNews(processedNews);
  const duplicatesRemoved = processedNews.length - uniqueNews.length;

  if (duplicatesRemoved > 0) {
    newsLogger.info('fetchAllNews', `Removed ${duplicatesRemoved} duplicate items`);
  }

  newsLogger.operationSuccess(opId, 'fetchAllNews', {
    totalRaw: allRawNews.length,
    processed: processedNews.length,
    unique: uniqueNews.length,
    errors: errors.length
  });

  newsLogger.summary('fetchAllNews', {
    groundingNews: groundingResult.data?.length || 0,
    sixParkNews: sixParkResult.data?.length || 0,
    totalProcessed: processedNews.length,
    duplicatesRemoved,
    finalCount: uniqueNews.length,
    processingTimeMs: Date.now() - startTime
  });

  return {
    success: uniqueNews.length > 0,
    data: uniqueNews,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    metadata: {
      source: 'news-agent',
      timestamp: new Date(),
      processingTime: Date.now() - startTime
    }
  };
};

/**
 * Simple deduplication by checking title similarity
 */
const deduplicateNews = (news: ProcessedNewsItem[]): ProcessedNewsItem[] => {
  const seen = new Set<string>();
  return news.filter(item => {
    // Create a simplified key from title
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
