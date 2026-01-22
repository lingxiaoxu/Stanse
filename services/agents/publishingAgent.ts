/**
 * Publishing Agent
 * Responsible for:
 * 1. Generating embeddings for news articles
 * 2. Personalizing news feed based on user's political stance
 * 3. Finding similar news using embeddings (avoid reprocessing)
 * 4. Ranking and sorting news for diversity
 */

import { GoogleGenAI } from "@google/genai";
import { ProcessedNewsItem, PersonalizedFeed, NewsEmbedding, AgentResponse } from './types';
import { PoliticalCoordinates } from '../../types';
import { db } from '../firebase';
import { publishingLogger } from './logger';
import { createTitleHash } from '../newsCache';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp
} from 'firebase/firestore';

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

const EMBEDDINGS_COLLECTION = 'news_embeddings';
const NEWS_COLLECTION = 'news';

/**
 * Generate embedding for a news article using Gemini
 * MULTI-LANGUAGE UPDATE: text-embedding-004 model supports multi-language natively
 */
export const generateEmbedding = async (
  text: string,
  language: string = 'en'
): Promise<number[] | null> => {
  const opId = publishingLogger.operationStart('generateEmbedding', { textLength: text.length, language });
  try {
    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text,
    });

    if (response.embeddings && response.embeddings.length > 0) {
      const embedding = response.embeddings[0].values || null;
      publishingLogger.operationSuccess(opId, 'generateEmbedding', {
        embeddingDimensions: embedding?.length || 0,
        language
      });
      return embedding;
    }
    publishingLogger.warn('generateEmbedding', 'No embeddings returned from API');
    return null;
  } catch (error: any) {
    publishingLogger.operationFailed(opId, 'generateEmbedding', error);
    return null;
  }
};

/**
 * Save embedding to Firestore
 */
export const saveEmbedding = async (
  titleHash: string,
  embedding: number[],
  title: string,
  category: string
): Promise<void> => {
  const opId = publishingLogger.operationStart('saveEmbedding', { titleHash, category });
  try {
    const docRef = doc(db, EMBEDDINGS_COLLECTION, titleHash);
    await setDoc(docRef, {
      titleHash,
      embedding,
      title,
      category,
      createdAt: Timestamp.now()
    });
    publishingLogger.operationSuccess(opId, 'saveEmbedding', { titleHash });
  } catch (error: any) {
    publishingLogger.operationFailed(opId, 'saveEmbedding', error, { titleHash });
  }
};

/**
 * Get embedding from cache
 */
export const getEmbedding = async (titleHash: string): Promise<NewsEmbedding | null> => {
  publishingLogger.debug('getEmbedding', `Looking up embedding for ${titleHash}`);
  try {
    const docRef = doc(db, EMBEDDINGS_COLLECTION, titleHash);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      publishingLogger.debug('getEmbedding', `Cache HIT for ${titleHash}`);
      return {
        titleHash: data.titleHash,
        embedding: data.embedding,
        title: data.title,
        category: data.category,
        createdAt: data.createdAt?.toDate() || new Date()
      };
    }
    publishingLogger.debug('getEmbedding', `Cache MISS for ${titleHash}`);
    return null;
  } catch (error: any) {
    publishingLogger.error('getEmbedding', `Failed to get embedding for ${titleHash}`, error);
    return null;
  }
};

/**
 * Calculate cosine similarity between two embeddings
 */
const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Find similar news articles using embeddings
 */
