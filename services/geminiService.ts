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
 * AI-Generated news images using Gemini Imagen 4
 * Generated with photorealistic editorial news photography requirements
 * Total: 129 images (18-24 per category) - replacing all Unsplash stock photos
 */
const CATEGORY_IMAGES: Record<string, string[]> = {
  'POLITICS': [
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/american_democracy_1768458402889.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/campaign_trail_1768458233204.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/capitol_building_1768458146027.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/congress_session_1768458200694.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/election_night_1768458292061.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/legislative_vote_1768458335011.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/midterm_election_1768458166931.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/political_debate_stage_1768458381705.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/political_protest_1768458281041.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/political_rally_1768458187944.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/presidential_debate_1768457515549.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/senate_chamber_1768458261787.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/state_capitol_1768458302052.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/supreme_court_1768458212298.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/town_hall_1768458313590.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/voter_registration_1768458392095.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/voting_booth_1768458177606.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/white_house_1768458155947.jpg',
  ],
  'TECH': [
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/artificial_intelligence_1768458433030.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/cloud_computing_1768458512391.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/coding_programming_1768458466753.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/cryptocurrency_1768458523694.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/cybersecurity_1768458444141.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/data_center_1768458423076.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/digital_transformation_1768458683496.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/electric_vehicles_1768458582884.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/innovation_lab_1768458661503.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/internet_infrastructure_1768458614865.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/quantum_computing_1768458492002.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/robotics_1768458535054.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/semiconductor_chips_1768458571140.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/silicon_valley_1768458413546.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/smartphone_1768458455821.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/social_media_1768458502921.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/software_development_1768458638877.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/space_technology_1768458593016.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/tech_acquisition_1768458626328.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/tech_conference_1768458479352.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/tech_ipo_1768458671840.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/tech_privacy_1768458650100.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/tech_startup_1768458560697.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/TECH/virtual_reality_1768458548517.jpg',
  ],
  'MILITARY': [
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/air_force_base_1768458900247.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/aircraft_carrier_1768458693480.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/army_tanks_1768458807139.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/cyber_warfare_1768458942966.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/defense_budget_1768458757248.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/defense_contractor_1768458920248.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/fighter_jets_1768458704082.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_alliance_1768458955194.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_base_1768458714030.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_deployment_1768458931463.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_drone_1768458785620.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_helicopter_1768458819186.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_parade_1768458857269.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_technology_1768458877715.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/military_training_1768458746233.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/naval_base_1768458886977.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/naval_fleet_1768458723714.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/nuclear_weapons_1768458966364.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/pentagon_1768458734703.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/special_forces_1768458831166.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/submarine_1768458795836.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/veterans_1768458772365.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/MILITARY/war_room_1768458868015.jpg',
  ],
  'WORLD': [
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/border_crossing_1768459146349.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/climate_change_1768459054178.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/cultural_exchange_1768459242996.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/diplomatic_meeting_1768459093226.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/foreign_embassy_1768459007709.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/global_cooperation_1768459255746.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/global_economy_1768459125279.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/global_migration_1768459220298.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/global_pandemic_1768459077216.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/global_poverty_1768459186785.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/international_aid_1768459114120.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/international_airport_1768458998075.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/international_law_1768459175981.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/international_trade_1768459030466.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/refugee_crisis_1768459043251.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/united_nations_1768458977584.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/world_currency_1768459160133.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/world_health_1768459231293.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/world_heritage_1768459102106.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/world_map_1768459018951.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/WORLD/world_politics_1768459198503.jpg',
  ],
  'BUSINESS': [
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/business_analytics_1768459410567.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/business_bankruptcy_1768459465150.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/business_contract_1768459500769.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/business_expansion_1768459522691.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/business_handshake_1768459375330.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/business_meeting_1768459299890.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/corporate_headquarters_1768459288576.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/corporate_profits_1768459543135.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/earnings_report_1768459333540.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/economic_recession_1768459533439.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/financial_charts_1768459321263.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/ipo_launch_1768459359814.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/manufacturing_plant_1768459444101.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/market_volatility_1768459511409.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/merger_acquisition_1768459344144.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/retail_stores_1768459433107.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/skyscraper_1768459388856.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/startup_office_1768459311215.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/stock_market_1768459267312.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/supply_chain_1768459454471.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/trading_floor_1768459398635.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/venture_capital_1768459478541.jpg',
    'https://storage.googleapis.com/stanse-public-assets/news_images/BUSINESS/wall_street_1768459277552.jpg',
  ],
};

