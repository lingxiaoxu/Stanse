/**
 * Stanse Multi-Agent System
 *
 * Architecture:
 * - News Agent: Fetches real news from Google Search, RSS, 6park
 * - Publishing Agent: Personalizes and ranks news, manages embeddings
 * - Stance Agent: Calculates political coordinates and personas
 * - Sense Agent: Analyzes entities (companies, people, countries)
 */

// Types
export * from './types';

// News Agent - Real news fetching
export {
  fetchNewsWithGrounding,
  fetchGoogleNewsRSS,
  fetch6ParkNews,
  fetchAllNews,
  processNewsItems,
} from './newsAgent';

// Publishing Agent - Personalization and embeddings
export {
  generateEmbedding,
  saveEmbedding,
  getEmbedding,
  findSimilarNews,
  personalizeNewsFeed,
  processNewsWithEmbeddings,
  getCachedNews,
} from './publishingAgent';

// Stance Agent - Political calculations
export {
  calculateCoordinates,
  generatePersonaLabel,
  translatePersonaLabel,
} from './stanceAgent';

// Sense Agent - Entity analysis
export {
  analyzeEntity,
  generateEntityReport,
  generatePrismSummary,
} from './senseAgent';

/**
 * Main orchestrator function: Fetch and personalize news
 * This is the primary entry point for the news feed
 */
import { fetchAllNews } from './newsAgent';
import { personalizeNewsFeed, processNewsWithEmbeddings, getCachedNews } from './publishingAgent';
import { PoliticalCoordinates, NewsEvent } from '../../types';
import { ProcessedNewsItem, AgentResponse } from './types';
import { orchestratorLogger } from './logger';

export const getPersonalizedNewsFeed = async (
  userProfile: PoliticalCoordinates,
  forceRefresh: boolean = false,
  maxItems: number = 10
): Promise<AgentResponse<NewsEvent[]>> => {
  const startTime = Date.now();
  const opId = orchestratorLogger.operationStart('getPersonalizedNewsFeed', {
    forceRefresh,
    maxItems,
    userStance: { economic: userProfile.economic, social: userProfile.social }
  });

  try {
    let newsItems: ProcessedNewsItem[] = [];

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      orchestratorLogger.info('getPersonalizedNewsFeed', 'Checking cache...');
      const cachedNews = await getCachedNews(maxItems * 2);
      if (cachedNews.length >= maxItems) {
        orchestratorLogger.info('getPersonalizedNewsFeed', `Using ${cachedNews.length} cached news items`);
        newsItems = cachedNews;
      } else {
        orchestratorLogger.info('getPersonalizedNewsFeed', `Cache insufficient: ${cachedNews.length} items`);
      }
    } else {
      orchestratorLogger.info('getPersonalizedNewsFeed', 'Force refresh requested, skipping cache');
    }

    // Fetch fresh news if cache is empty or stale
    if (newsItems.length < maxItems) {
      orchestratorLogger.info('getPersonalizedNewsFeed', 'Fetching fresh news from agents...');
      const fetchResult = await fetchAllNews();

      if (fetchResult.success && fetchResult.data) {
        orchestratorLogger.info('getPersonalizedNewsFeed', `Fetched ${fetchResult.data.length} news items`);
        // Process with embeddings for future similarity search
        newsItems = await processNewsWithEmbeddings(fetchResult.data);
      } else {
        orchestratorLogger.warn('getPersonalizedNewsFeed', 'News fetch failed, using cache only');
      }
    }

    // Personalize the feed
    orchestratorLogger.info('getPersonalizedNewsFeed', `Personalizing ${newsItems.length} news items...`);
    const personalizedResult = await personalizeNewsFeed(
      newsItems,
      userProfile,
      maxItems
    );

    if (!personalizedResult.success || !personalizedResult.data) {
      throw new Error(personalizedResult.error || 'Personalization failed');
    }

    // Convert to NewsEvent format for frontend compatibility
    const newsEvents: NewsEvent[] = personalizedResult.data.news.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      date: item.date,
      imageUrl: item.imageUrl || '',
      category: item.category,
    }));

    orchestratorLogger.operationSuccess(opId, 'getPersonalizedNewsFeed', {
      totalNewsItems: newsItems.length,
      personalizedItems: newsEvents.length,
      diversityScore: personalizedResult.data.diversityScore
    });

    orchestratorLogger.summary('getPersonalizedNewsFeed', {
      inputNews: newsItems.length,
      outputNews: newsEvents.length,
      diversityScore: Math.round(personalizedResult.data.diversityScore),
      processingTimeMs: Date.now() - startTime
    });

    return {
      success: true,
      data: newsEvents,
      metadata: {
        source: 'agent-orchestrator',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };

  } catch (error: any) {
    orchestratorLogger.operationFailed(opId, 'getPersonalizedNewsFeed', error);
    return {
      success: false,
      error: error.message,
      metadata: {
        source: 'agent-orchestrator',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};