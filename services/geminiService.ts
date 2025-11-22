
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BrandAlignment, PoliticalCoordinates, OnboardingAnswers, NewsEvent } from "../types";
import {
  getImageFromCache,
  saveImageToCache,
  createTitleHash,
  getNewsFromCache,
  saveNewsToCache,
  getRecentMixedNews,
  cleanStaleNewsImages,
  isStaleImageUrl
} from './newsCache';

// Get base URL for API proxy in production
const getBaseUrl = () => {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return `${window.location.origin}/api/gemini`;
};

// Initialize Gemini Client with proxy for production (CORS workaround)
const baseUrl = getBaseUrl();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: baseUrl ? { baseUrl } : undefined
});

/**
 * Curated high-quality Unsplash images by category
 * Using direct images.unsplash.com URLs (HTTP 200, not redirects)
 * Each category has multiple images for variety
 */
const CATEGORY_IMAGES: Record<string, string[]> = {
  'POLITICS': [
    'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=450&fit=crop', // Capitol building
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&h=450&fit=crop', // Government
    'https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=800&h=450&fit=crop', // Voting
    'https://images.unsplash.com/photo-1575320181282-9afab399332c?w=800&h=450&fit=crop', // Politics
    'https://images.unsplash.com/photo-1598885159329-9377168ac375?w=800&h=450&fit=crop', // Democracy
  ],
  'TECH': [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=450&fit=crop', // Circuit board
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=450&fit=crop', // Robot
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=450&fit=crop', // Cybersecurity
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=450&fit=crop', // Code matrix
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop', // Global tech
  ],
  'MILITARY': [
    'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?w=800&h=450&fit=crop', // Military
    'https://images.unsplash.com/photo-1580752300992-559f8e6a7b36?w=800&h=450&fit=crop', // Defense
    'https://images.unsplash.com/photo-1562564055-71e051d33c19?w=800&h=450&fit=crop', // Navy ship
    'https://images.unsplash.com/photo-1569242840510-9fe6f0112cee?w=800&h=450&fit=crop', // Aircraft
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=450&fit=crop', // Military tech
  ],
  'WORLD': [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop', // Earth from space
    'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&h=450&fit=crop', // World map
    'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&h=450&fit=crop', // Travel
    'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=450&fit=crop', // Diplomacy
    'https://images.unsplash.com/photo-1478860409698-8707f313ee8b?w=800&h=450&fit=crop', // Globe
  ],
  'BUSINESS': [
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=450&fit=crop', // Business charts
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=450&fit=crop', // Skyscraper
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=450&fit=crop', // Office
    'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&h=450&fit=crop', // Money
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=450&fit=crop', // Stock market
  ],
};

// Default fallback images (high quality general news images)
const DEFAULT_IMAGES = [
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop', // Newspaper
  'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&h=450&fit=crop', // News desk
  'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&h=450&fit=crop', // Breaking news
];

/**
 * Generate a news image using Gemini Imagen or fallback to curated Unsplash images
 */
const generateNewsImage = async (title: string, category: string): Promise<string | null> => {
  // Create a deterministic seed from the title for consistent image selection
  const titleHash = title.split('').reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  const seed = Math.abs(titleHash);

  // Try Gemini Imagen first (if available)
  try {
    const imagePrompt = `Professional news photograph for article: "${title}".
    Style: Editorial, photojournalistic, high contrast, cinematic lighting.
    Mood: Serious, informative, documentary style.
    Technical: 16:9 aspect ratio, high resolution, sharp focus.
    Do NOT include any text, watermarks, or logos.`;

    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: imagePrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '16:9',
      },
    });

    // Check if we got a valid image back
    if (response.generatedImages && response.generatedImages.length > 0) {
      const image = response.generatedImages[0];
      if (image.image?.imageBytes) {
        // Convert to data URL for immediate use
        const base64 = image.image.imageBytes;
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        console.log(`Generated AI image for "${title.slice(0, 30)}..."`);
        return dataUrl;
      }
    }
  } catch (error: any) {
    // Imagen not available or failed, fall back to Unsplash
    console.log(`Imagen unavailable for "${title.slice(0, 30)}...", using Unsplash fallback`);
  }

  // Fallback: Use curated Unsplash images
  const categoryImages = CATEGORY_IMAGES[category] || DEFAULT_IMAGES;
  const imageIndex = seed % categoryImages.length;
  const imageUrl = categoryImages[imageIndex];

  console.log(`Using Unsplash image for "${title.slice(0, 30)}..." category: ${category}`);
  return imageUrl;
};

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
 * Translate a persona label to the specified language.
 * Uses AI to generate a culturally appropriate translation of the persona.
 */
export const translatePersonaLabel = async (
  coords: PoliticalCoordinates,
  language: string = 'en'
): Promise<string> => {
  // If English, return the original label
  if (language === 'en' && coords.label) {
    return coords.label;
  }

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
      - Original persona label: "${coords.label || 'Political Observer'}"

      Generate a creative 2-4 word persona label IN ${targetLang}.
      The label should be a culturally appropriate translation/adaptation, NOT a literal translation.

      Examples for different languages:
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

    return response.text?.trim() || coords.label || "Political Observer";
  } catch (error) {
    console.error('Persona translation error:', error);
    return coords.label || "Political Observer";
  }
};

/**
 * Calculates political coordinates based on onboarding questionnaire answers.
 * Uses AI to analyze the user's background and political preferences.
 */
