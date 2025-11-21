
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BrandAlignment, PoliticalCoordinates, OnboardingAnswers, NewsEvent } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * Analyzes a brand OR individual against user values using Search Grounding.
 */
export const analyzeBrandAlignment = async (
  entityName: string,
  userProfile: PoliticalCoordinates
): Promise<BrandAlignment> => {
  try {
    const prompt = `
      Conduct a deep-dive intelligence report on "${entityName}" (Company, Public Figure, or CEO).
      
      User Profile Context:
      - Economic: ${userProfile.economic} (-100 Socialist <-> 100 Capitalist)
      - Social: ${userProfile.social} (-100 Authoritarian <-> 100 Libertarian)
      - Diplomatic: ${userProfile.diplomatic} (-100 Nationalist <-> 100 Globalist)

      Objectives:
      1. Analyze recent news, donations, and corporate actions.
      2. **CRITICAL**: Analyze recent public statements, tweets, and rhetoric on X (formerly Twitter). Summarize the "Social Signal".
      3. Determine alignment score (0-100).
      
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
    
    // Extract sources from grounding chunks
    const sources: string[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          sources.push(chunk.web.uri);
        }
      });
    }

    return {
      ...result,
      reasoning: result.reportSummary, // Fallback
      sources: sources.slice(0, 3) // Top 3 sources
    };

  } catch (error) {
    console.error("Gemini Brand Analysis Error:", error);
    // Fallback mock for demo purposes if API fails or key missing
    return {
      brandName: entityName,
      score: 50,
      status: 'NEUTRAL',
      reportSummary: "Unable to establish secure connection to intelligence network.",
      socialSignal: "Signal lost.",
      keyConflicts: ["Data Unavailable"],
      keyAlignments: ["Data Unavailable"],
      reasoning: "Error",
      sources: []
    };
  }
};

/**
 * Generates a "Prism Summary" for a news topic using Gemini Pro (for deeper reasoning).
 */
export const generatePrismSummary = async (topic: string) => {
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
            model: 'gemini-2.5-flash', // Flash is sufficient and faster
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                systemInstruction: "You are an objective political analyst translating complex events into clear narratives."
            }
        });
        
        return JSON.parse(response.text || '{}');
    } catch (error) {
        console.error("Gemini Prism Error:", error);
        return {
            support: "Data unavailable.",
            oppose: "Data unavailable.",
            neutral: "Data unavailable."
        };
    }
};

/**
 * Updates the political fingerprint based on a user action/swipe.
 * In a real app, this would likely be a heavier calculation.
 */
export const calculatePersona = async (coords: PoliticalCoordinates): Promise<string> => {
    try {
        const prompt = `
            Based on these coordinates:
            Economic: ${coords.economic} (-100 Socialist, 100 Capitalist)
            Social: ${coords.social} (-100 Auth, 100 Lib)
            Diplomatic: ${coords.diplomatic} (-100 National, 100 Global)

            Give me a 3-5 word creative political persona label. E.g., "Pragmatic Globalist", "Eco-Conservative".
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text?.trim() || "Undefined Observer";
    } catch (e) {
        return "Anonymous User";
    }
};

/**
 * Calculates political coordinates based on onboarding questionnaire answers.
 * Uses AI to analyze the user's background and political preferences.
 */
export const calculateCoordinatesFromOnboarding = async (
  answers: OnboardingAnswers
): Promise<PoliticalCoordinates> => {
  try {
    const warStancesText = answers.politicalPreferences.warStances
      .map(w => `${w.warName}: Supports ${w.stance === 'SIDE_A' ? w.sideAName : w.stance === 'SIDE_B' ? w.sideBName : 'Neither (Neutral)'}`)
      .join('\n');

    // Format political question answers
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
      - Generate a creative 2-4 word persona label (e.g., "Progressive Globalist", "Traditional Libertarian", "Centrist Pragmatist")
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
        label: { type: Type.STRING }
      },
      required: ['economic', 'social', 'diplomatic', 'label']
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

    // Clamp values to valid range
    return {
      economic: Math.max(-100, Math.min(100, result.economic || 0)),
      social: Math.max(-100, Math.min(100, result.social || 0)),
      diplomatic: Math.max(-100, Math.min(100, result.diplomatic || 0)),
      label: result.label || "Political Observer"
    };

  } catch (error: any) {
    console.error("Gemini Onboarding Calculation Error:", error);
    console.error("Error details:", error?.message, error?.stack);
    // Throw error to show alert to user instead of silent fallback
    throw new Error(`AI calibration failed: ${error?.message || 'Unknown error'}`);
  }
};

