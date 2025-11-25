/**
 * Stance Agent
 * Responsible for:
 * 1. Calculating political coordinates from onboarding answers
 * 2. Generating persona labels in multiple languages
 * 3. Translating persona labels
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PoliticalCoordinates, OnboardingAnswers } from '../../types';
import { StanceCalculationResponse, AgentResponse } from './types';
import { stanceLogger } from './logger';

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
 * Generate nationality prefix from birth country and current country
 * e.g., China + USA = "Chinese American"
 */
export const generateNationalityPrefix = async (
  birthCountry: string,
  currentCountry: string,
  language: string = 'en'
): Promise<string> => {
  const opId = stanceLogger.operationStart('generateNationalityPrefix', {
    birthCountry,
    currentCountry,
    language
  });

  try {
    // If same country, just use a simple demonym
    const isSameCountry = birthCountry.toLowerCase() === currentCountry.toLowerCase();

    const languageNames: Record<string, string> = {
      'en': 'English',
      'zh': 'Chinese (中文)',
      'ja': 'Japanese (日本語)',
      'fr': 'French (Français)',
      'es': 'Spanish (Español)'
    };
    const targetLang = languageNames[language] || 'English';

    const prompt = isSameCountry
      ? `
        Generate a nationality demonym for someone from "${birthCountry}" IN ${targetLang}.

        Examples:
        - USA → American (English), 美国人 (Chinese), アメリカ人 (Japanese)
        - China → Chinese (English), 中国人 (Chinese), 中国人 (Japanese)
        - France → French (English), 法国人 (Chinese), フランス人 (Japanese)

        Return ONLY the demonym word(s), nothing else.
      `
      : `
        Generate a hyphenated identity label for someone born in "${birthCountry}" now living in "${currentCountry}" IN ${targetLang}.

        Format: [Origin Adjective] [Current Demonym]

        Examples in English:
        - Born in China, living in USA → "Chinese American"
        - Born in Mexico, living in USA → "Mexican American"
        - Born in India, living in UK → "British Indian" or "Indian British"
        - Born in Vietnam, living in France → "Vietnamese French"
        - Born in Japan, living in USA → "Japanese American"

        Examples in Chinese (中文):
        - Born in China, living in USA → "华裔美国人"
        - Born in Mexico, living in USA → "墨西哥裔美国人"
        - Born in India, living in UK → "印度裔英国人"

        Examples in Japanese (日本語):
        - Born in China, living in USA → "中国系アメリカ人"
        - Born in Korea, living in Japan → "韓国系日本人"

        Return ONLY the identity label (2-3 words max), nothing else.
      `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const prefix = response.text?.trim() || '';

    stanceLogger.operationSuccess(opId, 'generateNationalityPrefix', {
      prefix,
      birthCountry,
      currentCountry,
      language
    });

    return prefix;

  } catch (error: any) {
    stanceLogger.operationFailed(opId, 'generateNationalityPrefix', error);
    // Fallback: simple concatenation
    return birthCountry === currentCountry ? currentCountry : `${birthCountry}-${currentCountry}`;
  }
};

/**
 * Calculate political coordinates from onboarding questionnaire
 * Now includes nationality prefix in the persona label
 */
