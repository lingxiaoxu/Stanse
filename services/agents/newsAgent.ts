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
import { saveNewsToCache, createTitleHash, getNewsFromCache, saveImageToCache } from '../newsCache';
import { newsLogger } from './logger';
import { generateNewsImage } from '../geminiService';

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
// Use data URIs for reliable, fast-loading placeholder images (SVG patterns)
const CATEGORY_IMAGES: Record<string, string[]> = {
  'POLITICS': [
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23dc2626" width="800" height="450"/%3E%3Ccircle cx="400" cy="225" r="120" fill="%23991b1b" opacity="0.3"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23b91c1c" width="800" height="450"/%3E%3Crect x="200" y="100" width="400" height="250" fill="%23dc2626" opacity="0.5"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23991b1b" width="800" height="450"/%3E%3Cpath d="M0,225 L400,0 L800,225 L400,450 Z" fill="%23dc2626" opacity="0.4"/%3E%3C/svg%3E',
  ],
  'TECH': [
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%233b82f6" width="800" height="450"/%3E%3Ccircle cx="600" cy="150" r="100" fill="%231d4ed8" opacity="0.4"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%232563eb" width="800" height="450"/%3E%3Crect x="100" y="50" width="600" height="350" fill="%233b82f6" opacity="0.3"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%231d4ed8" width="800" height="450"/%3E%3Cpath d="M0,0 L800,0 L400,450 Z" fill="%233b82f6" opacity="0.5"/%3E%3C/svg%3E',
  ],
  'MILITARY': [
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23525252" width="800" height="450"/%3E%3Crect x="150" y="100" width="500" height="250" fill="%23404040" opacity="0.6"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23404040" width="800" height="450"/%3E%3Ccircle cx="300" cy="225" r="150" fill="%23525252" opacity="0.4"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23525252" width="800" height="450"/%3E%3Cpath d="M0,450 L400,0 L800,450 Z" fill="%23737373" opacity="0.3"/%3E%3C/svg%3E',
  ],
  'WORLD': [
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%2316a34a" width="800" height="450"/%3E%3Ccircle cx="400" cy="225" r="180" fill="%23166534" opacity="0.3"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23166534" width="800" height="450"/%3E%3Crect x="250" y="125" width="300" height="200" fill="%2316a34a" opacity="0.5"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%2315803d" width="800" height="450"/%3E%3Cpath d="M0,225 L800,0 L800,450 Z" fill="%2316a34a" opacity="0.4"/%3E%3C/svg%3E',
  ],
  'BUSINESS': [
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23f59e0b" width="800" height="450"/%3E%3Crect x="200" y="150" width="400" height="150" fill="%23d97706" opacity="0.4"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23d97706" width="800" height="450"/%3E%3Ccircle cx="500" cy="200" r="130" fill="%23f59e0b" opacity="0.5"/%3E%3C/svg%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%23ea580c" width="800" height="450"/%3E%3Cpath d="M0,0 L400,225 L800,0 Z" fill="%23f59e0b" opacity="0.3"/%3E%3C/svg%3E',
  ],
};

const DEFAULT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect fill="%236b7280" width="800" height="450"/%3E%3Ccircle cx="400" cy="225" r="100" fill="%23374151" opacity="0.5"/%3E%3C/svg%3E';

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
          category: validCategories.includes(category) ? category : 'WORLD',
          sourceType: 'grounding' as const  // Mark as Google Search Grounding
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
 * Fetch news from Google News RSS via Cloud Function
 */
