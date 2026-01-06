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
  isStaleImageUrl,
  deleteAllNews
} from './newsCache';

// Import from new Agent architecture
import { getPersonalizedNewsFeed } from './agents';

// Feature flag: Use new agent architecture
const USE_AGENT_ARCHITECTURE = true;

// Get base URL for API proxy in production
const getBaseUrl = () => {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return `${window.location.origin}/api/gemini`;
};

// Initialize Gemini Client with proxy for production (CORS workaround)
const baseUrl = getBaseUrl();
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: baseUrl ? { baseUrl } : undefined
});

/**
 * Curated high-quality Unsplash images by category
 * Using direct images.unsplash.com URLs (HTTP 200, not redirects)
 * Each category has 10-15 images for maximum variety (60+ total)
 */
const CATEGORY_IMAGES: Record<string, string[]> = {
  'POLITICS': [
    'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=450&fit=crop', // Capitol building
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&h=450&fit=crop', // Government
    'https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=800&h=450&fit=crop', // Voting
    'https://images.unsplash.com/photo-1575320181282-9afab399332c?w=800&h=450&fit=crop', // Politics
    'https://images.unsplash.com/photo-1598885159329-9377168ac375?w=800&h=450&fit=crop', // Democracy
    'https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=800&h=450&fit=crop', // Protest
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=450&fit=crop', // Meeting
    'https://images.unsplash.com/photo-1577003833154-a4d9e5a8bdd1?w=800&h=450&fit=crop', // Congress
    'https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=800&h=450&fit=crop', // Rally
    'https://images.unsplash.com/photo-1569098644584-210bcd375b59?w=800&h=450&fit=crop', // Legislative
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&h=450&fit=crop', // White House
    'https://images.unsplash.com/photo-1593115057655-e2091616193a?w=800&h=450&fit=crop', // Elections
  ],
  'TECH': [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=450&fit=crop', // Circuit board
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=450&fit=crop', // Robot
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=450&fit=crop', // Cybersecurity
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=450&fit=crop', // Code matrix
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop', // Global tech
    'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800&h=450&fit=crop', // Laptop coding
    'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=800&h=450&fit=crop', // Coding
    'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&h=450&fit=crop', // AI Robot
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=450&fit=crop', // Data center
    'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?w=800&h=450&fit=crop', // Server room
    'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=800&h=450&fit=crop', // Tech devices
    'https://images.unsplash.com/photo-1535378620166-273708d44e4c?w=800&h=450&fit=crop', // Innovation
    'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&h=450&fit=crop', // Tech workspace
  ],
  'MILITARY': [
    'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?w=800&h=450&fit=crop', // Military
    'https://images.unsplash.com/photo-1580752300992-559f8e6a7b36?w=800&h=450&fit=crop', // Defense
    'https://images.unsplash.com/photo-1562564055-71e051d33c19?w=800&h=450&fit=crop', // Navy ship
    'https://images.unsplash.com/photo-1569242840510-9fe6f0112cee?w=800&h=450&fit=crop', // Aircraft
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=450&fit=crop', // Military tech
    'https://images.unsplash.com/photo-1571172965836-3619c8ad7565?w=800&h=450&fit=crop', // Soldiers
    'https://images.unsplash.com/photo-1577495508326-19a1b3cf65b7?w=800&h=450&fit=crop', // Jets
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&h=450&fit=crop', // Pentagon
    'https://images.unsplash.com/photo-1569083689865-f7e0d1d17043?w=800&h=450&fit=crop', // Naval fleet
    'https://images.unsplash.com/photo-1551076805-e1869033e561?w=800&h=450&fit=crop', // Helicopter
    'https://images.unsplash.com/photo-1607988795691-3d0147b43231?w=800&h=450&fit=crop', // Tank
    'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=450&fit=crop', // Drone
  ],
  'WORLD': [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop', // Earth from space
    'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&h=450&fit=crop', // World map
    'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&h=450&fit=crop', // Travel
    'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=450&fit=crop', // Diplomacy
    'https://images.unsplash.com/photo-1478860409698-8707f313ee8b?w=800&h=450&fit=crop', // Globe
    'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&h=450&fit=crop', // Flags
    'https://images.unsplash.com/photo-1569163139394-de4798aa62b6?w=800&h=450&fit=crop', // United Nations
    'https://images.unsplash.com/photo-1589519160732-57fc498494f8?w=800&h=450&fit=crop', // Airport
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=450&fit=crop', // Conference
    'https://images.unsplash.com/photo-1503149779833-1de50ebe5f8a?w=800&h=450&fit=crop', // International
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=450&fit=crop', // Summit
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop', // Cooperation
    'https://images.unsplash.com/photo-1464746133101-a2c3f88e0dd9?w=800&h=450&fit=crop', // Bridge
  ],
  'BUSINESS': [
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=450&fit=crop', // Business charts
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=450&fit=crop', // Skyscraper
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=450&fit=crop', // Office
    'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&h=450&fit=crop', // Money
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=450&fit=crop', // Stock market
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=450&fit=crop', // Analytics
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&h=450&fit=crop', // City business
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&h=450&fit=crop', // Corporate
    'https://images.unsplash.com/photo-1559526324-593bc073d938?w=800&h=450&fit=crop', // Handshake
    'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=800&h=450&fit=crop', // Wall Street
    'https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=800&h=450&fit=crop', // Finance
    'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&h=450&fit=crop', // Investment
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=450&fit=crop', // Market
  ],
};