// Default fallback images (AI-generated news journalism images)
const DEFAULT_IMAGES = [
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/breaking_news_1768459552717.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/fact_checking_1768459693175.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/headline_news_1768459616305.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/investigative_journalism_1768459736042.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/journalism_1768459582106.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/live_reporting_1768459803244.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/media_bias_1768459778545.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/media_interview_1768459662131.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_alert_1768459702922.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_anchor_1768459573141.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_deadline_1768459672575.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_ethics_1768459814811.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_studio_1768459627710.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_subscription_1768459789696.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_van_1768459651403.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/news_website_1768459724912.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/newspaper_print_1768459562073.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/press_badge_1768459755450.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/press_freedom_1768459594284.jpg',
  'https://storage.googleapis.com/stanse-public-assets/news_images/DEFAULT/reporter_microphone_1768459640341.jpg',
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
export const generatePrismSummary = async (topic: string, language: string = 'en') => {
    try {
        // Language-specific prompts
        const languagePrompts: Record<string, string> = {
            en: `Provide a 'Prism Summary' for the topic: "${topic}".
                 I need three distinct perspectives:
                 1. Support/Proponent narrative.
                 2. Oppose/Critic narrative.
                 3. Neutral/Objective observer narrative.
                 Keep each section under 40 words.
                 **Respond in English.**`,

            zh: `为以下主题提供"棱镜摘要"："${topic}"。
                 我需要三个不同的视角：
                 1. 支持/赞成者叙述
                 2. 反对/批评者叙述
                 3. 中立/客观观察者叙述
                 每部分保持在50字以内。
                 **请用中文回答。**`,

            ja: `次のトピックについて「プリズムサマリー」を提供してください："${topic}"。
                 3つの異なる視点が必要です：
                 1. 支持/賛成派の物語
                 2. 反対/批判派の物語
                 3. 中立/客観的観察者の物語
                 各セクションは50文字以内にしてください。
                 **日本語で回答してください。**`,

            fr: `Fournissez un "Résumé Prisme" pour le sujet : "${topic}".
                 J'ai besoin de trois perspectives distinctes :
                 1. Récit des partisans/promoteurs.
                 2. Récit des opposants/critiques.
                 3. Récit neutre/observateur objectif.
                 Limitez chaque section à 40 mots.
                 **Répondez en français.**`,

            es: `Proporcione un "Resumen Prisma" para el tema: "${topic}".
                 Necesito tres perspectivas distintas:
                 1. Narrativa de apoyo/proponentes.
                 2. Narrativa de oposición/críticos.
                 3. Narrativa neutral/observador objetivo.
                 Mantenga cada sección en menos de 40 palabras.
                 **Responda en español.**`
        };

        const prompt = languagePrompts[language.toLowerCase()] || languagePrompts['en'];

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
    const economic = Math.max(-100, Math.min(100, result.economic || 0));
    const social = Math.max(-100, Math.min(100, result.social || 0));
    const diplomatic = Math.max(-100, Math.min(100, result.diplomatic || 0));

    // Calculate coreStanceType using the same logic as stanceAgent
    // Import dynamically to avoid circular dependency
    const { getStanceType } = await import('../data/sp500Companies');
    const coreStanceType = getStanceType(economic, social, diplomatic);
    console.log('Calculated coreStanceType:', coreStanceType);

    return {
      economic,
      social,
      diplomatic,
      label: fullLabel,
      displayLabel: fullLabel,  // Same as label for consistency with existing users
      coreStanceType: coreStanceType,  // Canonical stance type for company rankings
      nationalityPrefix: nationalityPrefix || undefined  // Preserve nationality prefix for future use
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
  categories: string[] = ['politics', 'technology', 'military', 'international', 'business'],
  language: string = 'en',
  userId?: string
): Promise<NewsEvent[]> => {
  // Use new Agent architecture
  if (USE_AGENT_ARCHITECTURE) {
    try {
      console.log(`Using Agent architecture for news fetching (${language})...`);
      const forceRefresh = page === 0; // Only force refresh on first page
      const result = await getPersonalizedNewsFeed(userProfile, forceRefresh, 10, language, userId);

      if (result.success && result.data && result.data.length > 0) {
        console.log(`Agent returned ${result.data.length} news items`);
        return result.data;
      } else {
        console.warn('Agent returned no data:', result.error);
        // Don't generate fake news - return empty array
        return [];
      }
    } catch (agentError) {
      console.error('Agent architecture failed:', agentError);
      // Don't generate fake news - return empty array
      return [];
    }
  }

  // DEPRECATED: Legacy fake news generation disabled
  // Only use cached news or real news from agents
  console.warn('No real news available, returning empty array');
  return [];
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
  userProfile: PoliticalCoordinates,
  language: string = 'en'
): Promise<{ deleted: number; fetched: number }> => {
  console.log('=== CLEANING AND REPOPULATING NEWS ===');

  // Step 1: Delete all existing news
  console.log('Step 1: Deleting all existing news from database...');
  const deleteResult = await deleteAllNews();
  console.log(`Deleted ${deleteResult.deleted} fake news items`);

  // Step 2: Force fetch fresh real news using agent architecture
  console.log(`Step 2: Fetching real news from agents (language: ${language})...`);
  try {
    const result = await getPersonalizedNewsFeed(userProfile, true, 15, language); // force refresh, get 15 items

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

/**
 * Image recognition result for branded product identification
 */
export interface ImageRecognitionResult {
  success: boolean;
  brandName?: string;
  productType?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  description?: string;
  errorMessage?: string;
}

/**
 * Recognize branded products from an image using Gemini Vision API
 * Identifies the brand/company behind a product in a photo
 */
export const recognizeBrandedProduct = async (
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ImageRecognitionResult> => {
  try {
    console.log('[ImageRecognition] Starting brand recognition...');

    const prompt = `Analyze this image and identify any branded products, company logos, or organizational symbols.

TASK:
1. Look for visible brand names, logos, trademarks, or identifiable branded products
2. Identify the parent company or organization behind any brands found
3. Be specific about what you see - don't guess if the brand is not clearly visible

IMPORTANT RULES:
- Only identify brands that are CLEARLY visible in the image (text, logo, distinctive design)
- If you see a generic product without clear branding, respond with confidence: "NONE"
- If you see a product but can only guess the brand based on shape/design (not clear branding), confidence should be "LOW"
- For clearly visible brand names/logos, confidence should be "HIGH"

RESPONSE FORMAT (JSON):
{
  "brandFound": true/false,
  "brandName": "Company/Brand Name" or null,
  "productType": "Brief description of the product" or null,
  "confidence": "HIGH" | "MEDIUM" | "LOW" | "NONE",
  "description": "Brief explanation of what was identified and how"
}

Examples:
- Tesla car with visible logo → {"brandFound": true, "brandName": "Tesla", "productType": "Electric vehicle", "confidence": "HIGH", "description": "Tesla logo clearly visible on the vehicle"}
- iPhone with Apple logo → {"brandFound": true, "brandName": "Apple", "productType": "Smartphone", "confidence": "HIGH", "description": "Apple logo visible on the device"}
- Generic coffee mug no branding → {"brandFound": false, "brandName": null, "productType": "Coffee mug", "confidence": "NONE", "description": "No visible brand or logo on the product"}
- Car that looks like BMW but no clear logo → {"brandFound": true, "brandName": "BMW", "productType": "Automobile", "confidence": "LOW", "description": "Vehicle design suggests BMW but no clear branding visible"}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text || '{}';
    console.log('[ImageRecognition] Raw response:', resultText);

    const result = JSON.parse(resultText);

    if (result.brandFound && result.brandName && (result.confidence === 'HIGH' || result.confidence === 'MEDIUM')) {
      console.log(`[ImageRecognition] Brand identified: ${result.brandName} (${result.confidence})`);
      return {
        success: true,
        brandName: result.brandName,
        productType: result.productType,
        confidence: result.confidence,
        description: result.description
      };
    } else if (result.brandFound && result.brandName && result.confidence === 'LOW') {
      console.log(`[ImageRecognition] Low confidence brand: ${result.brandName}`);
      return {
        success: true,
        brandName: result.brandName,
        productType: result.productType,
        confidence: 'LOW',
        description: result.description
      };
    } else {
      console.log('[ImageRecognition] No brand identified');
      return {
        success: false,
        confidence: 'NONE',
        description: result.description || 'No identifiable brand or logo found in the image',
        productType: result.productType
      };
    }
  } catch (error: any) {
    console.error('[ImageRecognition] Error:', error);
    return {
      success: false,
      confidence: 'NONE',
      errorMessage: error.message || 'Failed to analyze image'
    };
  }
};