export const fetchGoogleNewsRSS = async (
  categories: string[] = ['WORLD', 'POLITICS', 'TECH', 'BUSINESS', 'MILITARY'],
  language: string = 'en'
): Promise<AgentResponse<RawNewsItem[]>> => {
  const opId = newsLogger.operationStart('fetchRSS', { categories, language });
  const startTime = Date.now();

  try {
    newsLogger.debug('fetchRSS', `Calling Cloud Function for language: ${language}`);

    // Call Firebase Cloud Function
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../firebase');

    const fetchRSSFunction = httpsCallable(functions, 'fetchGoogleNewsRSS');

    const result = await fetchRSSFunction({
      language,
      categories,
      maxPerCategory: 5
    });

    const data = result.data as any;

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch RSS');
    }

    // Convert to RawNewsItem format
    const newsItems: RawNewsItem[] = data.data.map((item: any) => ({
      title: item.title,
      summary: item.summary,
      url: item.url,
      source: item.source,
      publishedAt: new Date(item.publishedAt),
      language: language as 'en' | 'zh' | 'ja' | 'fr' | 'es',
      category: item.category,
      sourceType: 'rss' as const  // Mark as RSS source
    }));

    newsLogger.operationSuccess(opId, 'fetchRSS', {
      newsCount: newsItems.length,
      categories: [...new Set(newsItems.map(n => n.category))]
    });

    newsLogger.summary('fetchRSS', {
      totalNews: newsItems.length,
      language,
      processingTimeMs: Date.now() - startTime
    } as any);

    return {
      success: true,
      data: newsItems,
      metadata: {
        source: 'google-news-rss',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  } catch (error: any) {
    newsLogger.operationFailed(opId, 'fetchRSS', error, { categories, language });
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
 * Scrape news from 666parks (Chinese news)
 * Uses Gemini to extract and translate content
 */
export const fetch6ParkNews = async (): Promise<AgentResponse<RawNewsItem[]>> => {
  const opId = newsLogger.operationStart('fetch6Park', { source: '666parks.com' });
  const startTime = Date.now();

  try {
    newsLogger.debug('fetch6Park', 'Fetching Chinese news via Google Search grounding');

    // IMPORTANT: Google Search Grounding does NOT support JSON response format
    // We must use plain text and parse manually
    // MULTI-LANGUAGE UPDATE: Keep Chinese content, do NOT translate to English
    const prompt = `
      Search for the latest Chinese news headlines from 666parks.com (新留园), Sina, Sohu, or similar Chinese news aggregators.

      Find 5-8 important news stories about:
      - China politics and government
      - US-China relations
      - Chinese economy and business
      - International news from Chinese perspective

      Format your response EXACTLY like this (use this exact format):

      ---NEWS_ITEM---
      TITLE: [Original Chinese title - keep in Chinese]
      SUMMARY: [Brief summary in Chinese, max 200 characters - keep in Chinese]
      CATEGORY: [one of: POLITICS, WORLD, BUSINESS]
      ---END_ITEM---

      IMPORTANT: Keep ALL content in original Chinese (Simplified Chinese). Do NOT translate to English.
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
    // MULTI-LANGUAGE UPDATE: Now parsing Chinese content only (no English translation)
    const newsItems: RawNewsItem[] = [];
    const itemBlocks = rawText.split('---NEWS_ITEM---').filter(block => block.includes('---END_ITEM---'));

    for (const block of itemBlocks) {
      const titleMatch = block.match(/TITLE:\s*(.+?)(?=\n|SUMMARY:)/s);
      const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=\n|CATEGORY:)/s);
      const categoryMatch = block.match(/CATEGORY:\s*(.+?)(?=\n|---END_ITEM---)/s);

      if (titleMatch && summaryMatch && categoryMatch) {
        const category = categoryMatch[1].trim().toUpperCase();
        const validCategories = ['POLITICS', 'WORLD', 'BUSINESS'];

        newsItems.push({
          title: titleMatch[1].trim(), // Chinese title
          summary: summaryMatch[1].trim(), // Chinese summary
          url: '',
          source: '6park/Chinese Media',
          publishedAt: new Date(),
          language: 'zh' as const,
          category: validCategories.includes(category) ? category : 'WORLD',
          sourceType: '6park' as const  // Mark as 6park source
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

        // Fix: Check if cached summary has HTML garbage
        // Check HTML for RSS news OR if sourceType unknown (legacy data)
        let cleanSummary = cachedItem.summary;
        const cachedSourceType = (cachedItem as any).sourceType || item.sourceType;
        const isRSSorUnknown = cachedSourceType === 'rss' || !cachedSourceType;
        const hasHTMLGarbage = cleanSummary && (
          cleanSummary.includes('&lt;') ||
          cleanSummary.includes('&gt;') ||
          cleanSummary.includes('<a href') ||
          cleanSummary.includes('href=')
        );

        if (isRSSorUnknown && hasHTMLGarbage) {
          newsLogger.debug('processNews', `RSS cached item has HTML garbage, regenerating summary for: ${item.title.slice(0, 40)}...`);
          try {
            const summaryResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `Generate a concise 1-2 sentence news summary (max 150 characters) for this headline: "${cachedItem.title}". Only return the summary, nothing else.`,
            });
            cleanSummary = summaryResponse.text?.trim() || cachedItem.title;
            newsLogger.debug('processNews', `Regenerated AI summary for RSS cached item: ${cleanSummary.slice(0, 50)}...`);
          } catch (error: any) {
            newsLogger.warn('processNews', `AI summary failed for cached item, using title: ${error.message}`);
            cleanSummary = cachedItem.title;
          }
        }

        // Fix: Ensure cached items have imageUrl (for legacy data without images)
        let imageUrl = cachedItem.imageUrl;
        if (!imageUrl) {
          const seed = cachedItem.title.split('').reduce((acc, char) => {
            return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
          }, 0);
          imageUrl = getImageForCategory(cachedItem.category || 'WORLD', seed);
          newsLogger.debug('processNews', `Added missing imageUrl for cached item: ${cachedItem.title.slice(0, 40)}...`);
        }

        return {
          ...cachedItem,
          summary: cleanSummary,  // Use cleaned summary
          titleHash,
          imageUrl,
          originalLanguage: item.language,
          sources: [item.source],
        } as ProcessedNewsItem;
      }

      // Clean HTML entities from summary (only for RSS news - Google News RSS has HTML garbage)
      // Grounding and 6park news are already clean
      let cleanedSummary = item.summary;
      const isRSSNews = item.sourceType === 'rss';
      const hasHTMLGarbage = item.summary && (
        item.summary.includes('&lt;') ||
        item.summary.includes('&gt;') ||
        item.summary.includes('<a href') ||
        item.summary.includes('href=')
      );

      if (isRSSNews && hasHTMLGarbage) {
        // RSS HTML garbage detected - first clean it
        newsLogger.debug('processNews', `RSS HTML garbage detected for: ${item.title.slice(0, 40)}...`);
        cleanedSummary = item.title; // Fallback to title first
      }

      // For RSS news: Fetch actual article content using grounding and generate proper summary
      // MULTI-LANGUAGE UPDATE: Generate summary in the same language as the news
      if (isRSSNews && item.url) {
        newsLogger.debug('processNews', `Fetching article via grounding for RSS: ${item.title.slice(0, 40)}...`);

        // Language-specific prompt instructions
        const languageInstructions: Record<string, string> = {
          'en': 'in English',
          'zh': 'in Simplified Chinese (简体中文)',
          'ja': 'in Japanese (日本語)',
          'fr': 'in French (Français)',
          'es': 'in Spanish (Español)'
        };
        const languageInstruction = languageInstructions[item.language] || 'in English';

        try {
          const groundingResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Read the news article at this URL and generate a concise 2-3 sentence summary (max 200 characters) ${languageInstruction} that explains what happened, who is involved, and why it matters.

URL: ${item.url}

Article title: ${item.title}

IMPORTANT: The summary must be ${languageInstruction}. Only return the summary, nothing else.`,
            config: {
              tools: [{ googleSearch: {} }],  // Enable grounding to fetch URL content
            }
          });

          const groundedSummary = groundingResponse.text?.trim();

          // Check if grounding actually worked (detect error messages)
          const isGroundingError = groundedSummary && (
            groundedSummary.includes('cannot access') ||
            groundedSummary.includes('I am sorry') ||
            groundedSummary.includes('I do not have') ||
            groundedSummary.includes('I cannot') ||
            groundedSummary.length < 20
          );

          if (groundedSummary && !isGroundingError) {
            cleanedSummary = groundedSummary;
            newsLogger.debug('processNews', `Grounded summary from URL: ${cleanedSummary.slice(0, 50)}...`);
          } else {
            // Strategy 2: URL failed, try searching for the topic instead
            if (isGroundingError) {
              newsLogger.warn('processNews', `URL grounding failed: ${groundedSummary?.slice(0, 50)}...`);
            }
            newsLogger.info('processNews', 'Trying search-based grounding...');

            try {
              const searchResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Search for current information about this news topic and generate a concise 2-3 sentence summary (max 200 characters) ${languageInstruction}.

Topic: ${item.title}

IMPORTANT: The summary must be ${languageInstruction}. Use search results to provide accurate context. Only return the summary.`,
                config: {
                  tools: [{ googleSearch: {} }],  // Search for topic instead of accessing URL
                }
              });

              const searchSummary = searchResponse.text?.trim();
              const isSearchError = searchSummary && (
                searchSummary.includes('cannot access') ||
                searchSummary.includes('I am sorry') ||
                searchSummary.includes('I cannot') ||
                searchSummary.length < 20
              );

              if (searchSummary && !isSearchError) {
                cleanedSummary = searchSummary;
                newsLogger.debug('processNews', `Search-based summary: ${cleanedSummary.slice(0, 50)}...`);
              } else {
                throw new Error('Search grounding also failed');
              }
            } catch (searchError: any) {
              // Strategy 3: Both grounding methods failed - generate from title alone
              newsLogger.warn('processNews', `Search grounding failed: ${searchError.message}`);
              newsLogger.info('processNews', 'Using title-only AI summary (no grounding)');
              const titleResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Generate a concise 2-3 sentence news summary (max 200 characters) ${languageInstruction} for this headline: "${item.title}". Provide informative context about what likely happened and why it matters. IMPORTANT: The summary must be ${languageInstruction}. Only return the summary.`,
              });
              cleanedSummary = titleResponse.text?.trim() || item.title;
            }
          }
        } catch (error: any) {
          newsLogger.warn('processNews', `Grounding failed, using title-based summary: ${error.message}`);
          // Fallback: Generate summary from title only
          try {
            const titleResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `Generate a concise 2-3 sentence news summary (max 200 characters) ${languageInstruction} for this headline: "${item.title}". IMPORTANT: The summary must be ${languageInstruction}. Only return the summary.`,
            });
            cleanedSummary = titleResponse.text?.trim() || item.title;
          } catch (fallbackError: any) {
            newsLogger.error('processNews', `All summary generation failed: ${fallbackError.message}`);
            cleanedSummary = item.title;
          }
        }
      }

      // MULTI-LANGUAGE UPDATE: Keep original language, do NOT translate
      // The title and summary remain in their original language
      const originalTitle = item.title;
      const originalSummary = cleanedSummary;

      newsLogger.debug('processNews', `Keeping original ${item.language} content: ${originalTitle.slice(0, 40)}...`);

      // Generate AI image using original title (images work across languages)
      let imageUrl: string;
      try {
        newsLogger.debug('processNews', `Generating AI image for: ${originalTitle.slice(0, 40)}...`);
        imageUrl = await generateNewsImage(originalTitle, item.category || 'WORLD');
        newsLogger.debug('processNews', `Successfully generated AI image for: ${originalTitle.slice(0, 40)}...`);

        // Cache the image URL to news_images collection (titleHash links different language versions)
        await saveImageToCache(titleHash, imageUrl);
        newsLogger.debug('processNews', `Cached image for: ${originalTitle.slice(0, 40)}...`);
      } catch (error: any) {
        // Fallback to SVG geometric pattern if Imagen fails
        newsLogger.warn('processNews', `Imagen failed for "${originalTitle.slice(0, 40)}...", using fallback: ${error.message}`);
        const seed = originalTitle.split('').reduce((acc, char) => {
          return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
        }, 0);
        imageUrl = getImageForCategory(item.category || 'WORLD', seed);
      }

      // MULTI-LANGUAGE UPDATE: Each language version gets its own unique hash
      // Use same hash format as existing system (base36, no "news-" prefix)
      // Format: "2s7yjs", "1111cu" (matches newsCache.ts hashTitle function)
      const languageSpecificText = `${originalTitle}-${item.language}`;
      let languageSpecificHash = 0;
      for (let i = 0; i < languageSpecificText.length; i++) {
        const char = languageSpecificText.charCodeAt(i);
        languageSpecificHash = ((languageSpecificHash << 5) - languageSpecificHash) + char;
        languageSpecificHash = languageSpecificHash & languageSpecificHash;
      }
      const newsId = Math.abs(languageSpecificHash).toString(36);

      const processedItem: ProcessedNewsItem = {
        id: newsId,
        titleHash, // titleHash links all language versions (shared across collections)
        title: originalTitle,
        summary: originalSummary,
        date: getRelativeDate(item.publishedAt),
        imageUrl,
        category: item.category?.toUpperCase() || 'WORLD',
        originalLanguage: item.language,
        sources: [item.source],
        sourceType: item.sourceType,  // Preserve source type (rss, grounding, 6park)
      };

      // Save to cache
      await saveNewsToCache(processedItem);
      newsLogger.debug('processNews', `Saved to cache: ${originalTitle.slice(0, 40)}...`);
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
  categories: string[] = ['politics', 'technology', 'military', 'international', 'business'],
  language: string = 'en'
): Promise<AgentResponse<ProcessedNewsItem[]>> => {
  const opId = newsLogger.operationStart('fetchAllNews', { categories, language });
  const startTime = Date.now();
  const allRawNews: RawNewsItem[] = [];
  const errors: string[] = [];

  // Map friendly category names to RSS categories
  const rssCategoryMap: Record<string, string> = {
    'politics': 'POLITICS',
    'technology': 'TECH',
    'tech': 'TECH',
    'military': 'MILITARY',
    'international': 'WORLD',
    'world': 'WORLD',
    'business': 'BUSINESS'
  };
  const rssCategories = categories.map(cat => rssCategoryMap[cat.toLowerCase()] || cat.toUpperCase());

  // Fetch from Google News RSS (primary source for multi-language)
  newsLogger.info('fetchAllNews', `Fetching from Google News RSS (${language})...`);
  const rssResult = await fetchGoogleNewsRSS(rssCategories, language);
  if (rssResult.success && rssResult.data) {
    newsLogger.info('fetchAllNews', `RSS returned ${rssResult.data.length} items`);
    allRawNews.push(...rssResult.data);
  } else if (rssResult.error) {
    newsLogger.warn('fetchAllNews', `RSS failed: ${rssResult.error}`);
    errors.push(`RSS: ${rssResult.error}`);
  }

  // Fetch from Google Search Grounding (fallback for English)
  if (language === 'en') {
    newsLogger.info('fetchAllNews', 'Fetching from Google Search Grounding...');
    const groundingResult = await fetchNewsWithGrounding(categories);
    if (groundingResult.success && groundingResult.data) {
      newsLogger.info('fetchAllNews', `Grounding returned ${groundingResult.data.length} items`);
      allRawNews.push(...groundingResult.data);
    } else if (groundingResult.error) {
      newsLogger.warn('fetchAllNews', `Grounding failed: ${groundingResult.error}`);
      errors.push(`Grounding: ${groundingResult.error}`);
    }
  }

  // Fetch Chinese news from 6park (for Chinese language)
  if (language === 'zh') {
    newsLogger.info('fetchAllNews', 'Fetching from 6park Chinese news...');
    const sixParkResult = await fetch6ParkNews();
    if (sixParkResult.success && sixParkResult.data) {
      newsLogger.info('fetchAllNews', `6park returned ${sixParkResult.data.length} items`);
      allRawNews.push(...sixParkResult.data);
    } else if (sixParkResult.error) {
      newsLogger.warn('fetchAllNews', `6park failed: ${sixParkResult.error}`);
      errors.push(`6park: ${sixParkResult.error}`);
    }
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
    rssNews: rssResult.data?.length || 0,
    totalProcessed: processedNews.length,
    duplicatesRemoved,
    finalCount: uniqueNews.length,
    language,
    processingTimeMs: Date.now() - startTime
  } as any);

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
 * MULTI-LANGUAGE UPDATE: Support non-Latin characters (Chinese, Japanese, etc.)
 */
const deduplicateNews = (news: ProcessedNewsItem[]): ProcessedNewsItem[] => {
  const seen = new Set<string>();
  return news.filter(item => {
    // Create a simplified key from title (keep all Unicode characters, not just a-z)
    // Remove only punctuation and whitespace, keep Chinese/Japanese characters
    const key = item.title
      .toLowerCase()
      .replace(/[\s\p{P}]/gu, '') // Remove whitespace and punctuation (Unicode-aware)
      .slice(0, 50);

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