// Default fallback images (high quality general news images)
const DEFAULT_IMAGES = [
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop', // Newspaper
  'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&h=450&fit=crop', // News desk
  'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&h=450&fit=crop', // Breaking news
  'https://images.unsplash.com/photo-1586339949216-35c2747cc36d?w=800&h=450&fit=crop', // Reporter
  'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=450&fit=crop', // Press
  'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=800&h=450&fit=crop', // Journalism
  'https://images.unsplash.com/photo-1508921340878-ba53e1f016ec?w=800&h=450&fit=crop', // Headlines
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=450&fit=crop', // Media
];

/**
 * Generate a news image using Gemini Imagen or fallback to curated Unsplash images
 */
export const generateNewsImage = async (title: string, category: string): Promise<string> => {
  // Create a deterministic seed from the title for consistent image selection
  const titleHash = title.split('').reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  const seed = Math.abs(titleHash);

  // Note: Imagen API is not available in browser environments
  // It requires server-side implementation with proper authentication and Vertex AI
  // For now, we use curated Unsplash images as the primary solution

  // TODO: To enable AI-generated images, implement a server-side endpoint:
  // POST /api/generate-news-image { title, category }
  // This endpoint should use Vertex AI or the Gemini API with proper credentials

  const ENABLE_IMAGEN = false;  // Disabled: Not available in browser

  if (ENABLE_IMAGEN) {
    try {
      const imagePrompt = `Professional news photograph for article: "${title}".
      Style: Editorial, photojournalistic, high contrast, cinematic lighting.
      Mood: Serious, informative, documentary style.
      Technical: 16:9 aspect ratio, high resolution, sharp focus.
      Do NOT include any text, watermarks, or logos.`;

      console.log(`[Imagen] Attempting to generate image for: "${title.slice(0, 50)}..."`);

      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',  // Updated to latest model
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9',
        }
      });

      // Check if we got a valid image back
      if (response?.generatedImages && response.generatedImages.length > 0) {
        const imageData = response.generatedImages[0];

        // The image data is in imageData.image.imageBytes (base64 encoded)
        if (imageData.image?.imageBytes) {
          const base64 = imageData.image.imageBytes;
          const dataUrl = `data:image/jpeg;base64,${base64}`;
          console.log(`[Imagen] ✓ Successfully generated AI image for "${title.slice(0, 30)}..."`);
          return dataUrl;
        }
      }

      console.log(`[Imagen] ✗ No valid image data returned`);
    } catch (error: any) {
      // Imagen not available or failed, fall back to Unsplash
      console.log(`[Imagen] ✗ Error: ${error.message || 'Unknown error'}`);
      console.log(`[Imagen] Falling back to Unsplash for "${title.slice(0, 30)}..."`);
    }
  }

  // Fallback: Use curated Unsplash images
  const categoryImages = CATEGORY_IMAGES[category] || DEFAULT_IMAGES;
  const imageIndex = seed % categoryImages.length;
  const imageUrl = categoryImages[imageIndex];

  console.log(`[Unsplash] Using category image for "${title.slice(0, 30)}..." category: ${category}`);
  return imageUrl;
};

/**
 * User demographics for country-aware analysis
 */
export interface UserDemographicsForAnalysis {
  birthCountry?: string;
  currentCountry?: string;
}

/**
 * Analyzes a brand OR individual against user values using Search Grounding.
 */
