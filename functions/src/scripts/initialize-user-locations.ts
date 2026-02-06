/**
 * One-time batch script to initialize location data for existing users.
 *
 * This script:
 * 1. Fetches all users who have birthCountry or currentCountry
 * 2. Skips users who already have location records
 * 3. Analyzes locations using Gemini 2.5 Flash
 * 4. Stores in users/{userId}/users_countries_locations subcollection
 *
 * Run: npx ts-node src/scripts/initialize-user-locations.ts
 */
import * as admin from 'firebase-admin';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI } from "@google/genai";

const secretClient = new SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';

// Cache for Gemini API key
let geminiApiKey: string | null = null;

/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) {
    return geminiApiKey;
  }

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
    });

    const payload = version.payload?.data?.toString();
    if (payload) {
      geminiApiKey = payload;
      console.log('✅ Gemini API key loaded from Secret Manager');
      return payload;
    }
  } catch (error) {
    console.error('Failed to load Gemini API key from Secret Manager:', error);
  }

  return '';
}

/**
 * Analyzes user's birth and current country locations using Gemini 2.5 Flash.
 */
async function analyzeUserCountryLocations(userData: {
  birthCountry?: string;
  currentCountry?: string;
  currentState?: string;
}) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Failed to load Gemini API key');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
You are a geolocation expert. Generate precise location data for a user's geographic information.

IMPORTANT: Return ONLY pure JSON, no markdown, no code blocks, no explanations.

User Data:
- Birth Country: ${userData.birthCountry || 'Not specified'}
- Current Country: ${userData.currentCountry || 'Not specified'}
- Current State/Province: ${userData.currentState || 'Not specified'}

Rules:
1. For birth country: return country capital city coordinates
2. For current location:
   - If state/province is "London", treat it as a city in UK, return UK capital (London coordinates)
   - If state is a number or invalid, ignore it and use country capital only
   - If state is valid (like "New York", "Ontario", "山东省"), return both state capital AND country capital
   - If only country provided, return country capital only
3. Use null for missing values, not the string "null"
4. Return ONLY the JSON object, nothing else

Return format (PURE JSON ONLY):
{
  "birthCountry": "Full country name",
  "birthCountryCode": "ISO code",
  "birthCountryCapital": {
    "name": "Capital city name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  },
  "currentCountry": "Full country name",
  "currentCountryCode": "ISO code",
  "currentState": "State name or null",
  "currentStateCapital": {
    "name": "State capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  },
  "currentCountryCapital": {
    "name": "Country capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  },
  "confidence": "HIGH"
}

Examples:
- Birth: "China" → {"birthCountry": "China", "birthCountryCode": "CN", "birthCountryCapital": {"name": "Beijing", "coordinates": {"latitude": 39.9042, "longitude": 116.4074}}}
- Current: "United States", State: "New York" → {"currentCountry": "United States", "currentCountryCode": "US", "currentState": "New York", "currentStateCapital": {"name": "Albany", "coordinates": {"latitude": 42.6526, "longitude": -73.7562}}, "currentCountryCapital": {"name": "Washington, D.C.", "coordinates": {"latitude": 38.9072, "longitude": -77.0369}}}
- Current: "United Kingdom", State: "London" → {"currentCountry": "United Kingdom", "currentCountryCode": "GB", "currentState": null, "currentStateCapital": null, "currentCountryCapital": {"name": "London", "coordinates": {"latitude": 51.5074, "longitude": -0.1278}}}
`;

  const result = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 1000,
      responseMimeType: 'application/json'
    }
  });

  const response = result.text;

  // Clean response - remove markdown code blocks if present
  let cleanedResponse = response?.trim() || '';
  cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Parse JSON response
  const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.error('Failed to parse AI response:', cleanedResponse);
    throw new Error('Failed to parse user location data from AI response');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseError: any) {
    console.error('JSON parse error:', parseError.message);
    console.error('Attempted to parse:', jsonMatch[0].substring(0, 200));
    throw new Error('Failed to parse user location data: ' + parseError.message);
  }
}

/**
 * Main initialization function
 */
async function initializeUserLocations() {
  console.log('🚀 Starting user location initialization...\n');

  // Initialize Firebase Admin if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });

    console.log('✅ Firebase Admin initialized for project: stanseproject\n');
  }

  const db = admin.firestore();

  try {
    // Fetch all users
    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} total users\n`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      // Extract location data from onboarding.demographics or top-level fields
      const birthCountry = userData.birthCountry || userData.onboarding?.demographics?.birthCountry;
      const currentCountry = userData.currentCountry || userData.onboarding?.demographics?.currentCountry;
      const currentState = userData.currentState || userData.onboarding?.demographics?.currentState;

      // Skip if no location data
      if (!birthCountry && !currentCountry) {
        skipped++;
        continue;
      }

      // Skip if user already has location records
      const existingLocations = await db
        .collection('users')
        .doc(userId)
        .collection('users_countries_locations')
        .limit(1)
        .get();

      if (!existingLocations.empty) {
        console.log(`⏭️  Skipping ${userId.substring(0, 12)} - already has location data`);
        skipped++;
        continue;
      }

      try {
        console.log(`📍 Processing user ${userId.substring(0, 12)}...`);
        console.log(`    Birth: ${birthCountry || 'N/A'}, Current: ${currentCountry || 'N/A'}, State: ${currentState || 'N/A'}`);
        const startTime = Date.now();

        // Analyze location
        const locationData = await analyzeUserCountryLocations({
          birthCountry,
          currentCountry,
          currentState,
        });

        // Store in subcollection
        await db
          .collection('users')
          .doc(userId)
          .collection('users_countries_locations')
          .add({
            userId,
            ...locationData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            aiModel: 'gemini-2.5-flash',
            processingTimeMs: Date.now() - startTime,
            sourceData: {
              birthCountry,
              currentCountry,
              currentState,
            },
          });

        console.log(`✅ Success for ${userId} (${Date.now() - startTime}ms)\n`);
        succeeded++;

      } catch (error: any) {
        console.error(`❌ Failed for ${userId}:`, error.message);
        failed++;
      }

      processed++;

      // Rate limiting: wait 1 second between requests to avoid API quota
      if (processed % 10 === 0) {
        console.log(`\n--- Progress: ${processed}/${usersSnapshot.size} (${succeeded} succeeded, ${failed} failed, ${skipped} skipped) ---\n`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n✅ Initialization complete!');
    console.log(`Total users: ${usersSnapshot.size}`);
    console.log(`Processed: ${processed}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
initializeUserLocations()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
