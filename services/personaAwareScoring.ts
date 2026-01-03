/**
 * Persona-Aware Company Scoring Module
 *
 * This module implements persona-aware numerical scoring with dynamic weight redistribution.
 *
 * KEY FEATURES:
 * 1. Different personas get different scores for the same company
 * 2. Handles missing data gracefully by redistributing weights
 * 3. Fully compatible with existing dual-mode system (Mode 1: AI-Data Based)
 */

import { StanceType } from '../data/sp500Companies';
import { PERSONA_CONFIGS } from './personaScoringConfig';

// ============================================================================
// DATA AVAILABILITY TRACKING
// ============================================================================

export interface DataAvailability {
  hasFEC: boolean;
  hasESG: boolean;
  hasExecutive: boolean;
  hasNews: boolean;
}

export interface ScoringWeights {
  fec: number;       // 0-1, will sum to 1.0 across all available sources
  esg: number;
  executive: number;
  news: number;
}

/**
 * Calculate dynamic weights based on data availability
 * Missing data sources have their weights redistributed to available sources
 */
export function calculateDynamicWeights(availability: DataAvailability): ScoringWeights {
  // Original target weights when all data is available
  const TARGET_WEIGHTS = {
    fec: 0.4,       // 40% FEC
    esg: 0.3,       // 30% ESG
    executive: 0.2, // 20% Executive
    news: 0.1,      // 10% News
  };

  // Track which sources are available
  const availableSources: Array<keyof typeof TARGET_WEIGHTS> = [];
  let totalAvailableWeight = 0;

  // Collect available sources and their target weights
  if (availability.hasFEC) {
    availableSources.push('fec');
    totalAvailableWeight += TARGET_WEIGHTS.fec;
  }
  if (availability.hasESG) {
    availableSources.push('esg');
    totalAvailableWeight += TARGET_WEIGHTS.esg;
  }
  if (availability.hasExecutive) {
    availableSources.push('executive');
    totalAvailableWeight += TARGET_WEIGHTS.executive;
  }
  if (availability.hasNews) {
    availableSources.push('news');
    totalAvailableWeight += TARGET_WEIGHTS.news;
  }

  // No data available - return zeros
  if (availableSources.length === 0) {
    return { fec: 0, esg: 0, executive: 0, news: 0 };
  }

  // Redistribute weights proportionally
  const weights: ScoringWeights = { fec: 0, esg: 0, executive: 0, news: 0 };

  availableSources.forEach((source) => {
    // Normalize: (target_weight / total_available_weight)
    weights[source] = TARGET_WEIGHTS[source] / totalAvailableWeight;
  });

  return weights;
}

// ============================================================================
// PERSONA-AWARE SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate FEC donation alignment score (persona-aware)
 *
 * @param fecData - FEC donation data with party breakdowns
 * @param stanceType - User's political stance
 * @returns Score 0-100, or null if no data
 */