/**
 * Two-Step Hybrid Agentic AI Analysis System
 *
 * This function uses a two-step process to combine real-time search with structured analysis:
 *
 * **STEP 1: Google Search Grounding (Text Mode)**
 * - Uses Google Search tool to gather real-time intelligence
 * - Focuses on: recent news, CEO statements, political actions, controversies
 * - Returns unstructured text with grounding sources
 * - No JSON schema (incompatible with Search tool)
 *
 * **STEP 2: Structured Analysis (JSON Mode)**
 * - Takes real-time intelligence from Step 1 as input
 * - Combines with AI training data (Twitter/X, historical context)
 * - Uses user's three-axis coordinates for intelligent scoring
 * - Returns structured JSON output with all fields
 *
 * **Data Sources Combined:**
 * 1. Google Search (Real-time 2024-2025): Recent news, CEO statements, current actions
 * 2. AI Training Data (Pre-2025): Twitter/X analysis, historical patterns, industry context
 * 3. User Coordinates: Economic/Social/Diplomatic axes for 0-100 alignment scoring
 * 4. FEC Donations (Separate Firebase query): Real political contribution data
 *
 * @param entityName - Company, person, country, or organization name
 * @param userProfile - User's three-axis political coordinates
 * @param demographics - Optional geographic context (birth country, current residence)
 * @returns BrandAlignment with score, analysis, and real-time grounding sources
 */

/**
 * Get canonical entity name using AI
 * Normalizes entity names for consistent storage/lookup
 * "Huawei Technologies" → "huawei"
 */
export const getCanonicalEntityNameAI = async (entityName: string): Promise<string> => {
  try {
    // Two-step AI canonicalization for maximum consistency

    // Step 1: AI-guided suffix removal
    // Ask AI to identify and remove common legal/corporate suffixes
    const step1Prompt = `Remove ONLY legal and corporate suffixes from this entity name: "${entityName}"

Common suffixes to remove:
- Legal: Inc., Incorporated, Corp., Corporation, Ltd., Limited, LLC, PLC
- Corporate: Technologies, Technology, Tech, Systems, Solutions, Group, Holdings, Company, Co.
- Geographic: International, Intl.

Rules:
- Keep the core business/brand name
- Remove suffixes at the END only
- Lowercase the result
- Return ONLY the cleaned name

Examples:
"Cisco Systems" → "cisco"
"Huawei Technologies" → "huawei"
"Apple Inc." → "apple"
"Microsoft Corporation" → "microsoft"
"Cisco" → "cisco"

Entity: "${entityName}"
Cleaned:`;

    const step1Response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: step1Prompt
    });

    const step1Result = step1Response.text?.trim().toLowerCase() || entityName.toLowerCase();
    console.log(`🔤 Step 1 - Suffix removal: "${entityName}" → "${step1Result}"`);

    // Step 2: AI-guided final canonicalization
    // Further simplify complex multi-word names to core brand identifier
    const step2Prompt = `Simplify to the single core brand identifier: "${step1Result}"

Rules:
- Extract ONLY the essential brand name (usually 1 word, max 2)
- Remove any remaining descriptive/qualifier words
- Keep as-is if already a simple brand name
- Lowercase output

Examples:
"jp morgan chase" → "jpmorgan"
"bank of america" → "bankofamerica"
"cisco network" → "cisco"
"goldman sachs" → "goldmansachs"
"google" → "google"
"meta platforms" → "meta"

Entity: "${step1Result}"
Core brand:`;

    const step2Response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: step2Prompt
    });

    const finalResult = step2Response.text?.trim().toLowerCase() || step1Result;
    console.log(`🔤 Step 2 - Final canonicalization: "${step1Result}" → "${finalResult}"`);
    console.log(`🔤 Complete canonicalization: "${entityName}" → "${finalResult}"`);

    return finalResult;
  } catch (error) {
    console.warn('Canonicalization failed, using basic normalization:', error);
    // Fallback: basic regex-based normalization
    let fallback = entityName.toLowerCase().trim();
    fallback = fallback.replace(/\s+(technologies|technology|tech|systems|inc\.?|corp\.?|ltd\.?|llc|plc)\s*$/i, '');
    return fallback.trim();
  }
};