export const calculateCoordinatesFromOnboarding = async (
  answers: OnboardingAnswers,
  language: string = 'en' // Language code: 'en', 'zh', 'ja', 'fr', 'es'
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

    // Language-specific instructions for the persona label
    const languageInstructions: Record<string, string> = {
      'en': 'Generate a creative 2-4 word persona label IN ENGLISH (e.g., "Progressive Globalist", "Traditional Libertarian", "Centrist Pragmatist")',
      'zh': 'Generate a creative 2-4 word persona label IN CHINESE/中文 (e.g., "进步全球主义者", "传统自由派", "务实中间派")',
      'ja': 'Generate a creative 2-4 word persona label IN JAPANESE/日本語 (e.g., "進歩的グローバリスト", "伝統的リバタリアン", "現実主義中道派")',
      'fr': 'Generate a creative 2-4 word persona label IN FRENCH/FRANÇAIS (e.g., "Progressiste Mondialiste", "Libéral Traditionnel", "Pragmatique Centriste")',
      'es': 'Generate a creative 2-4 word persona label IN SPANISH/ESPAÑOL (e.g., "Progresista Globalista", "Liberal Tradicional", "Pragmático Centrista")'
    };

    const labelInstruction = languageInstructions[language] || languageInstructions['en'];

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
 * News and images are cached in Firestore for sharing across users.
 */
export const fetchPersonalizedNews = async (
  userProfile: PoliticalCoordinates,
  page: number = 0, // 0 = first 5, 1 = next 5
  categories: string[] = ['politics', 'technology', 'military', 'international', 'business']
): Promise<NewsEvent[]> => {
  try {
    // Fallback images based on category (using curated Unsplash images)
    const categoryImages: Record<string, string> = {
      'POLITICS': CATEGORY_IMAGES['POLITICS'][0],
      'TECH': CATEGORY_IMAGES['TECH'][0],
      'MILITARY': CATEGORY_IMAGES['MILITARY'][0],
      'WORLD': CATEGORY_IMAGES['WORLD'][0],
      'BUSINESS': CATEGORY_IMAGES['BUSINESS'][0]
    };

    // For page > 0, try to get some cached news from Firestore first
    // This allows different users to share the same news content
    if (page > 0) {
      try {
        const cachedNews = await getRecentMixedNews(5);
        if (cachedNews.length >= 3) {
          console.log(`Using ${cachedNews.length} cached news items from Firestore`);
          // Return cached news with proper image URLs
          return cachedNews.map(item => ({
            ...item,
            imageUrl: item.imageUrl || categoryImages[item.category] || DEFAULT_IMAGES[0]
          }));
        }
      } catch (cacheError) {
        console.warn('Failed to get cached news, generating fresh:', cacheError);
      }
    }

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

    // Process each news item: check cache, generate image if needed, save to Firestore
    const newsWithImages = await Promise.all(
      (result.news || []).map(async (item: any, index: number) => {
        const titleHash = createTitleHash(item.title);

        // Check if this exact news already exists in Firestore
        const cachedNews = await getNewsFromCache(titleHash);
        if (cachedNews) {
          console.log(`Found cached news: ${item.title.slice(0, 30)}...`);
          // Check if cached image URL is stale (bad URLs that don't work reliably)
          // Note: images.unsplash.com with direct photo IDs ARE good, keep them
          let imageUrl = cachedNews.imageUrl;
          if (isStaleImageUrl(imageUrl)) {
            // Regenerate image with Imagen or curated Unsplash
            const newImageUrl = await generateNewsImage(cachedNews.title, cachedNews.category);
            imageUrl = newImageUrl || categoryImages[cachedNews.category] || DEFAULT_IMAGES[0];
            // Update cache with new image
            await saveImageToCache(titleHash, imageUrl);
          }
          return {
            ...cachedNews,
            imageUrl: imageUrl || categoryImages[cachedNews.category] || DEFAULT_IMAGES[0]
          };
        }

        // News not in cache, need to create it with image
        let imageUrl = categoryImages[item.category] || DEFAULT_IMAGES[index % DEFAULT_IMAGES.length];

        // Try to get cached image first (might exist from similar title)
        const cachedImage = await getImageFromCache(titleHash);
        if (cachedImage) {
          imageUrl = cachedImage;
        } else {
          // Generate new image with Imagen
          try {
            const generatedImage = await generateNewsImage(item.title, item.category);
            if (generatedImage) {
              imageUrl = generatedImage;
              // Cache the generated image
              await saveImageToCache(titleHash, generatedImage);
            }
          } catch (imgError) {
            console.warn('Image generation failed, using fallback:', imgError);
          }
        }

        // Create the complete news object
        const newsItem: NewsEvent = {
          id: item.id || `news-${page}-${index}`,
          title: item.title,
          summary: item.summary,
          date: item.date,
          imageUrl,
          category: item.category
        };

        // Save to Firestore for future users
        try {
          await saveNewsToCache(newsItem);
          console.log(`Saved news to Firestore: ${item.title.slice(0, 30)}...`);
        } catch (saveError) {
          console.warn('Failed to save news to cache:', saveError);
        }

        return newsItem;
      })
    );

    return newsWithImages;

  } catch (error: any) {
    console.error("Gemini News Fetch Error:", error);
    throw new Error(`Failed to fetch news: ${error?.message || 'Unknown error'}`);
  }
};

/**
 * Trigger cleanup of stale news images in Firestore
 * This can be called manually or on app initialization
 */
export const triggerNewsImageCleanup = async (): Promise<{ cleaned: number; total: number }> => {
  console.log('Starting Firestore news image cleanup...');
  return cleanStaleNewsImages(generateNewsImage, DEFAULT_IMAGES[0]);
};
