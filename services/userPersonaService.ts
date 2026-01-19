/**
 * User Persona Embedding Service
 *
 * Generates semantic embeddings from user onboarding data for personalized news recommendations.
 * Uses standardized 300-400 word descriptions converted to 768-dimensional embeddings.
 *
 * Architecture:
 * 1. Generate persona description from onboarding answers + political coordinates
 * 2. Convert description to embedding using text-embedding-004
 * 3. Store in Firestore with history tracking (main doc + history subcollection pattern)
 * 4. Use for news personalization (semantic similarity scoring)
 */

import { GoogleGenAI } from "@google/genai";
import { OnboardingAnswers, PoliticalCoordinates, POLITICAL_QUESTIONS, CURRENT_WARS, CURRENT_CONFLICTS } from '../types';
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

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

const COLLECTION_NAME = 'user_persona_embeddings';

/**
 * User Persona Embedding Document Structure
 * Follows company_esg_by_ticker pattern: main document + history subcollection
 */
export interface PersonaEmbeddingRecord {
  userId: string;

  // Multi-language persona descriptions (300-400 words each)
  descriptionEN: string;
  descriptionZH?: string;
  descriptionJA?: string;
  descriptionFR?: string;
  descriptionES?: string;

  // Multi-language embeddings (768 dimensions each, same model as news)
  embeddingEN: number[];
  embeddingZH?: number[];
  embeddingJA?: number[];
  embeddingFR?: number[];
  embeddingES?: number[];

  // Coordinates snapshot (at time of generation)
  coordinates: {
    economic: number;
    social: number;
    diplomatic: number;
    label: string;
    coreStanceType: string;  // One of 8 core types: progressive-globalist, etc.
  };

  // Metadata per language
  metadata: {
    generatedAt: string;          // ISO timestamp
    modelVersion: string;         // 'text-embedding-004'

    // English metadata
    descriptionWordCountEN: number;
    embeddingDimensionsEN: number;  // 768

    // Chinese metadata
    descriptionWordCountZH?: number;
    embeddingDimensionsZH?: number;

    // Japanese metadata
    descriptionWordCountJA?: number;
    embeddingDimensionsJA?: number;

    // French metadata
    descriptionWordCountFR?: number;
    embeddingDimensionsFR?: number;

    // Spanish metadata
    descriptionWordCountES?: number;
    embeddingDimensionsES?: number;

    nationalityPrefix?: string;   // e.g., "Chinese American"
  };

  // Version tracking
  version: string;  // e.g., '1.0'

  // Only in history documents
  action?: 'generated' | 'regenerated' | 'coordinates_updated';
  timestamp?: string;
}

/**
 * Interpret numeric coordinate value to semantic description
 */
const interpretCoordinate = (value: number, axis: 'economic' | 'social' | 'diplomatic'): string => {
  const interpretations = {
    economic: {
      ranges: [
        { min: -100, max: -50, text: 'strongly socialist, favoring government control of markets and wealth redistribution' },
        { min: -49, max: -20, text: 'moderately left-leaning, supporting mixed economy with strong regulation' },
        { min: -19, max: 19, text: 'economically centrist, balancing market forces with government intervention' },
        { min: 20, max: 49, text: 'moderately right-leaning, preferring free markets with limited regulation' },
        { min: 50, max: 100, text: 'strongly free-market capitalist, advocating minimal government economic intervention' }
      ]
    },
    social: {
      ranges: [
        { min: -100, max: -50, text: 'strongly authoritarian/conservative, prioritizing traditional values and social order' },
        { min: -49, max: -20, text: 'moderately conservative, balancing tradition with gradual social change' },
        { min: -19, max: 19, text: 'socially moderate, open to diverse viewpoints on social issues' },
        { min: 20, max: 49, text: 'moderately progressive, supporting social reforms and individual freedoms' },
        { min: 50, max: 100, text: 'strongly libertarian/progressive, championing maximum personal freedom and social change' }
      ]
    },
    diplomatic: {
      ranges: [
        { min: -100, max: -50, text: 'strongly nationalist/isolationist, prioritizing national sovereignty over international cooperation' },
        { min: -49, max: -20, text: 'moderately nationalist, balancing domestic interests with selective global engagement' },
        { min: -19, max: 19, text: 'diplomatically balanced, weighing national and international interests pragmatically' },
        { min: 20, max: 49, text: 'moderately globalist, supporting international cooperation while protecting national interests' },
        { min: 50, max: 100, text: 'strongly internationalist/globalist, championing multilateral institutions and global governance' }
      ]
    }
  };

  const axisRanges = interpretations[axis].ranges;
  for (const range of axisRanges) {
    if (value >= range.min && value <= range.max) {
      return range.text;
    }
  }
  return 'undefined orientation';
};

