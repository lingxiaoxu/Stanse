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
  maxItems: number = 10,
  language: string = 'en',
  userId?: string
): Promise<AgentResponse<NewsEvent[]>> => {
  const startTime = Date.now();
  const opId = orchestratorLogger.operationStart('getPersonalizedNewsFeed', {
    forceRefresh,
    maxItems,
    language,
    userId: userId || 'anonymous',
    userStance: { economic: userProfile.economic, social: userProfile.social }
  });

  try {
    // Fetch user persona embedding for semantic personalization
    let userEmbedding: number[] | null = null;
    if (userId) {
      try {
        const { getPersonaEmbedding, generateAndSavePersonaEmbedding } = await import('../userPersonaService');
        const { getUserProfile } = await import('../userService');

        // Try to get existing persona embedding
        let personaData = await getPersonaEmbedding(userId);

        // Backfill: If no embedding exists but user has completed onboarding, generate it now
        if (!personaData || !personaData.embedding) {
          orchestratorLogger.info('getPersonalizedNewsFeed', 'No persona embedding found, checking for onboarding data...');

          const userProfileData = await getUserProfile(userId);
          if (userProfileData?.hasCompletedOnboarding && userProfileData.onboarding && userProfileData.coordinates) {
            orchestratorLogger.info('getPersonalizedNewsFeed', 'Backfilling persona embedding for existing user...');

            // Generate embedding (fire-and-forget for first fetch, don't block news)
            generateAndSavePersonaEmbedding(
              userId,
              userProfileData.onboarding,
              userProfileData.coordinates,
              1  // Only 1 retry
            ).then(generated => {
              if (generated) {
                orchestratorLogger.info('getPersonalizedNewsFeed', 'Backfill completed successfully');
              }
            }).catch(err => {
              orchestratorLogger.warn('getPersonalizedNewsFeed', `Backfill failed: ${err.message}`);
            });

            // For this request, fall back to category-only scoring
            orchestratorLogger.info('getPersonalizedNewsFeed', 'Using category-only scoring (backfill in progress)');
          }
        }

        // Use embedding if available
        if (personaData && personaData.embedding && personaData.embedding.length === 768) {
          userEmbedding = personaData.embedding;
          orchestratorLogger.info('getPersonalizedNewsFeed', `Using persona embedding for user ${userId}`);
        } else {
          orchestratorLogger.info('getPersonalizedNewsFeed', 'No valid persona embedding available, using category-only scoring');
        }
      } catch (error: any) {
        orchestratorLogger.warn('getPersonalizedNewsFeed', `Failed to fetch persona embedding: ${error.message}`);
      }
    }

    let newsItems: ProcessedNewsItem[] = [];

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      orchestratorLogger.info('getPersonalizedNewsFeed', `Checking cache for language: ${language}...`);
      // Get cached news for this language, max 12 hours old (more timely)
      const cachedNews = await getCachedNews(maxItems * 2, language, 12);
      if (cachedNews.length >= maxItems) {
        orchestratorLogger.info('getPersonalizedNewsFeed', `Using ${cachedNews.length} cached ${language} news items (shared cache)`);
        newsItems = cachedNews;
      } else {
        orchestratorLogger.info('getPersonalizedNewsFeed', `Cache insufficient: ${cachedNews.length} ${language} items (need ${maxItems})`);
      }
    } else {
      orchestratorLogger.info('getPersonalizedNewsFeed', 'Force refresh requested, skipping cache');
    }

    // Fetch fresh news if cache is empty or stale
    if (newsItems.length < maxItems) {
      orchestratorLogger.info('getPersonalizedNewsFeed', `Fetching fresh news from agents (${language})...`);
      const fetchResult = await fetchAllNews(undefined, language);

      if (fetchResult.success && fetchResult.data) {
        orchestratorLogger.info('getPersonalizedNewsFeed', `Fetched ${fetchResult.data.length} news items`);
        // Process with embeddings for future similarity search
        newsItems = await processNewsWithEmbeddings(fetchResult.data);
      } else {
        orchestratorLogger.warn('getPersonalizedNewsFeed', 'News fetch failed, using cache only');
      }
    }

    // Personalize the feed (with user embedding if available)
    orchestratorLogger.info('getPersonalizedNewsFeed', `Personalizing ${newsItems.length} news items...`);
    const personalizedResult = await personalizeNewsFeed(
      newsItems,
      userProfile,
      maxItems,
      userEmbedding
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