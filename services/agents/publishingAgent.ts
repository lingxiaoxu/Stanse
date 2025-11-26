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
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
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
 */
export const generateEmbedding = async (text: string): Promise<number[] | null> => {
  const opId = publishingLogger.operationStart('generateEmbedding', { textLength: text.length });
  try {
    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text,
    });

    if (response.embeddings && response.embeddings.length > 0) {
      const embedding = response.embeddings[0].values || null;
      publishingLogger.operationSuccess(opId, 'generateEmbedding', {
        embeddingDimensions: embedding?.length || 0
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
 * Calculate relevance score based on user's political stance
 */
const calculateRelevanceScore = (
  newsItem: ProcessedNewsItem,
  userStance: PoliticalCoordinates
): number => {
  // Base score
  let score = 50;

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
    score = categoryWeight(userStance);
  }

  // Add some randomness for diversity
  score += (Math.random() - 0.5) * 10;

  return Math.max(0, Math.min(100, score));
};

/**
 * Personalize and rank news for a user
 */
export const personalizeNewsFeed = async (
  news: ProcessedNewsItem[],
  userStance: PoliticalCoordinates,
  maxItems: number = 10
): Promise<AgentResponse<PersonalizedFeed>> => {
  const startTime = Date.now();
  const opId = publishingLogger.operationStart('personalizeNewsFeed', {
    inputCount: news.length,
    maxItems,
    userStance: { economic: userStance.economic, social: userStance.social }
  });

  try {
    // Calculate relevance scores
    const scoredNews = news.map(item => ({
      ...item,
      relevanceScore: calculateRelevanceScore(item, userStance)
    }));

    // Sort by relevance
    scoredNews.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

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
 */
export const processNewsWithEmbeddings = async (
  news: ProcessedNewsItem[]
): Promise<ProcessedNewsItem[]> => {
  const opId = publishingLogger.operationStart('processNewsWithEmbeddings', { newsCount: news.length });
  let cacheHits = 0;
  let newEmbeddings = 0;
  let failed = 0;

  // OPTIMIZATION: Process all embeddings in parallel using Promise.all
  const processedNews = await Promise.all(
    news.map(async (item) => {
      // Check if embedding already exists
      const existingEmbedding = await getEmbedding(item.titleHash);

      if (existingEmbedding) {
        cacheHits++;
        return {
          ...item,
          embedding: existingEmbedding.embedding
        };
      } else {
        // Generate new embedding
        const text = `${item.title}. ${item.summary}`;
        const embedding = await generateEmbedding(text);

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
 */
export const getCachedNews = async (
  maxItems: number = 20
): Promise<ProcessedNewsItem[]> => {
  const opId = publishingLogger.operationStart('getCachedNews', { maxItems });
  try {
    const q = query(
      collection(db, NEWS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(maxItems)
    );

    const querySnapshot = await getDocs(q);
    const results = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        titleHash: data.titleHash || '',
        title: data.title,
        summary: data.summary,
        date: data.date,
        imageUrl: data.imageUrl,
        category: data.category,
        originalLanguage: data.originalLanguage || 'en',
        sources: data.sources || [],
      } as ProcessedNewsItem;
    });

    publishingLogger.operationSuccess(opId, 'getCachedNews', {
      requested: maxItems,
      returned: results.length
    });
    return results;
  } catch (error: any) {
    publishingLogger.operationFailed(opId, 'getCachedNews', error);
    return [];
  }
};