/**
 * Generate standardized 300-400 word persona description from onboarding data
 * Uses Gemini to create a rich, interpretive description following a standard template
 */
export const generatePersonaDescription = async (
  answers: OnboardingAnswers,
  coordinates: PoliticalCoordinates
): Promise<string> => {
  const { demographics, politicalPreferences } = answers;

  // Build structured data for AI to use
  const nationalityPrefix = coordinates.nationalityPrefix || 'American';
  const economicInterp = interpretCoordinate(coordinates.economic, 'economic');
  const socialInterp = interpretCoordinate(coordinates.social, 'social');
  const diplomaticInterp = interpretCoordinate(coordinates.diplomatic, 'diplomatic');

  // Map question IDs to full text
  const questionsText = politicalPreferences.questionAnswers.map(qa => {
    const q = POLITICAL_QUESTIONS.find(item => item.id === qa.questionId);
    if (!q) return null;
    const answer = qa.answer === 'A' ? q.optionA : qa.answer === 'B' ? q.optionB : 'Neutral/No opinion';
    return `Q: "${q.question}" | Answer: ${answer}`;
  }).filter(Boolean).join('\n');

  // Map war stances
  const warsText = politicalPreferences.warStances.map(ws => {
    const war = CURRENT_WARS.find(w => w.warId === ws.warId);
    if (!war) return null;
    const side = ws.stance === 'SIDE_A' ? ws.sideAName : ws.stance === 'SIDE_B' ? ws.sideBName : 'Neutral';
    return `${ws.warName}: Supports ${side}`;
  }).filter(Boolean).join('\n');

  // Map conflict stances
  const conflictsText = politicalPreferences.conflictStances.map(cs => {
    const conflict = CURRENT_CONFLICTS.find(c => c.conflictId === cs.conflictId);
    if (!conflict) return null;
    const position = cs.stance === 'SUPPORT' ? 'Supports' : cs.stance === 'OPPOSE' ? 'Opposes' : 'Neutral on';
    return `${cs.conflictName}: ${position}`;
  }).filter(Boolean).join('\n');

  // Generate description using Gemini with strict template
  const prompt = `Generate a standardized 300-400 word persona description for a news reader based on their political profile.

USER DATA:
- Identity: ${nationalityPrefix}, age ${demographics.age}
- Born in: ${demographics.birthCountry}
- Currently living in: ${demographics.currentState}, ${demographics.currentCountry}
- Political coordinates:
  * Economic: ${coordinates.economic} (${economicInterp})
  * Social: ${coordinates.social} (${socialInterp})
  * Diplomatic: ${coordinates.diplomatic} (${diplomaticInterp})
- Core stance type: ${coordinates.coreStanceType || 'centrist'}

POLITICAL QUESTIONS & ANSWERS:
${questionsText}

POLICY PRIORITIES:
- Most supported initiative: "${politicalPreferences.mostSupportedInitiative}"
- Most opposed initiative: "${politicalPreferences.mostHatedInitiative}"

WAR STANCES:
${warsText}

GEOPOLITICAL CONFLICT STANCES:
${conflictsText}

INSTRUCTIONS:
Write a 300-400 word persona description following this EXACT structure:

1. Identity & Demographics (50 words): Describe their cultural background, age group, and geographic context.

2. Political Philosophy (100 words): Interpret their economic, social, and diplomatic coordinates semantically (NOT just numbers). Explain what policies and values they likely support based on these positions.

3. Question Responses Analysis (80 words): Synthesize their answers to the 6 political questions, highlighting key ideological patterns and what they reveal about priorities.

4. Policy Priorities (40 words): Discuss their most supported and most opposed initiatives, and what these reveal about their core values and concerns.

5. Geopolitical Perspectives (80 words): Analyze their war and conflict stances together. What do these positions reveal about their foreign policy worldview and international alignment?

6. Overall Worldview (50 words): Conclude with their core stance type, synthesis of their political identity, and what news topics would likely interest them.

Requirements:
- Professional, neutral, analytical tone
- Use third person ("they", "their")
- Connect answers to broader political themes
- Exactly 300-400 words (count carefully)
- No bullet points, continuous prose

Generate the persona description now:`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const description = response.text?.trim() || '';
    const wordCount = description.split(' ').length;

    if (wordCount < 200 || wordCount > 500) {
      console.warn(`[PersonaService] ⚠️ Description word count out of range: ${wordCount} words`);
    }

    console.log(`[PersonaService] ✅ Generated description: ${wordCount} words`);
    return description;

  } catch (error: any) {
    console.error('[PersonaService] ❌ Description generation failed:', error.message);

    // Fallback: Use template-based description (simpler but guaranteed)
    console.log('[PersonaService] 🔄 Using fallback template description');
    return generateFallbackDescription(answers, coordinates);
  }
};

