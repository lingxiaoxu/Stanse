/**
 * Sense Agent
 * Responsible for:
 * 1. Analyzing companies, people, countries, organizations
 * 2. Generating alignment reports with user's political stance
 * 3. Providing social signals analysis (Twitter/X, public statements)
 * 4. Finding related news for entities
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BrandAlignment, PoliticalCoordinates } from '../../types';
import { EntityReport, AgentResponse } from './types';
import { getCachedNews } from './publishingAgent';
import { senseLogger } from './logger';

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

/**
 * Detect entity type from name
 */
const detectEntityType = async (
  entityName: string
): Promise<'company' | 'person' | 'country' | 'organization' | 'party'> => {
  senseLogger.debug('detectEntityType', `Detecting type for: ${entityName}`);
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Classify "${entityName}" into one of these categories: company, person, country, organization, party. Return only the category word.`,
    });

    const result = response.text?.trim().toLowerCase() || 'organization';

    if (['company', 'person', 'country', 'organization', 'party'].includes(result)) {
      senseLogger.info('detectEntityType', `Detected ${entityName} as ${result}`);
      return result as any;
    }
    senseLogger.info('detectEntityType', `Defaulting ${entityName} to organization`);
    return 'organization';
  } catch (error: any) {
    senseLogger.error('detectEntityType', `Failed to detect type for ${entityName}`, error);
    return 'organization';
  }
};

/**
 * Analyze an entity's alignment with user's political stance
 * Uses Google Search Grounding for real-time information
 */
export const analyzeEntity = async (
  entityName: string,
  userProfile: PoliticalCoordinates
): Promise<AgentResponse<BrandAlignment>> => {
  const startTime = Date.now();
  const opId = senseLogger.operationStart('analyzeEntity', {
    entityName,
    userStance: { economic: userProfile.economic, social: userProfile.social, diplomatic: userProfile.diplomatic }
  });

  try {
    const prompt = `
      Conduct a deep-dive intelligence report on "${entityName}" (Company, Public Figure, CEO, Country, or Organization).

      User Profile Context:
      - Economic: ${userProfile.economic} (-100 Socialist <-> 100 Capitalist)
      - Social: ${userProfile.social} (-100 Authoritarian <-> 100 Libertarian)
      - Diplomatic: ${userProfile.diplomatic} (-100 Nationalist <-> 100 Globalist)

      Objectives:
      1. Analyze recent news, donations, and corporate/political actions.
      2. **CRITICAL**: Analyze recent public statements, tweets, and rhetoric on X (formerly Twitter). Summarize the "Social Signal".
      3. Determine alignment score (0-100) with user's values.

      Output Format (JSON):
      - 'reportSummary': Professional, objective intelligence summary (Max 30 words).
      - 'socialSignal': Analysis of their recent Twitter/X presence and public rhetoric. What signals are they sending? (Max 25 words).
      - 'keyConflicts': Max 2 specific points of friction with user values.
      - 'keyAlignments': Max 2 specific points of resonance.
      - 'alternatives': Suggest 2 alternatives if score < 50.
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        brandName: { type: Type.STRING },
        score: { type: Type.NUMBER },
        status: { type: Type.STRING, enum: ['MATCH', 'CONFLICT', 'NEUTRAL'] },
        reportSummary: { type: Type.STRING },
        socialSignal: { type: Type.STRING },
        keyConflicts: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        keyAlignments: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        alternatives: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
      },
      required: ['brandName', 'score', 'status', 'reportSummary', 'socialSignal', 'keyConflicts', 'keyAlignments']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const result = JSON.parse(response.text || '{}');

    // Extract grounding sources
    const sources: string[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          sources.push(chunk.web.uri);
        }
      });
    }

    const alignment: BrandAlignment = {
      brandName: result.brandName || entityName,
      score: result.score || 50,
      status: result.status || 'NEUTRAL',
      reportSummary: result.reportSummary || 'Analysis in progress.',
      socialSignal: result.socialSignal || 'Signal analysis unavailable.',
      keyConflicts: result.keyConflicts || [],
      keyAlignments: result.keyAlignments || [],
      alternatives: result.alternatives || [],
      reasoning: result.reportSummary,
      sources: sources.slice(0, 3)
    };

    senseLogger.operationSuccess(opId, 'analyzeEntity', {
      entityName: alignment.brandName,
      score: alignment.score,
      status: alignment.status,
      sourcesCount: alignment.sources?.length || 0
    });

    senseLogger.summary('analyzeEntity', {
      score: alignment.score,
      conflicts: alignment.keyConflicts.length,
      alignments: alignment.keyAlignments.length,
      sources: alignment.sources?.length || 0
    });

    return {
      success: true,
      data: alignment,
      metadata: {
        source: 'sense-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };

  } catch (error: any) {
    senseLogger.operationFailed(opId, 'analyzeEntity', error, { entityName });
    return {
      success: false,
      error: error.message,
      data: {
        brandName: entityName,
        score: 50,
        status: 'NEUTRAL',
        reportSummary: "Unable to establish secure connection to intelligence network.",
        socialSignal: "Signal lost.",
        keyConflicts: ["Data Unavailable"],
        keyAlignments: ["Data Unavailable"],
        reasoning: "Error",
        sources: []
      },
      metadata: {
        source: 'sense-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Generate a full entity report including related news
 */
export const generateEntityReport = async (
  entityName: string,
  userProfile: PoliticalCoordinates
): Promise<AgentResponse<EntityReport>> => {
  const startTime = Date.now();
  const opId = senseLogger.operationStart('generateEntityReport', { entityName });

  try {
    // Get entity type
    const entityType = await detectEntityType(entityName);
    senseLogger.info('generateEntityReport', `Entity type: ${entityType}`, { entityName, entityType });

    // Get alignment analysis
    const alignmentResult = await analyzeEntity(entityName, userProfile);

    if (!alignmentResult.success || !alignmentResult.data) {
      senseLogger.warn('generateEntityReport', `Alignment analysis failed for ${entityName}`);
      return {
        success: false,
        error: alignmentResult.error || 'Failed to analyze entity',
        metadata: {
          source: 'sense-agent',
          timestamp: new Date(),
          processingTime: Date.now() - startTime
        }
      };
    }

    // Get related news from cache
    const cachedNews = await getCachedNews(50);
    const relatedNews = cachedNews.filter(news => {
      const searchTerms = entityName.toLowerCase().split(' ');
      const newsText = `${news.title} ${news.summary}`.toLowerCase();
      return searchTerms.some(term => newsText.includes(term));
    }).slice(0, 5);

    senseLogger.info('generateEntityReport', `Found ${relatedNews.length} related news items`, {
      entityName,
      cachedNewsCount: cachedNews.length,
      relatedNewsCount: relatedNews.length
    });

    const report: EntityReport = {
      entityName,
      entityType,
      alignment: alignmentResult.data,
      recentNews: relatedNews,
      socialSignals: alignmentResult.data.socialSignal ? [alignmentResult.data.socialSignal] : [],
      lastUpdated: new Date()
    };

    senseLogger.operationSuccess(opId, 'generateEntityReport', {
      entityName,
      entityType,
      alignmentScore: alignmentResult.data.score,
      relatedNewsCount: relatedNews.length
    });

    return {
      success: true,
      data: report,
      metadata: {
        source: 'sense-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };

  } catch (error: any) {
    senseLogger.operationFailed(opId, 'generateEntityReport', error, { entityName });
    return {
      success: false,
      error: error.message,
      metadata: {
        source: 'sense-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Generate Prism Summary - multiple perspectives on a topic
 */
export const generatePrismSummary = async (
  topic: string
): Promise<AgentResponse<{ support: string; oppose: string; neutral: string }>> => {
  const startTime = Date.now();
  const opId = senseLogger.operationStart('generatePrismSummary', { topic });

  try {
    const prompt = `
      Provide a 'Prism Summary' for the topic: "${topic}".
      I need three distinct perspectives:
      1. Support/Proponent narrative.
      2. Oppose/Critic narrative.
      3. Neutral/Objective observer narrative.
      Keep each section under 40 words.
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        support: { type: Type.STRING },
        oppose: { type: Type.STRING },
        neutral: { type: Type.STRING }
      },
      required: ['support', 'oppose', 'neutral']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are an objective political analyst translating complex events into clear narratives."
      }
    });

    const result = JSON.parse(response.text || '{}');

    senseLogger.operationSuccess(opId, 'generatePrismSummary', {
      topic,
      hasSupport: !!result.support,
      hasOppose: !!result.oppose,
      hasNeutral: !!result.neutral
    });

    return {
      success: true,
      data: {
        support: result.support || "Data unavailable.",
        oppose: result.oppose || "Data unavailable.",
        neutral: result.neutral || "Data unavailable."
      },
      metadata: {
        source: 'sense-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };

  } catch (error: any) {
    senseLogger.operationFailed(opId, 'generatePrismSummary', error, { topic });
    return {
      success: false,
      error: error.message,
      data: {
        support: "Data unavailable.",
        oppose: "Data unavailable.",
        neutral: "Data unavailable."
      },
      metadata: {
        source: 'sense-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};