export function calculateFECScorePersonaAware(
  fecData: any,
  stanceType: StanceType
): number | null {
  // Check if party_totals exists and has data
  if (!fecData || !fecData.party_totals || !fecData.total_usd || fecData.total_usd === 0) {
    return null; // No data available
  }

  const config = PERSONA_CONFIGS[stanceType].fec;

  // Calculate party donation ratio from party_totals nested structure
  const demAmount = fecData.party_totals?.DEM?.total_amount_usd || 0;
  const repAmount = fecData.party_totals?.REP?.total_amount_usd || 0;
  const totalAmount = fecData.total_usd || 1;

  const demRatio = demAmount / totalAmount;
  const repRatio = repAmount / totalAmount;

  // Base score from party alignment
  let alignmentScore: number;

  if (config.partyPreference > 0) {
    // Prefer Democratic donations
    alignmentScore = demRatio * 100 * config.partyPreference;
  } else if (config.partyPreference < 0) {
    // Prefer Republican donations
    alignmentScore = repRatio * 100 * Math.abs(config.partyPreference);
  } else {
    // Neutral - prefer balance
    alignmentScore = 50 + (Math.abs(demRatio - 0.5)) * 100;
  }

  // Factor in total donation amount (anti-establishment adjustment)
  // High amountSensitivity = penalize large donors
  const totalAmountUSD = totalAmount / 100;
  const amountPenalty = Math.min(20, (totalAmountUSD / 1000000) * config.amountSensitivity * 10);

  // Final score: alignment - penalty + baseline
  let finalScore = alignmentScore - amountPenalty + 20;

  // ENHANCEMENT: Use political_lean_score if available
  if (fecData.political_lean_score !== undefined) {
    // political_lean_score ranges from -100 (very conservative) to +100 (very progressive)
    // Adjust score based on persona alignment
    const leanScore = fecData.political_lean_score;

    if (config.partyPreference > 0) {
      // Progressive personas: boost if lean is positive
      finalScore = finalScore * 0.8 + ((leanScore + 100) / 2) * 0.2;
    } else if (config.partyPreference < 0) {
      // Conservative personas: boost if lean is negative
      finalScore = finalScore * 0.8 + ((100 - leanScore) / 2) * 0.2;
    }
  }

  // ENHANCEMENT: Factor in donation distribution diversity
  if (fecData.party_totals && Object.keys(fecData.party_totals).length > 0) {
    const partyCount = Object.keys(fecData.party_totals).length;

    // Diversity bonus for neutral personas, penalty for partisan personas
    if (Math.abs(config.partyPreference) < 0.3) {
      // Neutral personas prefer diverse donations
      const diversityBonus = Math.min(5, partyCount * 2);
      finalScore += diversityBonus;
    } else {
      // Partisan personas prefer focused donations
      if (partyCount > 2) {
        finalScore -= 3; // Small penalty for spreading donations
      }
    }
  }

  return Math.min(100, Math.max(0, finalScore));
}

/**
 * Calculate ESG alignment score (persona-aware)
 *
 * @param esgData - ESG scores (environmental, social, governance)
 * @param stanceType - User's political stance
 * @returns Score 0-100, or null if no data
 */
export function calculateESGScorePersonaAware(
  esgData: any,
  stanceType: StanceType
): number | null {
  if (!esgData ||
      (esgData.environmentalScore === undefined &&
       esgData.socialScore === undefined &&
       esgData.governanceScore === undefined)) {
    return null; // No ESG data
  }

  const config = PERSONA_CONFIGS[stanceType].esg;

  // Use default 50 for missing sub-scores
  const envScore = esgData.environmentalScore ?? 50;
  const socScore = esgData.socialScore ?? 50;
  const govScore = esgData.governanceScore ?? 50;

  // Calculate weighted ESG score based on persona preferences
  const totalWeight = config.environmentalWeight + config.socialWeight + config.governanceWeight;
  const weightedESG =
    (envScore * config.environmentalWeight +
     socScore * config.socialWeight +
     govScore * config.governanceWeight) / totalWeight;

  // Apply persona preference direction
  let finalScore: number;

  if (config.preferHighESG) {
    // High ESG is good: directly use weighted score
    finalScore = weightedESG * config.esgImportance + 50 * (1 - config.esgImportance);
  } else {
    // High ESG is bad (anti-regulation stance): invert
    const invertedESG = 100 - weightedESG;
    finalScore = invertedESG * config.esgImportance + 50 * (1 - config.esgImportance);
  }

  // ENHANCEMENT: Use progressive_lean_score for progressive/socialist personas
  if (esgData.progressive_lean_score !== undefined &&
      (stanceType.includes('progressive') || stanceType.includes('socialist'))) {
    // progressive_lean_score ranges from 0-100, higher = more progressive
    // Weight it with the ESG score (70% ESG, 30% progressive lean)
    finalScore = finalScore * 0.7 + esgData.progressive_lean_score * 0.3;
  }

  // ENHANCEMENT: Industry relative scoring - bonus if above industry average
  if (esgData.industrySectorAvg?.ESGScore && esgData.ESGScore) {
    const industryAvg = esgData.industrySectorAvg.ESGScore;
    const companyScore = esgData.ESGScore;
    const relativePerformance = ((companyScore - industryAvg) / industryAvg) * 100;

    // Add bonus/penalty based on relative performance (max ±5 points)
    const relativeBonus = Math.max(-5, Math.min(5, relativePerformance / 4));
    if (config.preferHighESG) {
      finalScore += relativeBonus;
    } else {
      finalScore -= relativeBonus;
    }
  }

  return Math.min(100, Math.max(0, finalScore));
}