/**
 * Fetches personalized news based on user's political stance.
 * Returns news topics relevant to the user's political profile across categories.
 */
export const fetchPersonalizedNews = async (
  userProfile: PoliticalCoordinates,
  page: number = 0, // 0 = first 5, 1 = next 5
  categories: string[] = ['politics', 'technology', 'military', 'international', 'business']
): Promise<NewsEvent[]> => {
  try {
    // Build search context based on user's political stance
    const stanceContext = `
      User Political Profile:
      - Economic: ${userProfile.economic} (${userProfile.economic < 0 ? 'Left-leaning/Progressive economics' : 'Right-leaning/Free market'})
      - Social: ${userProfile.social} (${userProfile.social < 0 ? 'Traditional/Conservative' : 'Progressive/Liberal'})
      - Diplomatic: ${userProfile.diplomatic} (${userProfile.diplomatic < 0 ? 'Nationalist/Isolationist' : 'Globalist/Internationalist'})
      - Persona: ${userProfile.label}
    `;

    const prompt = `
      ${stanceContext}

      Generate ${5} current news topics/headlines that would be HIGHLY RELEVANT and INTERESTING to someone with this political profile.

      Categories to cover: ${categories.join(', ')}

      Requirements:
      1. Topics should reflect REAL current events and issues (November 2024 - present)
      2. Include topics that align with AND challenge their worldview for balanced awareness
      3. Cover diverse categories
      4. Be specific and timely (not generic evergreen topics)

      Set index: ${page} (generate different topics for each page)

      For each news item, provide:
      - id: unique identifier (use format "news-${page}-{index}")
      - title: A realistic news headline (max 80 chars)
      - summary: Brief description (max 150 chars)
      - date: Relative date (TODAY, YESTERDAY, 2 DAYS AGO, 3 DAYS AGO, THIS WEEK)
      - category: One of (POLITICS, TECH, MILITARY, WORLD, BUSINESS)
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        news: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              date: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ['id', 'title', 'summary', 'date', 'category']
          }
        }
      },
      required: ['news']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are a political news curator. Generate realistic, timely news headlines based on current events. Be objective but personalized to user interests. Focus on real-world issues from late 2024 to present."
      }
    });

    const result = JSON.parse(response.text || '{"news": []}');

    // Transform to NewsEvent format with placeholder images based on category
    const categoryImages: Record<string, string> = {
      'POLITICS': 'https://picsum.photos/seed/politics/400/200?grayscale',
      'TECH': 'https://picsum.photos/seed/tech/400/200?grayscale',
      'MILITARY': 'https://picsum.photos/seed/military/400/200?grayscale',
      'WORLD': 'https://picsum.photos/seed/world/400/200?grayscale',
      'BUSINESS': 'https://picsum.photos/seed/business/400/200?grayscale'
    };

    return (result.news || []).map((item: any, index: number) => ({
      id: item.id || `news-${page}-${index}`,
      title: item.title,
      summary: item.summary,
      date: item.date,
      imageUrl: categoryImages[item.category] || `https://picsum.photos/seed/${item.id}/400/200?grayscale`,
      category: item.category
    }));

  } catch (error: any) {
    console.error("Gemini News Fetch Error:", error);
    throw new Error(`Failed to fetch news: ${error?.message || 'Unknown error'}`);
  }
};