export const findSimilarNews = async (
  embedding: number[],
  threshold: number = 0.8,
  maxResults: number = 5
): Promise<NewsEmbedding[]> => {
  const opId = publishingLogger.operationStart('findSimilarNews', { threshold, maxResults });
  try {
    // Get all embeddings (in production, use vector database like Pinecone)
    const q = query(
      collection(db, EMBEDDINGS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const querySnapshot = await getDocs(q);
    const similarities: { embedding: NewsEmbedding; score: number }[] = [];

    querySnapshot.docs.forEach(doc => {
      const data = doc.data() as NewsEmbedding;
      if (data.embedding) {
        const score = cosineSimilarity(embedding, data.embedding);
        if (score >= threshold) {
          similarities.push({ embedding: data, score });
        }
      }
    });

    // Sort by similarity and return top results
    const results = similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.embedding);

    publishingLogger.operationSuccess(opId, 'findSimilarNews', {
      totalCompared: querySnapshot.docs.length,
      aboveThreshold: similarities.length,
      returned: results.length
    });
    return results;
  } catch (error: any) {
    publishingLogger.operationFailed(opId, 'findSimilarNews', error);
    return [];
  }
};

/**
 * Calculate relevance score based on user's political stance and content embeddings
 * Combines category-based scoring with semantic similarity when embeddings are available
 */
const calculateRelevanceScore = (
  newsItem: ProcessedNewsItem,
  userStance: PoliticalCoordinates,
  userEmbedding?: number[] | null
): number => {
  // Base score from category preferences
  let categoryScore = 50;

  // Category preferences based on stance
  const categoryWeights: Record<string, (stance: PoliticalCoordinates) => number> = {
    'POLITICS': (s) => 80 + Math.abs(s.economic) * 0.1,
    'TECH': (s) => 70 + (s.social > 0 ? 10 : 0),
    'MILITARY': (s) => 60 + (s.diplomatic < 0 ? 15 : -5),
    'WORLD': (s) => 75 + (s.diplomatic > 0 ? 10 : -5),
    'BUSINESS': (s) => 70 + (s.economic > 0 ? 10 : 0),
  };

  const categoryWeight = categoryWeights[newsItem.category];
  if (categoryWeight) {
    categoryScore = categoryWeight(userStance);
  }

  // If embeddings are available, combine with semantic similarity
  let finalScore = categoryScore;
  let semanticScore = 0;
  let similarity = 0;

  if (userEmbedding && newsItem.embedding && newsItem.embedding.length > 0) {
    similarity = cosineSimilarity(userEmbedding, newsItem.embedding);
    // Semantic similarity contributes up to 30% of final score
    // Category score contributes 70%
    semanticScore = similarity * 100; // Convert 0-1 similarity to 0-100 score
    finalScore = categoryScore * 0.7 + semanticScore * 0.3;
    publishingLogger.debug('calculateRelevanceScore',
      `"${newsItem.title.slice(0, 40)}..." → Category: ${categoryScore.toFixed(1)}, Similarity: ${(similarity * 100).toFixed(1)}%, Semantic: ${semanticScore.toFixed(1)}, Final: ${finalScore.toFixed(1)}`
    );
  } else {
    publishingLogger.debug('calculateRelevanceScore',
      `"${newsItem.title.slice(0, 40)}..." → Category-only: ${categoryScore.toFixed(1)} (no embedding)`
    );
  }

  // Add small deterministic variance based on titleHash for consistency
  // Use hash instead of random() so same news gets same score for same user
  const hashSeed = newsItem.titleHash.split('').reduce((acc, char) =>
    acc + char.charCodeAt(0), 0
  );
  const variance = ((hashSeed % 100) / 100 - 0.5) * 5; // ±2.5 points deterministic variance
  finalScore += variance;

  const clampedScore = Math.max(0, Math.min(100, finalScore));

  // Log final score with all components
  publishingLogger.debug('calculateRelevanceScore',
    `Final: ${clampedScore.toFixed(1)} = Category(${categoryScore.toFixed(1)}) * 0.7 + Semantic(${semanticScore.toFixed(1)}) * 0.3 + Variance(${variance.toFixed(1)})`
  );

  return clampedScore;
};

/**
 * Personalize and rank news for a user
 */
export const personalizeNewsFeed = async (
  news: ProcessedNewsItem[],
  userStance: PoliticalCoordinates,
  maxItems: number = 10,
  userEmbedding?: number[] | null
): Promise<AgentResponse<PersonalizedFeed>> => {
  const startTime = Date.now();
  const opId = publishingLogger.operationStart('personalizeNewsFeed', {
    inputCount: news.length,
    maxItems,
    userStance: { economic: userStance.economic, social: userStance.social },
    hasUserEmbedding: !!userEmbedding
  });

  try {
    // Validate input
    if (!news || news.length === 0) {
      publishingLogger.warn('personalizeNewsFeed', 'No news items to personalize');
      return {
        success: true,
        data: {
          news: [],
          userStance,
          diversityScore: 0
        },
        metadata: {
          source: 'publishing-agent',
          timestamp: new Date(),
          processingTime: Date.now() - startTime
        }
      };
    }

    // Calculate relevance scores (with embeddings if available)
    const scoredNews = news.map(item => ({
      ...item,
      relevanceScore: calculateRelevanceScore(item, userStance, userEmbedding)
    }));

    // Sort by relevance
    scoredNews.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Log top 10 scored news for debugging
    publishingLogger.info('personalizeNewsFeed',
      `Top ${Math.min(10, scoredNews.length)} scored news:\n` +
      scoredNews.slice(0, 10).map((item, idx) =>
        `  ${idx + 1}. [${item.category}] "${item.title.slice(0, 50)}..." - Score: ${item.relevanceScore?.toFixed(1)}`
      ).join('\n')
    );

    // Ensure category diversity - at least one from each if available
    const categories = ['POLITICS', 'TECH', 'MILITARY', 'WORLD', 'BUSINESS'];
    const selectedNews: ProcessedNewsItem[] = [];
    const usedCategories = new Set<string>();

    // First pass: one from each category
    for (const category of categories) {
      const categoryItem = scoredNews.find(
        item => item.category === category && !selectedNews.includes(item)
      );
      if (categoryItem) {
        selectedNews.push(categoryItem);
        usedCategories.add(category);
      }
    }

    // Second pass: fill remaining slots with top relevance
    for (const item of scoredNews) {
      if (selectedNews.length >= maxItems) break;
      if (!selectedNews.includes(item)) {
        selectedNews.push(item);
      }
    }

    // Calculate diversity score (0-100)
    const diversityScore = (usedCategories.size / categories.length) * 100;

    publishingLogger.operationSuccess(opId, 'personalizeNewsFeed', {
      outputCount: selectedNews.slice(0, maxItems).length,
      diversityScore,
      categoriesUsed: Array.from(usedCategories)
    });

    publishingLogger.summary('personalizeNewsFeed', {
      inputNews: news.length,
      outputNews: selectedNews.slice(0, maxItems).length,
      diversityScore: Math.round(diversityScore),
      categoriesUsed: usedCategories.size
    });

    return {
      success: true,
      data: {
        news: selectedNews.slice(0, maxItems),
        userStance,
        diversityScore
      },
      metadata: {
        source: 'publishing-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  } catch (error: any) {
    publishingLogger.operationFailed(opId, 'personalizeNewsFeed', error);
    return {
      success: false,
      error: error.message,
      metadata: {
        source: 'publishing-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Process news with embeddings (for future similarity search)
 * MULTI-LANGUAGE UPDATE: Generate embeddings for each language version
 */
export const processNewsWithEmbeddings = async (
  news: ProcessedNewsItem[],
  language: string = 'en'
): Promise<ProcessedNewsItem[]> => {
  const opId = publishingLogger.operationStart('processNewsWithEmbeddings', { newsCount: news.length, language });
  let cacheHits = 0;
  let newEmbeddings = 0;
  let failed = 0;

  // OPTIMIZATION: Process all embeddings in parallel using Promise.all
  const processedNews = await Promise.all(
    news.map(async (item) => {
      // Check if embedding already exists (use titleHash + language to cache)
      const existingEmbedding = await getEmbedding(item.titleHash);

      if (existingEmbedding) {
        cacheHits++;
        return {
          ...item,
          embedding: existingEmbedding.embedding
        };
      } else {
        // Generate new embedding for this language version
        const text = `${item.title}. ${item.summary}`;
        const embedding = await generateEmbedding(text, language);

        if (embedding) {
          newEmbeddings++;
          await saveEmbedding(item.titleHash, embedding, item.title, item.category);
          return {
            ...item,
            embedding
          };
        } else {
          failed++;
          return item;
        }
      }
    })
  );

  publishingLogger.operationSuccess(opId, 'processNewsWithEmbeddings', {
    total: news.length,
    cacheHits,
    newEmbeddings,
    failed
  });

  publishingLogger.summary('processNewsWithEmbeddings', {
    totalNews: news.length,
    cacheHits,
    newEmbeddings,
    failed
  });

  return processedNews;
};

/**
 * Get cached news from database (avoid re-fetching)
 * MULTI-LANGUAGE UPDATE: Filter by language to get language-specific news
 */
export const getCachedNews = async (
  maxItems: number = 20,
  language: string = 'en',  // Now required, defaults to 'en'
  maxAgeHours: number = 12  // Only use news less than 12 hours old (more timely)
): Promise<ProcessedNewsItem[]> => {
  const opId = publishingLogger.operationStart('getCachedNews', { maxItems, language, maxAgeHours });
  try {
    // Calculate cutoff time (only news newer than this)
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const cutoffTimestamp = Timestamp.fromDate(cutoffTime);

    // MULTI-LANGUAGE UPDATE: Always filter by language (each language has separate news documents)
    const q = query(
      collection(db, NEWS_COLLECTION),
      where('originalLanguage', '==', language),
      where('createdAt', '>=', cutoffTimestamp),
      orderBy('createdAt', 'desc'),
      limit(maxItems)
    );

    const querySnapshot = await getDocs(q);

    // Validate and filter results
    const results = querySnapshot.docs
      .map(doc => {
        const data = doc.data() as any;

        // Validate required fields
        if (!data.id || !data.title || !data.summary) {
          publishingLogger.warn('getCachedNews', `Invalid news data in doc ${doc.id}, skipping`);
          return null;
        }

        // Debug: Check if titleHash is missing
        if (!data.titleHash) {
          publishingLogger.warn('getCachedNews', `Missing titleHash for doc ${doc.id}: ${data.title?.slice(0, 50)}`);
        }

        return {
          id: data.id,
          titleHash: data.titleHash || '', // Empty string if missing (will be filtered later)
          title: data.title,
          summary: data.summary,
          date: data.date || 'UNKNOWN',
          imageUrl: data.imageUrl || '',
          category: data.category || 'WORLD',
          originalLanguage: data.originalLanguage || 'en',
          sources: data.sources || [],
          sourceType: data.sourceType,
          embedding: data.embedding,
        } as ProcessedNewsItem;
      })
      .filter((item): item is ProcessedNewsItem => item !== null);

    publishingLogger.operationSuccess(opId, 'getCachedNews', {
      requested: maxItems,
      returned: results.length,
      invalid: querySnapshot.docs.length - results.length
    });

    return results;
  } catch (error: any) {
    // Enhanced error handling with specific error types
    publishingLogger.operationFailed(opId, 'getCachedNews', error, {
      language,
      maxItems,
      errorCode: error.code,
      errorMessage: error.message
    });

    // Check if it's a Firestore index error
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      publishingLogger.error('getCachedNews',
        'Firestore index missing! Run: firebase deploy --only firestore:indexes',
        error
      );
    }

    // Return empty array but error is logged
    return [];
  }
};