/**
 * Fallback description generator (when AI fails)
 */
const generateFallbackDescription = (
  answers: OnboardingAnswers,
  coordinates: PoliticalCoordinates
): string => {
  const { demographics, politicalPreferences } = answers;
  const nationalityPrefix = coordinates.nationalityPrefix || 'American';

  // Simple concatenation of all data
  const parts = [
    `This user is a ${nationalityPrefix} individual, age ${demographics.age}, born in ${demographics.birthCountry} and currently residing in ${demographics.currentState}, ${demographics.currentCountry}.`,

    `Politically, they are ${interpretCoordinate(coordinates.economic, 'economic')} (economic score: ${coordinates.economic}).`,
    `Socially, they are ${interpretCoordinate(coordinates.social, 'social')} (social score: ${coordinates.social}).`,
    `Diplomatically, they are ${interpretCoordinate(coordinates.diplomatic, 'diplomatic')} (diplomatic score: ${coordinates.diplomatic}).`,

    `This user most supports "${politicalPreferences.mostSupportedInitiative}" and most opposes "${politicalPreferences.mostHatedInitiative}".`,

    `Their stance on current conflicts: ${politicalPreferences.warStances.map(ws =>
      `${ws.warName} (${ws.stance === 'SIDE_A' ? ws.sideAName : ws.stance === 'SIDE_B' ? ws.sideBName : 'neutral'})`
    ).join(', ')}.`,

    `Overall, their worldview aligns with the "${coordinates.coreStanceType || 'centrist'}" stance type.`
  ];

  return parts.join(' ');
};

/**
 * Generate 768-dimensional embedding from persona description
 * Uses text-embedding-004 model (same as news embeddings)
 */
export const generatePersonaEmbedding = async (
  description: string,
  language: 'en' | 'zh' | 'ja' | 'fr' | 'es' = 'en'
): Promise<number[] | null> => {
  try {
    console.log(`[PersonaService] Generating ${language.toUpperCase()} embedding for description (${description.split(' ').length} words)...`);

    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: description,
    });

    if (response.embeddings && response.embeddings.length > 0) {
      const embedding = response.embeddings[0].values;
      if (embedding && embedding.length === 768) {
        console.log(`[PersonaService] ✅ Generated ${embedding.length}-dimensional ${language.toUpperCase()} embedding`);
        return embedding;
      } else {
        console.warn(`[PersonaService] ⚠️ Unexpected embedding dimensions: ${embedding?.length}`);
        return null;
      }
    }

    console.warn('[PersonaService] ⚠️ No embeddings returned from API');
    return null;
  } catch (error: any) {
    console.error('[PersonaService] ❌ Embedding generation failed:', error.message);
    return null;
  }
};

/**
 * Save persona embeddings (multi-language) to Firestore with history tracking
 * Pattern: Save to history first, then update main document (like company_esg_by_ticker)
 */