/**
 * Calculate Executive statements alignment score (persona-aware)
 *
 * @param execData - Executive statements analysis data
 * @param stanceType - User's political stance
 * @returns Score 0-100, or null if no data
 */
export function calculateExecutiveScorePersonaAware(
  execData: any,
  stanceType: StanceType
): number | null {
  if (!execData || !execData.has_executive_statements) {
    return null; // No executive data
  }

  const config = PERSONA_CONFIGS[stanceType].executive;

  // Check if we have a political stance analysis
  const politicalStance = execData.political_stance;
  const confidence = politicalStance?.confidence || 0;

  // If confidence is too low, fall back to neutral
  if (confidence < config.confidenceThreshold) {
    return 50; // Low confidence - neutral score
  }

  // Check if executive's leaning matches persona's preferred leanings
  const executiveLeaning = (politicalStance?.overall_leaning || '').toLowerCase();
  const matchesPreference = config.preferredLeanings.some(
    (preferred) => executiveLeaning.includes(preferred.toLowerCase())
  );

  // Use recommendation_score if available, otherwise calculate from alignment
  let baseScore = execData.recommendation_score || 50;

  // Adjust based on alignment with persona
  if (matchesPreference) {
    // Boost score if executive aligns with persona
    baseScore = Math.min(100, baseScore + 15);
  } else if (executiveLeaning && executiveLeaning !== 'moderate') {
    // Penalize if executive clearly opposes persona
    baseScore = Math.max(0, baseScore - 15);
  }

  // ENHANCEMENT: Use sentiment_analysis fields
  if (execData.sentiment_analysis) {
    const sentiment = execData.sentiment_analysis;

    // Controversy level (0-10): High controversy may be good or bad depending on persona
    if (sentiment.controversy_level !== undefined) {
      const controversyLevel = sentiment.controversy_level;

      // Anti-establishment personas prefer controversial companies
      if (stanceType.includes('socialist') || stanceType.includes('nationalist')) {
        // Slight boost for controversy (max +5 points)
        baseScore += Math.min(5, controversyLevel * 0.5);
      } else if (stanceType.includes('capitalist-globalist')) {
        // Establishment personas penalize controversy
        baseScore -= Math.min(8, controversyLevel * 0.8);
      }
    }

    // Public perception risk (low/medium/high): Generally negative
    if (sentiment.public_perception_risk) {
      const riskLevel = String(sentiment.public_perception_risk).toLowerCase();
      if (riskLevel === 'high') {
        baseScore -= 5;
      } else if (riskLevel === 'medium') {
        baseScore -= 2;
      }
    }

    // Overall sentiment (positive/neutral/negative)
    if (sentiment.overall_sentiment) {
      const overallSentiment = String(sentiment.overall_sentiment).toLowerCase();
      if (overallSentiment === 'positive') {
        baseScore += 3;
      } else if (overallSentiment === 'negative') {
        baseScore -= 3;
      }
    }
  }

  // ENHANCEMENT: Use social_responsibility fields
  if (execData.social_responsibility) {
    const socialResp = execData.social_responsibility;

    // Labor practices score (0-100)
    if (socialResp.labor_practices_score !== undefined) {
      // Progressive/socialist personas care more about labor
      if (stanceType.includes('progressive') || stanceType.includes('socialist')) {
        const laborBonus = ((socialResp.labor_practices_score - 50) / 50) * 8;
        baseScore += laborBonus;
      }
    }

    // Community engagement score (0-100)
    if (socialResp.community_engagement_score !== undefined) {
      // Nationalist personas value community engagement
      if (stanceType.includes('nationalist')) {
        const communityBonus = ((socialResp.community_engagement_score - 50) / 50) * 5;
        baseScore += communityBonus;
      }
    }

    // Diversity and inclusion score (0-100)
    if (socialResp.diversity_inclusion_score !== undefined) {
      // Progressive personas strongly value D&I
      if (stanceType.includes('progressive')) {
        const diBonus = ((socialResp.diversity_inclusion_score - 50) / 50) * 10;
        baseScore += diBonus;
      } else if (stanceType.includes('conservative')) {
        // Conservative personas may be neutral or slightly negative on high D&I focus
        const diPenalty = ((socialResp.diversity_inclusion_score - 50) / 50) * -2;
        baseScore += diPenalty;
      }
    }
  }

  return Math.min(100, Math.max(0, baseScore));
}