export const analyzeBrandAlignment = async (
  entityName: string,
  userProfile: PoliticalCoordinates,
  demographics?: UserDemographicsForAnalysis,
  userId?: string  // Optional: to check for explicit entity stance
): Promise<BrandAlignment> => {
  try {
    // Canonicalize entity name first for consistent lookup
    const canonicalName = await getCanonicalEntityNameAI(entityName);
    console.log(`🔤 Canonical lookup: "${entityName}" → "${canonicalName}"`);

    // Import getEntityStance dynamically to avoid circular dependency
    let entityStance: any = null;
    if (userId) {
      try {
        const { getEntityStance } = await import('../services/userService');
        // Use canonical name for lookup (matches what was saved)
        entityStance = await getEntityStance(userId, canonicalName);
        if (entityStance) {
          console.log(`📋 Found explicit entity stance: ${canonicalName} = ${entityStance.stance}`);
        }
      } catch (err) {
        console.warn('Failed to check entity stance:', err);
      }
    }

    // Detect entity type for better analysis
    const entityTypePrompt = `Classify "${entityName}" into one of: COMPANY, PERSON, COUNTRY, ORGANIZATION, POLITICAL_PARTY. Return only the category.`;
    const typeResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: entityTypePrompt,
    });
    const entityType = typeResponse.text?.trim().toUpperCase() || 'ORGANIZATION';

    // Build demographics context if available
    const demographicsContext = demographics?.birthCountry || demographics?.currentCountry
      ? `
      USER GEOGRAPHIC CONTEXT:
      ${demographics.birthCountry ? `- Birth Country: ${demographics.birthCountry}` : ''}
      ${demographics.currentCountry ? `- Current Residence: ${demographics.currentCountry}` : ''}
      ${demographics.birthCountry && demographics.currentCountry && demographics.birthCountry !== demographics.currentCountry
        ? `- Note: User is an immigrant/expatriate from ${demographics.birthCountry} living in ${demographics.currentCountry}. Consider both cultural perspectives.`
        : ''}
      `
      : '';

    const prompt = `
      === INTELLIGENCE REPORT: ${entityName.toUpperCase()} ===
      Entity Type: ${entityType}

      ANALYST PROFILE (User's Political Stance):
      - Economic Axis: ${userProfile.economic} (Scale: -100 Socialist ↔ +100 Capitalist)
      - Social Axis: ${userProfile.social} (Scale: -100 Authoritarian ↔ +100 Libertarian)
      - Diplomatic Axis: ${userProfile.diplomatic} (Scale: -100 Nationalist ↔ +100 Globalist)
      ${userProfile.label ? `- Persona: ${userProfile.label}` : ''}
      ${demographicsContext}

      MISSION BRIEF:
      Generate a comprehensive political alignment intelligence report on "${entityName}".
      ${demographicsContext ? `
      IMPORTANT: The user's geographic background significantly affects how they perceive this entity.
      For example:
      - A defense contractor like Lockheed Martin means something different to a US citizen vs a Chinese citizen
      - A tech company's data practices matter differently based on user's country of residence
      - Political figures are perceived very differently across nations
      Consider the user's birth country and current residence when analyzing alignment and providing the report.
      ` : ''}

      ANALYSIS REQUIREMENTS:
      1. BACKGROUND: Research the entity's known political activities, donations, lobbying, public statements, and corporate/organizational actions.

      2. SOCIAL SIGNAL ANALYSIS:
         - For PERSON: Analyze their known public rhetoric, Twitter/X presence, speeches, interviews
         - For COMPANY: Analyze corporate communications, CEO statements, brand positioning, controversies
         - For COUNTRY: Analyze government policies, international relations stance, human rights record
         - For ORGANIZATION: Analyze mission, advocacy positions, political affiliations

      3. ALIGNMENT CALCULATION:
         - Calculate how well this entity's known positions align with the user's political profile
         - Score 0-100 (0 = completely opposed, 50 = neutral, 100 = perfect alignment)
         - Status: MATCH (score >= 65), NEUTRAL (35-64), CONFLICT (< 35)

      4. FRICTION POINTS: Identify specific areas where the entity's positions conflict with user values

      5. RESONANCE POINTS: Identify specific areas of alignment with user values

      6. ALTERNATIVES: If score < 50, suggest 2 alternative entities with better alignment. Format: "EntityName (brief reason max 35 chars)"

      OUTPUT REQUIREMENTS:
      - reportSummary: 25-35 word executive summary of the entity's political profile
      - socialSignal: 20-25 word analysis of their public messaging and rhetoric patterns
      - keyConflicts: Array of 1-2 specific friction points (be specific, cite real positions/actions)
      - keyAlignments: Array of 1-2 specific resonance points (be specific, cite real positions/actions)
      - sourceMaterial: 50-80 word summary of relevant political context and risk factors
      - alternatives: Array of 2 strings in format "EntityName (brief reason)" where the reason in parentheses is MAX 35 characters
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        brandName: { type: Type.STRING },
        entityType: { type: Type.STRING },
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
        sourceMaterial: { type: Type.STRING },
      },
      required: ['brandName', 'score', 'status', 'reportSummary', 'socialSignal', 'keyConflicts', 'keyAlignments', 'sourceMaterial']
    };

    // STEP 1: Google Search call (no JSON schema) to gather real-time intelligence
    const searchPrompt = `Research "${entityName}" for recent political activity. Focus on:
    - Recent news about political actions, statements, or controversies
    - CEO/executive public statements on political issues (if company)
    - Recent donations, lobbying, or advocacy work
    - Current political positioning or shifts

    Provide a concise summary (150-200 words) with specific facts, dates, and sources.`;

    const searchResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],  // ✅ Google Search enabled (text mode)
      }
    });

    const realtimeIntelligence = searchResponse.text || '';

    // Extract real-time grounding sources from Google Search
    // Note: Vertex AI Search returns redirect URLs (vertexaisearch.cloud.google.com)
    // The actual domain is in web.title field
    const searchSources: Array<{ url: string; domain: string }> = [];
    const uniqueDomains = new Set<string>();

    if (searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      searchResponse.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.title && chunk.web?.uri) {
          const domain = chunk.web.title;

          // Only add unique domains (avoid duplicates like multiple Forbes or Q4CDN articles)
          if (!uniqueDomains.has(domain)) {
            uniqueDomains.add(domain);
            searchSources.push({
              url: chunk.web.uri, // Redirect URL that will go to actual article
              domain: domain // Display-friendly domain name
            });
          }
        }
      });
    }

    // STEP 2: Structured analysis call (with JSON schema) using gathered intelligence
    const analysisPrompt = `${prompt}

    REAL-TIME INTELLIGENCE GATHERED (from Google Search):
    ${realtimeIntelligence}

    DATA SOURCE LABELS:
    - Information from the "REAL-TIME INTELLIGENCE GATHERED" section above = Google Search (2024-2025)
    - Information from your training data (Twitter/X, historical context) = AI Training Data (pre-2025)
    - Combine both sources for comprehensive analysis
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: analysisPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: `You are an expert political intelligence analyst combining real-time search data with historical AI training data.
Your job is to provide objective, factual analysis of entities and their political alignment with user profiles.
Be specific and cite real-world actions, statements, donations, policies, and controversies.
Avoid generic statements - be concrete and informative.`
      }
    });

    const result = JSON.parse(response.text || '{}');

    // Combine real-time sources with static reference sources
    const staticSources: Array<{ url: string; domain: string }> = [];
    if (entityType === 'COMPANY') {
      staticSources.push({
        url: `https://www.opensecrets.org/orgs/search?q=${encodeURIComponent(entityName)}`,
        domain: 'opensecrets.org'
      });
    } else if (entityType === 'PERSON') {
      staticSources.push({
        url: `https://www.opensecrets.org/search?q=${encodeURIComponent(entityName)}`,
        domain: 'opensecrets.org'
      });
    }

    // Prioritize real-time search results (max 3), fallback to static sources
    const sources = searchSources.length > 0
      ? searchSources.slice(0, 3)  // Use real-time Google Search sources
      : staticSources.concat([{
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(entityName.replace(/ /g, '_'))}`,
          domain: 'wikipedia.org'
        }]).slice(0, 3);

    // Apply explicit entity stance penalty/bonus and integrate user feedback
    let finalScore = result.score || 50;
    let keyConflicts = result.keyConflicts || [];
    let keyAlignments = result.keyAlignments || [];

    if (entityStance) {
      if (entityStance.stance === 'OPPOSE') {
        // User explicitly opposes this entity - apply penalty
        const penalty = 25;  // Reduce score by 25 points
        finalScore = Math.max(0, finalScore - penalty);
        console.log(`⚠️ Applied OPPOSE penalty: ${result.score} → ${finalScore} (-${penalty})`);

        // Add user's opposition reason to Friction Points (prepend to show prominence)
        if (entityStance.reason) {
          const userFeedback = `User opposition: ${entityStance.reason}`;
          keyConflicts = [userFeedback, ...keyConflicts];
        }
      } else if (entityStance.stance === 'SUPPORT') {
        // User explicitly supports this entity - apply bonus
        const bonus = 15;  // Increase score by 15 points
        finalScore = Math.min(100, finalScore + bonus);
        console.log(`✅ Applied SUPPORT bonus: ${result.score} → ${finalScore} (+${bonus})`);

        // Add user's support reason to Resonance Points (prepend to show prominence)
        if (entityStance.reason) {
          const userFeedback = `User support: ${entityStance.reason}`;
          keyAlignments = [userFeedback, ...keyAlignments];
        }
      }
    }

    return {
      ...result,
      score: finalScore,  // Use adjusted score
      keyConflicts: keyConflicts,  // Include user feedback in conflicts
      keyAlignments: keyAlignments,  // Include user feedback in alignments
      brandName: result.brandName || entityName,
      reasoning: result.reportSummary,
      sources: sources
    };

  } catch (error) {
    console.error("Gemini Brand Analysis Error:", error);
    return {
      brandName: entityName,
      score: 50,
      status: 'NEUTRAL',
      reportSummary: "Unable to establish secure connection to intelligence network.",
      socialSignal: "Signal analysis unavailable.",
      keyConflicts: ["Data Unavailable"],
      keyAlignments: ["Data Unavailable"],
      reasoning: "Error",
      sources: [],
      sourceMaterial: "Intelligence gathering failed. Please try again."
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
 * Translate a full persona label (nationality + persona type) to the specified language.
 * e.g., "French American Nationalist Progressive" → "法裔美国人 民族主义进步派"
 */
export const translatePersonaLabel = async (
  coords: PoliticalCoordinates,
  language: string = 'en'
): Promise<string> => {
  const fullLabel = coords.label || 'Political Observer';
  // Normalize language code to lowercase
  const langCode = language.toLowerCase();

  console.log(`[translatePersonaLabel] Called with language: ${language} (normalized: ${langCode}), label: ${fullLabel}`);

  // If English, return the original label
  if (langCode === 'en') {
    console.log(`[translatePersonaLabel] English detected, returning original: ${fullLabel}`);
    return fullLabel;
  }

  try {
    console.log(`[translatePersonaLabel] Translating "${fullLabel}" to ${langCode}...`);
    const languageNames: Record<string, string> = {
      'en': 'English',
      'zh': 'Chinese (中文)',
      'ja': 'Japanese (日本語)',
      'fr': 'French (Français)',
      'es': 'Spanish (Español)'
    };

    const targetLang = languageNames[langCode] || 'English';
    console.log(`[translatePersonaLabel] Target language resolved to: ${targetLang}`);

    const prompt = `
      Translate this complete persona identity label to ${targetLang}:
      "${fullLabel}"

      This label contains TWO parts:
      1. NATIONALITY/IDENTITY prefix (e.g., "French American", "Chinese American", "Mexican American", "American")
      2. POLITICAL PERSONA TYPE (e.g., "Nationalist Progressive", "Progressive Globalist", "Contrarian Socialist")

      Translate BOTH parts naturally into ${targetLang}.

      Examples:
      - "French American Nationalist Progressive" →
        - Chinese: "法裔美国人 民族主义进步派"
        - Japanese: "フランス系アメリカ人 国家主義的進歩派"
        - French: "Franco-Américain Nationaliste Progressiste"
        - Spanish: "Franco-Americano Nacionalista Progresista"

      - "Chinese American Progressive Globalist" →
        - Chinese: "华裔美国人 进步全球主义者"
        - Japanese: "中国系アメリカ人 進歩的グローバリスト"
        - French: "Sino-Américain Progressiste Mondialiste"
        - Spanish: "Chino-Americano Progresista Globalista"

      - "American Traditional Libertarian" →
        - Chinese: "美国人 传统自由派"
        - Japanese: "アメリカ人 伝統的リバタリアン"
        - French: "Américain Libéral Traditionnel"
        - Spanish: "Americano Liberal Tradicional"

      Return ONLY the translated label, nothing else.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const translated = response.text?.trim() || fullLabel;
    console.log(`[translatePersonaLabel] Translation result: "${translated}"`);
    return translated;
  } catch (error) {
    console.error('[translatePersonaLabel] Translation error:', error);
    return fullLabel;
  }
};