export const savePersonaEmbedding = async (
  userId: string,
  descriptions: {
    en: string;
    zh?: string;
    ja?: string;
    fr?: string;
    es?: string;
  },
  embeddings: {
    en: number[];
    zh?: number[];
    ja?: number[];
    fr?: number[];
    es?: number[];
  },
  coordinates: PoliticalCoordinates,
  action: 'generated' | 'regenerated' | 'coordinates_updated' = 'generated'
): Promise<void> => {
  try {
    // Generate timestamp for history document ID (format: YYYYmmdd_HHMMSS)
    const now = new Date();
    const timestamp_str = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];

    // Prepare persona data with all languages
    const personaData: PersonaEmbeddingRecord = {
      userId,
      descriptionEN: descriptions.en,
      descriptionZH: descriptions.zh,
      descriptionJA: descriptions.ja,
      descriptionFR: descriptions.fr,
      descriptionES: descriptions.es,
      embeddingEN: embeddings.en,
      embeddingZH: embeddings.zh,
      embeddingJA: embeddings.ja,
      embeddingFR: embeddings.fr,
      embeddingES: embeddings.es,
      coordinates: {
        economic: coordinates.economic,
        social: coordinates.social,
        diplomatic: coordinates.diplomatic,
        label: coordinates.label,
        coreStanceType: coordinates.coreStanceType || 'centrist'
      },
      metadata: {
        generatedAt: now.toISOString(),
        modelVersion: 'text-embedding-004',
        descriptionWordCountEN: descriptions.en.split(' ').length,
        embeddingDimensionsEN: embeddings.en.length,
        descriptionWordCountZH: descriptions.zh?.split('').length, // Chinese uses characters
        embeddingDimensionsZH: embeddings.zh?.length,
        descriptionWordCountJA: descriptions.ja?.split('').length, // Japanese uses characters
        embeddingDimensionsJA: embeddings.ja?.length,
        descriptionWordCountFR: descriptions.fr?.split(' ').length,
        embeddingDimensionsFR: embeddings.fr?.length,
        descriptionWordCountES: descriptions.es?.split(' ').length,
        embeddingDimensionsES: embeddings.es?.length,
        nationalityPrefix: coordinates.nationalityPrefix
      },
      version: '1.0'
    };

    // Step 1: Save to history subcollection first (snapshot)
    const historyRef = doc(db, COLLECTION_NAME, userId, 'history', timestamp_str);
    await setDoc(historyRef, {
      ...personaData,
      action,
      timestamp: now.toISOString()
    });
    console.log(`[PersonaService] ✅ Saved to history: ${COLLECTION_NAME}/${userId}/history/${timestamp_str}`);

    // Step 2: Update main document (merge: true to preserve other fields)
    const mainRef = doc(db, COLLECTION_NAME, userId);
    await setDoc(mainRef, personaData, { merge: true });
    console.log(`[PersonaService] ✅ Updated main document: ${COLLECTION_NAME}/${userId}`);

  } catch (error: any) {
    console.error(`[PersonaService] ❌ Failed to save persona embedding for ${userId}:`, error);
    throw error;
  }
};

/**
 * Get user's persona embedding from Firestore (main document)
 */
export const getPersonaEmbedding = async (
  userId: string
): Promise<PersonaEmbeddingRecord | null> => {
  try {
    const mainRef = doc(db, COLLECTION_NAME, userId);
    const docSnap = await getDoc(mainRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as PersonaEmbeddingRecord;
      console.log(`[PersonaService] ✅ Found persona embedding for user ${userId}`);
      return data;
    }

    console.log(`[PersonaService] ℹ️ No persona embedding found for user ${userId}`);
    return null;
  } catch (error: any) {
    console.error(`[PersonaService] ❌ Failed to get persona embedding for ${userId}:`, error);
    return null;
  }
};

/**
 * Get persona embedding history for debugging/auditing
 */