/**
 * Calculate News sentiment alignment score (persona-aware)
 *
 * @param newsData - Recent news articles
 * @param stanceType - User's political stance
 * @returns Score 0-100, or null if no data
 */
export function calculateNewsScorePersonaAware(
  newsData: any[],
  stanceType: StanceType
): number | null {
  if (!newsData || newsData.length === 0) {
    return null; // No news data
  }

  const config = PERSONA_CONFIGS[stanceType].news;

  // ENHANCED: Analyze article recency, publishers, and keywords
  const now = new Date().getTime();
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);

  let recentCount = 0;
  let monthCount = 0;
  let olderCount = 0;
  let controversialKeywordCount = 0;
  let positiveKeywordCount = 0;
  let negativeKeywordCount = 0;

  // Controversial keywords that indicate newsworthy issues
  const controversialKeywords = [
    'lawsuit', 'investigation', 'scandal', 'controversy', 'violation',
    'fraud', 'breach', 'crisis', 'protest', 'strike', 'layoff',
    'regulatory', 'fine', 'penalty', 'allegation'
  ];

  // Positive keywords
  const positiveKeywords = [
    'innovation', 'growth', 'expansion', 'profit', 'success',
    'award', 'breakthrough', 'partnership', 'achievement', 'milestone',
    'sustainable', 'ethical', 'responsible'
  ];

  // Negative keywords
  const negativeKeywords = [
    'decline', 'loss', 'failure', 'downgrade', 'bankruptcy',
    'misconduct', 'corruption', 'harm', 'damage', 'risk'
  ];

  newsData.forEach((article) => {
    // Analyze recency
    const publishedDate = new Date(article.published_utc || article.published_at || 0).getTime();
    if (publishedDate > oneWeekAgo) {
      recentCount++;
    } else if (publishedDate > oneMonthAgo) {
      monthCount++;
    } else {
      olderCount++;
    }

    // Analyze content for sentiment keywords
    const content = `${article.title || ''} ${article.description || ''}`.toLowerCase();

    controversialKeywords.forEach(keyword => {
      if (content.includes(keyword)) controversialKeywordCount++;
    });

    positiveKeywords.forEach(keyword => {
      if (content.includes(keyword)) positiveKeywordCount++;
    });

    negativeKeywords.forEach(keyword => {
      if (content.includes(keyword)) negativeKeywordCount++;
    });
  });

  // Calculate base score from article recency and volume
  const totalArticles = newsData.length;
  const recencyScore = (recentCount * 100 + monthCount * 60 + olderCount * 30) / Math.max(1, totalArticles);

  // Calculate sentiment score
  const totalKeywords = controversialKeywordCount + positiveKeywordCount + negativeKeywordCount;
  let sentimentScore = 50; // Neutral baseline

  if (totalKeywords > 0) {
    const positiveRatio = positiveKeywordCount / totalKeywords;
    const negativeRatio = negativeKeywordCount / totalKeywords;
    const controversialRatio = controversialKeywordCount / totalKeywords;

    // Base sentiment from positive vs negative
    sentimentScore = 50 + (positiveRatio - negativeRatio) * 50;

    // Apply persona-specific adjustments
    if (config.sentimentPreference > 0) {
      // Prefer positive news
      sentimentScore += positiveRatio * 20;
      sentimentScore -= controversialRatio * 10;
    } else if (config.sentimentPreference < 0) {
      // Prefer controversial/negative news (anti-establishment)
      sentimentScore += controversialRatio * 15;
      sentimentScore -= positiveRatio * 5;
    } else {
      // Neutral: balance is good
      const balance = 1 - Math.abs(positiveRatio - negativeRatio);
      sentimentScore += balance * 10;
    }
  }

  // Volume adjustment - different personas care differently about news volume
  let volumeScore = 50;
  if (totalArticles < 5) {
    volumeScore = 30; // Low visibility
  } else if (totalArticles < 10) {
    volumeScore = 50; // Moderate visibility
  } else if (totalArticles < 20) {
    volumeScore = 70; // High visibility
  } else {
    volumeScore = 85; // Very high visibility
  }

  // Globalist personas prefer high visibility, nationalist may be neutral
  if (stanceType.includes('globalist')) {
    volumeScore *= 1.1; // Boost visibility preference
  } else if (stanceType.includes('nationalist')) {
    volumeScore *= 0.95; // Slight preference for lower profile
  }

  // Combine scores: 40% recency, 40% sentiment, 20% volume
  let finalScore = (recencyScore * 0.4 + sentimentScore * 0.4 + volumeScore * 0.2);

  // Apply news importance weight from persona config
  finalScore = finalScore * config.newsImportance + 50 * (1 - config.newsImportance);

  return Math.min(100, Math.max(0, finalScore));
}