/**
 * Generate nationality prefix from birth country and current country
 * e.g., China + USA = "Chinese American"
 */
const generateNationalityPrefixLocal = async (
  birthCountry: string,
  currentCountry: string,
  language: string = 'en'
): Promise<string> => {
  try {
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
      ? `Generate a nationality demonym for someone from "${birthCountry}" IN ${targetLang}. Examples: USA → American, China → Chinese. Return ONLY the demonym, nothing else.`
      : `Generate a hyphenated identity label for someone born in "${birthCountry}" now living in "${currentCountry}" IN ${targetLang}. Format: [Origin Adjective] [Current Demonym]. Examples: China+USA → "Chinese American", Mexico+USA → "Mexican American". Return ONLY the label (2-3 words), nothing else.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text?.trim() || '';
  } catch (error) {
    console.error('Error generating nationality prefix:', error);
    return birthCountry === currentCountry ? currentCountry : `${birthCountry}-${currentCountry}`;
  }
};

/**
 * Calculates political coordinates based on onboarding questionnaire answers.
 * Uses AI to analyze the user's background and political preferences.
 * Now includes nationality prefix in the persona label (e.g., "Chinese American Progressive Globalist")
 */
export const calculateCoordinatesFromOnboarding = async (
  answers: OnboardingAnswers,
  language: string = 'en' // Language code: 'en', 'zh', 'ja', 'fr', 'es'
): Promise<PoliticalCoordinates> => {
  try {
    // Step 1: Generate nationality prefix
    const nationalityPrefix = await generateNationalityPrefixLocal(
      answers.demographics.birthCountry,
      answers.demographics.currentCountry,
      language
    );
    console.log('Generated nationality prefix:', nationalityPrefix);

    const warStancesText = answers.politicalPreferences.warStances
      .map(w => `${w.warName}: Supports ${w.stance === 'SIDE_A' ? w.sideAName : w.stance === 'SIDE_B' ? w.sideBName : 'Neither (Neutral)'}`)
      .join('\n');

    // Format conflict stances (non-war geopolitical conflicts)
    const conflictStancesText = answers.politicalPreferences.conflictStances
      .map(c => `${c.conflictName}: ${c.stance === 'SUPPORT' ? 'Supports' : c.stance === 'OPPOSE' ? 'Opposes' : 'Neutral'}`)
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

    // Language-specific instructions for the persona TYPE (not full label - nationality is added separately)
    const languageInstructions: Record<string, string> = {
      'en': 'Generate a creative 2-3 word political persona TYPE IN ENGLISH (e.g., "Progressive Globalist", "Traditional Libertarian", "Centrist Pragmatist", "Contrarian Socialist")',
      'zh': 'Generate a creative 2-3 word political persona TYPE IN CHINESE/中文 (e.g., "进步全球���义者", "传统自由派", "务实中间派")',
      'ja': 'Generate a creative 2-3 word political persona TYPE IN JAPANESE/日本語 (e.g., "進歩的グローバリスト", "伝統的リバタリア���")',
      'fr': 'Generate a creative 2-3 word political persona TYPE IN FRENCH/FRANÇAIS (e.g., "Progressiste Mondialiste", "Libéral Traditionnel")',
      'es': 'Generate a creative 2-3 word political persona TYPE IN SPANISH/ESPAÑOL (e.g., "Progresista Globalista", "Liberal Tradicional")'
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

      ## SECTION 4: ARMED CONFLICT POSITIONS (Hot Wars)
      ${warStancesText}

      ## SECTION 5: GEOPOLITICAL DISPUTE POSITIONS (Non-War Conflicts)
      ${conflictStancesText}

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
      - Be nuanced: consider ALL sections (1-5) with equal weight when calculating coordinates
      - Cross-reference all data sources for internal consistency

      ## CRITICAL ANALYSIS GUIDELINES
      1. **Use ALL 5 sections** - every piece of data matters:
         - Demographics (Section 1) provide cultural and generational context
         - Political Compass questions (Section 2) establish baseline ideology
         - Initiative preferences (Section 3) reveal real-world policy priorities
         - Armed conflicts (Section 4) show views on military intervention and sovereignty
         - Geopolitical disputes (Section 5) are CRUCIAL for economic and diplomatic axes

      2. **Section 5 (Geopolitical Disputes) is especially important**:
         - Trade war stance (China/EU vs USA) directly impacts ECONOMIC axis
         - Taiwan sovereignty stance heavily influences DIPLOMATIC axis (nationalism vs internationalism)
         - Western decoupling stance affects both ECONOMIC (free trade vs protectionism) and DIPLOMATIC axes

      3. **Integration strategy**:
         - If Section 5 conflicts with Section 2, prioritize Section 5 (real-world positions > abstract questions)
         - Look for patterns across all sections to determine true ideological position
         - Use Sections 3, 4, and 5 to calibrate and refine the coordinates from Section 2

      4. **Coordinate calculation**:
         - ECONOMIC: Heavily weight Section 5 trade/decoupling stances + Section 2 economic questions
         - SOCIAL: Primarily Section 2 social questions + demographics context
         - DIPLOMATIC: Heavily weight Section 4 war stances + Section 5 Taiwan/decoupling + Section 2 diplomatic question
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        economic: { type: Type.NUMBER },
        social: { type: Type.NUMBER },
        diplomatic: { type: Type.NUMBER },
        personaType: { type: Type.STRING }
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

    // Step 2: Combine nationality prefix with persona type
    const personaType = result.personaType || "Political Observer";
    const fullLabel = nationalityPrefix ? `${nationalityPrefix} ${personaType}` : personaType;
    console.log('Combined persona label:', fullLabel);

    // Clamp values to valid range
    return {
      economic: Math.max(-100, Math.min(100, result.economic || 0)),
      social: Math.max(-100, Math.min(100, result.social || 0)),
      diplomatic: Math.max(-100, Math.min(100, result.diplomatic || 0)),
      label: fullLabel
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
 * Uses the new Agent architecture for real news from multiple sources.
 * Falls back to legacy generation if agents fail.
 */
export const fetchPersonalizedNews = async (
  userProfile: PoliticalCoordinates,
  page: number = 0,
  categories: string[] = ['politics', 'technology', 'military', 'international', 'business']
): Promise<NewsEvent[]> => {
  // Use new Agent architecture
  if (USE_AGENT_ARCHITECTURE) {
    try {
      console.log('Using Agent architecture for news fetching...');
      const forceRefresh = page === 0; // Only force refresh on first page
      const result = await getPersonalizedNewsFeed(userProfile, forceRefresh, 10);

      if (result.success && result.data && result.data.length > 0) {
        console.log(`Agent returned ${result.data.length} news items`);
        return result.data;
      } else {
        console.warn('Agent returned no data, falling back to legacy:', result.error);
      }
    } catch (agentError) {
      console.error('Agent architecture failed, falling back to legacy:', agentError);
    }
  }

  // Legacy fallback (original implementation)
  return fetchPersonalizedNewsLegacy(userProfile, page, categories);
};

/**
 * Legacy news fetching (AI-generated headlines)
 * Kept as fallback if agent architecture fails
 */
const fetchPersonalizedNewsLegacy = async (
  userProfile: PoliticalCoordinates,
  page: number = 0,
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
    if (page > 0) {
      try {
        const cachedNews = await getRecentMixedNews(5);
        if (cachedNews.length >= 3) {
          console.log(`Using ${cachedNews.length} cached news items from Firestore`);
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

    // Process each news item
    const newsWithImages = await Promise.all(
      (result.news || []).map(async (item: any, index: number) => {
        const titleHash = createTitleHash(item.title);

        // Check cache first
        const cachedNews = await getNewsFromCache(titleHash);
        if (cachedNews) {
          let imageUrl = cachedNews.imageUrl;
          if (isStaleImageUrl(imageUrl)) {
            const newImageUrl = await generateNewsImage(cachedNews.title, cachedNews.category);
            imageUrl = newImageUrl || categoryImages[cachedNews.category] || DEFAULT_IMAGES[0];
            await saveImageToCache(titleHash, imageUrl);
          }
          return {
            ...cachedNews,
            imageUrl: imageUrl || categoryImages[cachedNews.category] || DEFAULT_IMAGES[0]
          };
        }

        // Generate new news item
        let imageUrl = categoryImages[item.category] || DEFAULT_IMAGES[index % DEFAULT_IMAGES.length];
        const cachedImage = await getImageFromCache(titleHash);
        if (cachedImage) {
          imageUrl = cachedImage;
        } else {
          try {
            const generatedImage = await generateNewsImage(item.title, item.category);
            if (generatedImage) {
              imageUrl = generatedImage;
              await saveImageToCache(titleHash, generatedImage);
            }
          } catch (imgError) {
            console.warn('Image generation failed, using fallback:', imgError);
          }
        }

        const newsItem: NewsEvent = {
          id: item.id || `news-${page}-${index}`,
          title: item.title,
          summary: item.summary,
          date: item.date,
          imageUrl,
          category: item.category
        };

        try {
          await saveNewsToCache(newsItem);
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

/**
 * Clean all fake news from database and repopulate with real news
 * This deletes ALL news and fetches fresh real news from agents
 */
export const cleanAndRepopulateNews = async (
  userProfile: PoliticalCoordinates
): Promise<{ deleted: number; fetched: number }> => {
  console.log('=== CLEANING AND REPOPULATING NEWS ===');

  // Step 1: Delete all existing news
  console.log('Step 1: Deleting all existing news from database...');
  const deleteResult = await deleteAllNews();
  console.log(`Deleted ${deleteResult.deleted} fake news items`);

  // Step 2: Force fetch fresh real news using agent architecture
  console.log('Step 2: Fetching real news from agents (Google Search Grounding + 6park)...');
  try {
    const result = await getPersonalizedNewsFeed(userProfile, true, 15); // force refresh, get 15 items

    if (result.success && result.data) {
      console.log(`Successfully fetched ${result.data.length} real news items`);
      console.log('=== NEWS REPOPULATION COMPLETE ===');
      return { deleted: deleteResult.deleted, fetched: result.data.length };
    } else {
      console.error('Failed to fetch real news:', result.error);
      return { deleted: deleteResult.deleted, fetched: 0 };
    }
  } catch (error) {
    console.error('Error fetching real news:', error);
    return { deleted: deleteResult.deleted, fetched: 0 };
  }
};