export const getPersonaEmbeddingHistory = async (
  userId: string,
  limitCount: number = 10
): Promise<PersonaEmbeddingRecord[]> => {
  try {
    const historyCollection = collection(db, COLLECTION_NAME, userId, 'history');
    const querySnapshot = await getDocs(historyCollection);

    const history: PersonaEmbeddingRecord[] = [];
    querySnapshot.forEach((doc) => {
      history.push(doc.data() as PersonaEmbeddingRecord);
    });

    // Sort by timestamp descending (most recent first)
    return history
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || a.metadata.generatedAt).getTime();
        const timeB = new Date(b.timestamp || b.metadata.generatedAt).getTime();
        return timeB - timeA;
      })
      .slice(0, limitCount);
  } catch (error: any) {
    console.error(`[PersonaService] ❌ Failed to get persona embedding history for ${userId}:`, error);
    return [];
  }
};

/**
 * Delete persona embedding (for cleanup/reset)
 * Note: History subcollection is NOT deleted (audit trail preserved)
 */
export const deletePersonaEmbedding = async (userId: string): Promise<void> => {
  try {
    const mainRef = doc(db, COLLECTION_NAME, userId);
    await setDoc(mainRef, { deleted: true, deletedAt: new Date().toISOString() }, { merge: true });
    console.log(`[PersonaService] ✅ Marked persona embedding as deleted for user ${userId}`);
  } catch (error: any) {
    console.error(`[PersonaService] ❌ Failed to delete persona embedding for ${userId}:`, error);
    throw error;
  }
};

/**
 * Check if persona embedding should be regenerated
 */
export const shouldRegeneratePersona = async (
  userId: string,
  currentCoordinates: PoliticalCoordinates
): Promise<boolean> => {
  const existing = await getPersonaEmbedding(userId);

  if (!existing) {
    console.log('[PersonaService] 🔄 No embedding exists, should generate');
    return true;
  }

  // Check if English embedding is missing or invalid
  if (!existing.embeddingEN || existing.embeddingEN.length !== 768) {
    console.log('[PersonaService] 🔄 English embedding missing or invalid dimensions, should regenerate');
    return true;
  }

  // Check if coordinates have changed significantly (any axis > 10 points)
  const coordsChanged =
    Math.abs(existing.coordinates.economic - currentCoordinates.economic) > 10 ||
    Math.abs(existing.coordinates.social - currentCoordinates.social) > 10 ||
    Math.abs(existing.coordinates.diplomatic - currentCoordinates.diplomatic) > 10;

  if (coordsChanged) {
    console.log('[PersonaService] 🔄 Coordinates changed significantly, should regenerate');
    return true;
  }

  console.log('[PersonaService] ✓ Existing embedding is valid and current');
  return false;
};

/**
 * Translate text using Gemini
 */