// ============================================================================
// INTEGRATED SCORING FUNCTION
// ============================================================================

export interface PersonaAwareScoreResult {
  // Individual scores (null if data not available)
  fecScore: number | null;
  esgScore: number | null;
  executiveScore: number | null;
  newsScore: number | null;

  // Weighted numerical score (0-100)
  numericalScore: number;

  // Data availability
  dataAvailability: DataAvailability;

  // Dynamic weights used (redistributed based on availability)
  usedWeights: ScoringWeights;

  // Metadata
  hasAnyData: boolean;
  dataSourceCount: number; // How many sources had data
}

/**
 * Calculate comprehensive persona-aware score for a company
 *
 * This function:
 * 1. Checks data availability for all 4 sources
 * 2. Calculates persona-aware scores for each available source
 * 3. Dynamically redistributes weights based on what's available
 * 4. Returns final numerical score
 */
export function calculatePersonaAwareScore(
  fecData: any,
  esgData: any,
  execData: any,
  newsData: any[],
  stanceType: StanceType
): PersonaAwareScoreResult {
  // Calculate individual scores (returns null if no data)
  const fecScore = calculateFECScorePersonaAware(fecData, stanceType);
  const esgScore = calculateESGScorePersonaAware(esgData, stanceType);
  const executiveScore = calculateExecutiveScorePersonaAware(execData, stanceType);
  const newsScore = calculateNewsScorePersonaAware(newsData, stanceType);

  // Track data availability
  const dataAvailability: DataAvailability = {
    hasFEC: fecScore !== null,
    hasESG: esgScore !== null,
    hasExecutive: executiveScore !== null,
    hasNews: newsScore !== null,
  };

  const dataSourceCount = Object.values(dataAvailability).filter(Boolean).length;
  const hasAnyData = dataSourceCount > 0;

  // Calculate dynamic weights
  const usedWeights = calculateDynamicWeights(dataAvailability);

  // Calculate weighted numerical score
  let numericalScore = 0;

  if (fecScore !== null) numericalScore += fecScore * usedWeights.fec;
  if (esgScore !== null) numericalScore += esgScore * usedWeights.esg;
  if (executiveScore !== null) numericalScore += executiveScore * usedWeights.executive;
  if (newsScore !== null) numericalScore += newsScore * usedWeights.news;

  // If no data at all, default to neutral 50
  if (!hasAnyData) {
    numericalScore = 50;
  }

  return {
    fecScore,
    esgScore,
    executiveScore,
    newsScore,
    numericalScore,
    dataAvailability,
    usedWeights,
    hasAnyData,
    dataSourceCount,
  };
}