export const calculateCoordinates = async (
  answers: OnboardingAnswers,
  language: string = 'en'
): Promise<AgentResponse<StanceCalculationResponse>> => {
  const startTime = Date.now();
  const opId = stanceLogger.operationStart('calculateCoordinates', {
    language,
    birthCountry: answers.demographics.birthCountry,
    currentCountry: answers.demographics.currentCountry,
    warStancesCount: answers.politicalPreferences.warStances.length,
    questionAnswersCount: answers.politicalPreferences.questionAnswers.length
  });

  try {
    // Step 1: Generate nationality prefix
    const nationalityPrefix = await generateNationalityPrefix(
      answers.demographics.birthCountry,
      answers.demographics.currentCountry,
      language
    );

    stanceLogger.debug('calculateCoordinates', `Generated nationality prefix: ${nationalityPrefix}`);

    const warStancesText = answers.politicalPreferences.warStances
      .map(w => `${w.warName}: Supports ${w.stance === 'SIDE_A' ? w.sideAName : w.stance === 'SIDE_B' ? w.sideBName : 'Neither (Neutral)'}`)
      .join('\n');

    const questionAnswersText = answers.politicalPreferences.questionAnswers
      .map(qa => {
        const answerMap: Record<string, string> = {
          'econ-1': `Healthcare: ${qa.answer === 'A' ? 'Government-funded universal' : qa.answer === 'B' ? 'Private market-based' : 'Neutral'}`,
          'econ-2': `Wealth inequality: ${qa.answer === 'A' ? 'Higher taxes, redistribution' : qa.answer === 'B' ? 'Lower taxes, free market' : 'Neutral'}`,
          'social-1': `Values: ${qa.answer === 'A' ? 'Preserve traditional' : qa.answer === 'B' ? 'Embrace progressive change' : 'Neutral'}`,
          'social-2': `Personal lifestyle: ${qa.answer === 'A' ? 'Government guidance' : qa.answer === 'B' ? 'Individual freedom' : 'Neutral'}`,
          'diplo-1': `Foreign policy: ${qa.answer === 'A' ? 'National interests first' : qa.answer === 'B' ? 'International cooperation' : 'Neutral'}`
        };
        return answerMap[qa.questionId] || `${qa.questionId}: ${qa.answer}`;
      })
      .join('\n');

    const languageInstructions: Record<string, string> = {
      'en': 'Generate a creative 2-3 word political persona type IN ENGLISH (e.g., "Progressive Globalist", "Traditional Libertarian", "Centrist Pragmatist", "Contrarian Socialist")',
      'zh': 'Generate a creative 2-3 word political persona type IN CHINESE/中文 (e.g., "进步全球主义者", "传统自由派", "务实中间派", "反传统社会主义者")',
      'ja': 'Generate a creative 2-3 word political persona type IN JAPANESE/日本語 (e.g., "進歩的グローバリスト", "伝統的リバタリアン", "現実主義中道派")',
      'fr': 'Generate a creative 2-3 word political persona type IN FRENCH/FRANÇAIS (e.g., "Progressiste Mondialiste", "Libéral Traditionnel", "Pragmatique Centriste")',
      'es': 'Generate a creative 2-3 word political persona type IN SPANISH/ESPAÑOL (e.g., "Progresista Globalista", "Liberal Tradicional", "Pragmático Centrista")'
    };

    const labelInstruction = languageInstructions[language] || languageInstructions['en'];

    // Step 2: Calculate coordinates and get persona TYPE (not full label)
    const prompt = `
      === POLITICAL PROFILE CALIBRATION ===

      Analyze this user's complete political profile and calculate precise political coordinates.

      ## SECTION 1: DEMOGRAPHICS
      - Birth Country: ${answers.demographics.birthCountry}
      - Current Location: ${answers.demographics.currentState}, ${answers.demographics.currentCountry}
      - Age: ${answers.demographics.age}

      ## SECTION 2: POLITICAL COMPASS QUESTIONNAIRE
      ${questionAnswersText}

      ## SECTION 3: INITIATIVE PREFERENCES
      - Initiative they MOST OPPOSE: "${answers.politicalPreferences.mostHatedInitiative}"
      - Initiative they MOST SUPPORT: "${answers.politicalPreferences.mostSupportedInitiative}"

      ## SECTION 4: GEOPOLITICAL CONFLICT POSITIONS
      ${warStancesText}

      ## CALCULATION INSTRUCTIONS
      Calculate three coordinates on a scale of -100 to 100:

      1. ECONOMIC AXIS (-100 to 100):
         - -100 = Full socialism, state ownership, wealth redistribution
         - 0 = Mixed economy, moderate regulation
         - +100 = Free market capitalism, minimal government intervention

      2. SOCIAL AXIS (-100 to 100):
         - -100 = Authoritarian, traditional values, strict social order
         - 0 = Balanced approach to tradition and progress
         - +100 = Libertarian, progressive values, maximum personal freedom

      3. DIPLOMATIC AXIS (-100 to 100):
         - -100 = Nationalist, isolationist, national sovereignty priority
         - 0 = Balanced foreign policy approach
         - +100 = Globalist, internationalist, multilateral cooperation

      ## OUTPUT REQUIREMENTS
      - ${labelInstruction}
      - IMPORTANT: The "personaType" should be ONLY the political ideology type (2-3 words), NOT including nationality
      - Be nuanced: consider ALL sections equally
      - Cross-reference questionnaire answers with stated initiative preferences for consistency
      - Factor in conflict stances for diplomatic calculation
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        economic: { type: Type.NUMBER },
        social: { type: Type.NUMBER },
        diplomatic: { type: Type.NUMBER },
        personaType: { type: Type.STRING },
        confidence: { type: Type.NUMBER }
      },
      required: ['economic', 'social', 'diplomatic', 'personaType']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are a political analyst. Be objective and nuanced in your assessment. Avoid extremes unless clearly warranted by the data."
      }
    });

    const result = JSON.parse(response.text || '{}');

    // Step 3: Combine nationality prefix with persona type
    const personaType = result.personaType || "Political Observer";
    const fullLabel = nationalityPrefix ? `${nationalityPrefix} ${personaType}` : personaType;

    stanceLogger.debug('calculateCoordinates', `Combined label: ${fullLabel}`, {
      nationalityPrefix,
      personaType,
      fullLabel
    });

    const coordinates: PoliticalCoordinates = {
      economic: Math.max(-100, Math.min(100, result.economic || 0)),
      social: Math.max(-100, Math.min(100, result.social || 0)),
      diplomatic: Math.max(-100, Math.min(100, result.diplomatic || 0)),
      label: fullLabel
    };

    stanceLogger.operationSuccess(opId, 'calculateCoordinates', {
      economic: coordinates.economic,
      social: coordinates.social,
      diplomatic: coordinates.diplomatic,
      label: coordinates.label,
      nationalityPrefix,
      personaType,
      confidence: result.confidence || 0.8
    });

    stanceLogger.summary('calculateCoordinates', {
      economic: coordinates.economic,
      social: coordinates.social,
      diplomatic: coordinates.diplomatic
    });

    return {
      success: true,
      data: {
        coordinates,
        confidence: result.confidence || 0.8
      },
      metadata: {
        source: 'stance-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };

  } catch (error: any) {
    stanceLogger.operationFailed(opId, 'calculateCoordinates', error);
    return {
      success: false,
      error: error.message,
      metadata: {
        source: 'stance-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Generate persona label from coordinates (deprecated - use translateFullPersonaLabel instead)
 */
export const generatePersonaLabel = async (
  coords: PoliticalCoordinates,
  language: string = 'en'
): Promise<AgentResponse<string>> => {
  const startTime = Date.now();
  const opId = stanceLogger.operationStart('generatePersonaLabel', {
    language,
    economic: coords.economic,
    social: coords.social,
    diplomatic: coords.diplomatic
  });

  try {
    const languageNames: Record<string, string> = {
      'en': 'English',
      'zh': 'Chinese (中文)',
      'ja': 'Japanese (日本語)',
      'fr': 'French (Français)',
      'es': 'Spanish (Español)'
    };

    const targetLang = languageNames[language] || 'English';

    const prompt = `
      Based on these political coordinates:
      - Economic: ${coords.economic} (-100 = Socialist, 100 = Capitalist)
      - Social: ${coords.social} (-100 = Authoritarian, 100 = Libertarian)
      - Diplomatic: ${coords.diplomatic} (-100 = Nationalist, 100 = Globalist)

      Generate a creative 2-4 word persona label IN ${targetLang}.

      Examples for different languages:
      - English: "Progressive Globalist", "Traditional Libertarian", "Centrist Pragmatist"
      - Chinese: "进步全球主义者", "传统自由派", "务实中间派"
      - Japanese: "進歩的グローバリスト", "伝統的リバタリアン"
      - French: "Progressiste Mondialiste", "Libéral Traditionnel"
      - Spanish: "Progresista Globalista", "Liberal Tradicional"

      Return ONLY the persona label, nothing else.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const label = response.text?.trim() || coords.label || "Political Observer";

    stanceLogger.operationSuccess(opId, 'generatePersonaLabel', {
      label,
      language
    });

    return {
      success: true,
      data: label,
      metadata: {
        source: 'stance-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };

  } catch (error: any) {
    stanceLogger.operationFailed(opId, 'generatePersonaLabel', error);
    return {
      success: false,
      error: error.message,
      data: coords.label || "Political Observer",
      metadata: {
        source: 'stance-agent',
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    };
  }
};

/**
 * Translate the full persona label (nationality + persona type) to target language
 * e.g., "Chinese American Progressive Globalist" → "华裔美国人 进步全球主义者"
 */
export const translateFullPersonaLabel = async (
  fullLabel: string,
  targetLanguage: string
): Promise<string> => {
  const opId = stanceLogger.operationStart('translateFullPersonaLabel', {
    fullLabel,
    targetLanguage
  });

  // If English, return original
  if (targetLanguage === 'en') {
    stanceLogger.info('translateFullPersonaLabel', `Using original English label: ${fullLabel}`);
    return fullLabel;
  }

  try {
    const languageNames: Record<string, string> = {
      'en': 'English',
      'zh': 'Chinese (中文)',
      'ja': 'Japanese (日本語)',
      'fr': 'French (Français)',
      'es': 'Spanish (Español)'
    };

    const targetLang = languageNames[targetLanguage] || 'English';

    const prompt = `
      Translate this complete persona identity label to ${targetLang}:
      "${fullLabel}"

      This label contains TWO parts:
      1. NATIONALITY/IDENTITY (e.g., "Chinese American", "Mexican American", "French")
      2. POLITICAL PERSONA TYPE (e.g., "Progressive Globalist", "Contrarian Socialist")

      Translate BOTH parts naturally into ${targetLang}.

      Examples:
      - "Chinese American Progressive Globalist" →
        - Chinese: "华裔美国人 进步全球主义者"
        - Japanese: "中国系アメリカ人 進歩的グローバリスト"
        - French: "Sino-Américain Progressiste Mondialiste"
        - Spanish: "Chino-Americano Progresista Globalista"

      - "Mexican American Contrarian Socialist" →
        - Chinese: "墨西哥裔美国人 反传统社会主义者"
        - Japanese: "メキシコ系アメリカ人 反骨的社会主義者"

      Return ONLY the translated label, nothing else.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const translatedLabel = response.text?.trim() || fullLabel;

    stanceLogger.operationSuccess(opId, 'translateFullPersonaLabel', {
      original: fullLabel,
      translated: translatedLabel,
      targetLanguage
    });

    return translatedLabel;

  } catch (error: any) {
    stanceLogger.operationFailed(opId, 'translateFullPersonaLabel', error);
    return fullLabel; // Fallback to original
  }
};

/**
 * Translate persona label to target language (legacy - delegates to translateFullPersonaLabel)
 */
export const translatePersonaLabel = async (
  coords: PoliticalCoordinates,
  targetLanguage: string
): Promise<string> => {
  stanceLogger.debug('translatePersonaLabel', `Translating label to ${targetLanguage}`, {
    originalLabel: coords.label,
    targetLanguage
  });

  // If English, return original
  if (targetLanguage === 'en' && coords.label) {
    stanceLogger.info('translatePersonaLabel', `Using original English label: ${coords.label}`);
    return coords.label;
  }

  // Use the new full persona label translation
  const translatedLabel = await translateFullPersonaLabel(coords.label || "Political Observer", targetLanguage);

  stanceLogger.info('translatePersonaLabel', `Translated label: ${translatedLabel}`, {
    from: coords.label,
    to: translatedLabel,
    targetLanguage
  });

  return translatedLabel;
};

/**
 * Recalibrate user's political coordinates based on entity feedback
 * This performs a minor adjustment to the user's stance based on their support/oppose
 * feedback for a specific entity (company, person, country, organization)
 */
export const recalibrateWithEntityFeedback = async (
  currentCoords: PoliticalCoordinates,
  entityName: string,
  stance: 'SUPPORT' | 'OPPOSE',
  reason?: string
): Promise<PoliticalCoordinates> => {
  const opId = stanceLogger.operationStart('recalibrateWithEntityFeedback', {
    entityName,
    stance,
    reason,
    currentCoords: {
      economic: currentCoords.economic,
      social: currentCoords.social,
      diplomatic: currentCoords.diplomatic
    }
  });

  try {
    const prompt = `
      === STANCE RECALIBRATION ANALYSIS ===

      A user with the following political coordinates has expressed their opinion about an entity.

      ## CURRENT USER COORDINATES
      - Economic: ${currentCoords.economic} (-100 = Socialist, 100 = Capitalist)
      - Social: ${currentCoords.social} (-100 = Authoritarian, 100 = Libertarian)
      - Diplomatic: ${currentCoords.diplomatic} (-100 = Nationalist, 100 = Globalist)
      - Current Label: ${currentCoords.label}

      ## USER FEEDBACK
      - Entity: "${entityName}"
      - User's Stance: ${stance}
      ${reason ? `- User's Reason: "${reason}"` : ''}

      ## YOUR TASK
      1. First, analyze what political positions are typically associated with ${stance === 'SUPPORT' ? 'supporting' : 'opposing'} "${entityName}"
      2. Determine if this feedback reveals any misalignment in the user's current coordinates
      3. Apply MINOR adjustments (max ±10 points per axis) to better reflect this new information
      4. The adjustment should be subtle - this is a calibration, not a complete recalculation
      5. Keep the persona label similar but you may slightly modify it if the stance significantly differs from expectations

      ## IMPORTANT RULES
      - Adjustments should be conservative (±5 to ±10 points max per axis)
      - If the user's feedback aligns with their current coordinates, minimal or no adjustment needed
      - Only adjust axes that are relevant to the entity and stance
      - Provide reasoning for any adjustments made
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        economic: { type: Type.NUMBER },
        social: { type: Type.NUMBER },
        diplomatic: { type: Type.NUMBER },
        label: { type: Type.STRING },
        adjustmentReasoning: { type: Type.STRING },
        economicDelta: { type: Type.NUMBER },
        socialDelta: { type: Type.NUMBER },
        diplomaticDelta: { type: Type.NUMBER }
      },
      required: ['economic', 'social', 'diplomatic', 'label', 'adjustmentReasoning']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are a political analyst performing stance calibration. Be conservative with adjustments - this is fine-tuning, not a complete recalculation. Most feedback should result in small (±5) or no adjustments."
      }
    });

    const result = JSON.parse(response.text || '{}');

    // Clamp values to valid range
    const newCoords: PoliticalCoordinates = {
      economic: Math.max(-100, Math.min(100, result.economic || currentCoords.economic)),
      social: Math.max(-100, Math.min(100, result.social || currentCoords.social)),
      diplomatic: Math.max(-100, Math.min(100, result.diplomatic || currentCoords.diplomatic)),
      label: result.label || currentCoords.label
    };

    stanceLogger.operationSuccess(opId, 'recalibrateWithEntityFeedback', {
      entityName,
      stance,
      previousCoords: {
        economic: currentCoords.economic,
        social: currentCoords.social,
        diplomatic: currentCoords.diplomatic
      },
      newCoords: {
        economic: newCoords.economic,
        social: newCoords.social,
        diplomatic: newCoords.diplomatic
      },
      deltas: {
        economic: result.economicDelta || newCoords.economic - currentCoords.economic,
        social: result.socialDelta || newCoords.social - currentCoords.social,
        diplomatic: result.diplomaticDelta || newCoords.diplomatic - currentCoords.diplomatic
      },
      reasoning: result.adjustmentReasoning
    });

    return newCoords;

  } catch (error: any) {
    stanceLogger.operationFailed(opId, 'recalibrateWithEntityFeedback', error);
    // Return original coordinates on failure
    return currentCoords;
  }
};