const translateText = async (text: string, targetLanguage: 'zh' | 'ja' | 'fr' | 'es'): Promise<string> => {
  const languageNames: Record<string, string> = {
    'zh': 'Simplified Chinese',
    'ja': 'Japanese',
    'fr': 'French',
    'es': 'Spanish'
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following English text to ${languageNames[targetLanguage]}. Maintain the same tone, structure, and meaning. Only return the translation:\n\n${text}`
    });

    return response.text?.trim() || text;
  } catch (error: any) {
    console.error(`[PersonaService] ❌ Translation to ${targetLanguage} failed:`, error.message);
    return text; // Return original if translation fails
  }
};

/**
 * Main function: Generate and save user persona embeddings (multi-language)
 * Called after onboarding completion (fire-and-forget)
 *
 * @param forceRegenerate - If true, regenerate even if coordinates haven't changed (for onboarding resubmission)
 */
export const generateAndSavePersonaEmbedding = async (
  userId: string,
  answers: OnboardingAnswers,
  coordinates: PoliticalCoordinates,
  maxRetries: number = 2,
  forceRegenerate: boolean = false
): Promise<PersonaEmbeddingRecord | null> => {
  let lastError: Error | null = null;

  // Check if regeneration is needed (skip check if forced)
  if (!forceRegenerate) {
    const shouldRegenerate = await shouldRegeneratePersona(userId, coordinates);
    if (!shouldRegenerate) {
      console.log('[PersonaService] ℹ️ Persona embedding is current, skipping regeneration');
      return await getPersonaEmbedding(userId);
    }
  } else {
    console.log('[PersonaService] 🔄 Force regenerate requested (onboarding resubmission)');
  }

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[PersonaService] 🔄 Generation attempt ${attempt + 1}/${maxRetries}...`);

      // Step 1: Generate English persona description
      const descriptionEN = await generatePersonaDescription(answers, coordinates);

      if (!descriptionEN || descriptionEN.split(' ').length < 200) {
        throw new Error(`Description too short: ${descriptionEN.split(' ').length} words`);
      }

      // Step 2: Generate English embedding
      const embeddingEN = await generatePersonaEmbedding(descriptionEN, 'en');

      if (!embeddingEN) {
        throw new Error('English embedding generation returned null');
      }

      if (embeddingEN.length !== 768) {
        throw new Error(`Invalid embedding dimensions: ${embeddingEN.length} (expected 768)`);
      }

      console.log('[PersonaService] ✅ English persona generated successfully');

      // Step 3: Generate other language versions in parallel
      console.log('[PersonaService] 🌐 Generating translations and embeddings for other languages...');

      const [descriptionZH, descriptionJA, descriptionFR, descriptionES] = await Promise.all([
        translateText(descriptionEN, 'zh'),
        translateText(descriptionEN, 'ja'),
        translateText(descriptionEN, 'fr'),
        translateText(descriptionEN, 'es')
      ]);

      // Step 4: Generate embeddings for all translated descriptions in parallel
      const [embeddingZH, embeddingJA, embeddingFR, embeddingES] = await Promise.all([
        generatePersonaEmbedding(descriptionZH, 'zh'),
        generatePersonaEmbedding(descriptionJA, 'ja'),
        generatePersonaEmbedding(descriptionFR, 'fr'),
        generatePersonaEmbedding(descriptionES, 'es')
      ]);

      console.log('[PersonaService] ✅ All language embeddings generated successfully');

      // Step 5: Save to Firestore with history
      const actionType = attempt > 0 ? 'regenerated' : 'generated';
      await savePersonaEmbedding(
        userId,
        {
          en: descriptionEN,
          zh: descriptionZH,
          ja: descriptionJA,
          fr: descriptionFR,
          es: descriptionES
        },
        {
          en: embeddingEN,
          zh: embeddingZH || undefined,
          ja: embeddingJA || undefined,
          fr: embeddingFR || undefined,
          es: embeddingES || undefined
        },
        coordinates,
        actionType
      );

      console.log(`[PersonaService] ✅ Multi-language persona embeddings generated successfully on attempt ${attempt + 1}`);

      // Return the generated record
      return {
        userId,
        descriptionEN,
        descriptionZH,
        descriptionJA,
        descriptionFR,
        descriptionES,
        embeddingEN,
        embeddingZH: embeddingZH || undefined,
        embeddingJA: embeddingJA || undefined,
        embeddingFR: embeddingFR || undefined,
        embeddingES: embeddingES || undefined,
        coordinates: {
          economic: coordinates.economic,
          social: coordinates.social,
          diplomatic: coordinates.diplomatic,
          label: coordinates.label,
          coreStanceType: coordinates.coreStanceType || 'centrist'
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          modelVersion: 'text-embedding-004',
          descriptionWordCountEN: descriptionEN.split(' ').length,
          embeddingDimensionsEN: embeddingEN.length,
          descriptionWordCountZH: descriptionZH.split('').length,
          embeddingDimensionsZH: embeddingZH?.length,
          descriptionWordCountJA: descriptionJA.split('').length,
          embeddingDimensionsJA: embeddingJA?.length,
          descriptionWordCountFR: descriptionFR.split(' ').length,
          embeddingDimensionsFR: embeddingFR?.length,
          descriptionWordCountES: descriptionES.split(' ').length,
          embeddingDimensionsES: embeddingES?.length,
          nationalityPrefix: coordinates.nationalityPrefix
        },
        version: '1.0'
      };

    } catch (error: any) {
      lastError = error;
      console.error(`[PersonaService] ⚠️ Attempt ${attempt + 1} failed:`, error.message);

      // Retry with exponential backoff (2s, 4s)
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`[PersonaService] ⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  console.error('[PersonaService] ❌ Failed to generate persona embedding after all retries:', lastError);
  return null;
};
